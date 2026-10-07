import axios from 'axios'
import type { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios'

import type { ProblemDetails, TokenPair } from '@/api/types'
import { requestStepUp } from '@/features/auth/stepup'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'

/** localStorage keys holding the IAM token pair. */
export const ACCESS_TOKEN_KEY = 'smartclass.iam.access'
export const REFRESH_TOKEN_KEY = 'smartclass.iam.refresh'

/** Endpoints that must never trigger a token refresh (they are the auth flow itself). */
const AUTH_FLOW_PATHS = ['/auth/login', '/auth/refresh', '/auth/logout']

/** Bearer-token issuer base; also the target of the single-flight refresh. */
const IAM_BASE = import.meta.env.VITE_IAM_BASE || '/iam-api'

/** smartclass-dispatchub base; requests keep the service's own paths (`/api/v1/...`, `/healthz`). */
const DISPATCH_BASE = import.meta.env.VITE_DISPATCH_BASE || '/dispatch-api'

/** nsc-filehouse base; requests keep the service's own paths (`/api/v1/...`, `/presign/...`, `/healthz`). */
const FILE_BASE = import.meta.env.VITE_FILE_BASE || '/file-api'

/** Endpoints that do not need an Authorization header. */
const PUBLIC_REQUEST_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/password-reset',
  '/auth/verify-email',
  '/auth/invite/accept',
  '/auth/oidc',
  '/auth/passkey',
  '/.well-known/',
]

/** Normalized error thrown by every request made through {@link http}. */
export class ApiError extends Error {
  readonly status: number
  readonly title: string
  readonly detail: string
  readonly type: string
  readonly instance: string

  constructor(status: number, title: string, detail = '', type = '', instance = '') {
    super(detail || title)
    this.name = 'ApiError'
    this.status = status
    this.title = title
    this.detail = detail
    this.type = type
    this.instance = instance
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && ('title' in value || 'detail' in value)
}

function toApiError(error: AxiosError<unknown>): ApiError {
  const response = error.response
  if (!response) {
    return new ApiError(0, '网络错误', error.message || 'network error')
  }
  const { status, statusText, data } = response
  if (isProblemDetails(data)) {
    return new ApiError(status, asString(data.title), asString(data.detail), asString(data.type), asString(data.instance))
  }
  if (typeof data === 'string' && data.trim()) {
    return new ApiError(status, statusText || '请求失败', data.trim().slice(0, 200))
  }
  return new ApiError(status, statusText || '请求失败')
}

function syncTokensIntoStore(accessToken: string | null, refreshToken: string | null): void {
  try {
    const auth = useAuthStore()
    if (accessToken && refreshToken) {
      auth.setTokens(accessToken, refreshToken)
    } else {
      auth.clear()
    }
  } catch {
    // No active pinia instance (e.g. a refresh outside the app); localStorage is authoritative already.
  }
}

type RetryableConfig = InternalAxiosRequestConfig & { _authRetried?: boolean; _stepUpRetried?: boolean }

/**
 * Builds a client that shares the bearer token, the single-flight refresh and the
 * step-up replay. Every service client in the app is created here so the behaviour
 * cannot drift between them.
 */
function createClient(baseURL: string): AxiosInstance {
  const instance = axios.create({ baseURL })

  instance.interceptors.request.use((config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
    const url = config.url ?? ''
    if (token && !PUBLIC_REQUEST_PATHS.some((path) => url.startsWith(path))) {
      config.headers.set('Authorization', `Bearer ${token}`)
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      if (!axios.isAxiosError(error)) {
        return Promise.reject(error)
      }
      const apiError = toApiError(error)
      const config = error.config as RetryableConfig | undefined
      const url = config?.url ?? ''
      const canRefresh =
        error.response?.status === 401 &&
        !!config &&
        !config._authRetried &&
        !AUTH_FLOW_PATHS.some((path) => url.startsWith(path)) &&
        !!localStorage.getItem(REFRESH_TOKEN_KEY)
      if (config && canRefresh) {
        config._authRetried = true
        try {
          await refreshAccessToken()
          return await instance(config)
        } catch (refreshError) {
          // Only a refresh the service itself rejected means the session is gone. A network
          // failure, a timeout or a 5xx must not sign the user out - and never navigates:
          // the original request is rejected so its caller reports the error in place.
          if (isRefreshRejected(refreshError)) {
            await forceLogin()
          }
          return Promise.reject(apiError)
        }
      }
      // Step-up means the access token is valid but its `auth_time` claim is stale.
      // `/auth/refresh` does not renew `auth_time`, so a fresh password login is the only remedy.
      const canStepUp =
        apiError.status === 403 &&
        !!config &&
        !config._stepUpRetried &&
        !AUTH_FLOW_PATHS.some((path) => url.startsWith(path)) &&
        (apiError.detail === 'step_up_required' || apiError.title === 'step_up_required')
      if (config && canStepUp) {
        config._stepUpRetried = true
        try {
          await requestStepUp()
          return await instance(config)
        } catch {
          return Promise.reject(apiError)
        }
      }
      return Promise.reject(apiError)
    },
  )

  return instance
}

export const http = createClient(IAM_BASE)

/** smartclass-dispatchub client; call sites pass the service's own paths (`/api/v1/...`). */
export const hubHttp = createClient(DISPATCH_BASE)

/** nsc-filehouse client; call sites pass the service's own paths (`/api/v1/...`, `/presign/...`). */
export const fileHttp = createClient(FILE_BASE)


/** In-flight refresh shared by concurrent 401s (single flight). */
let refreshPromise: Promise<string> | null = null

function refreshAccessToken(): Promise<string> {
  if (!refreshPromise) {
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

async function performRefresh(): Promise<string> {
  // Bare axios instance on purpose: the instance interceptors must not observe the refresh call.
  const { data } = await axios.post<TokenPair>(`${IAM_BASE}/auth/refresh`, {
    refresh_token: localStorage.getItem(REFRESH_TOKEN_KEY) ?? '',
  })
  localStorage.setItem(ACCESS_TOKEN_KEY, data.access_token)
  localStorage.setItem(REFRESH_TOKEN_KEY, data.refresh_token)
  syncTokensIntoStore(data.access_token, data.refresh_token)
  return data.access_token
}

/**
 * Whether the refresh endpoint itself rejected the refresh token. Anything else -
 * no response, a timeout, a 5xx - is a service failure that must not end the
 * session nor navigate the user away.
 */
function isRefreshRejected(error: unknown): boolean {
  if (!axios.isAxiosError(error)) {
    return false
  }
  const status = error.response?.status ?? 0
  return status === 401 || status === 403
}

async function forceLogin(): Promise<void> {
  localStorage.removeItem(ACCESS_TOKEN_KEY)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  syncTokensIntoStore(null, null)
  if (router.currentRoute.value.path !== '/iam/login') {
    await router.push('/iam/login')
  }
}
