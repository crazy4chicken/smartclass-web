import axios from 'axios'

import { ApiError, http } from '@/api/http'
import type {
  LoginResponse,
  MfaEnrollmentCompleteResponse,
  PasswordChangeResult,
  ProblemDetails,
  TokenPair,
  TotpEnrollment,
} from '@/api/types'
import { errorMessage } from '@/utils/error'

/** `POST /auth/login` response: a token pair, an MFA step, or a 403 problem that may carry `change_token`. */
export type LoginAttemptData = LoginResponse & { change_token?: string } & Partial<ProblemDetails>

/** Raw outcome of `POST /auth/login`; 4xx problem+json bodies are returned instead of thrown. */
export interface LoginAttempt {
  status: number
  data: LoginAttemptData
}

/** Chinese message for a non-2xx `POST /auth/login` attempt (raw problem+json body → ApiError → message). */
export function loginFailureMessage(attempt: LoginAttempt): string {
  const { status, data } = attempt
  if (status === 401) {
    // The service deliberately stays generic here; on the login form a 401 means
    // wrong credentials (or an account without any password credential).
    return '用户名或密码错误'
  }
  return errorMessage(
    new ApiError(status, data.title ?? '', data.detail ?? '', data.type ?? '', data.instance ?? ''),
  )
}

function toApiError(error: unknown): ApiError {
  if (!axios.isAxiosError(error)) {
    return new ApiError(0, '网络错误')
  }
  const status = error.response?.status ?? 0
  const body = error.response?.data as Partial<ProblemDetails> | undefined
  if (body && (typeof body.title === 'string' || typeof body.detail === 'string')) {
    return new ApiError(status, body.title ?? '', body.detail ?? '', body.type ?? '', body.instance ?? '')
  }
  if (status === 0) {
    return new ApiError(0, '网络错误', error.message)
  }
  return new ApiError(status, error.response?.statusText || '请求失败')
}

/**
 * Password sign-in. `validateStatus` keeps 4xx responses resolvable so the caller can read the
 * 403 `password_change_required` body (which carries the short-lived `change_token`) and the
 * 200 MFA branches instead of losing them to the shared error normalizer.
 */
export async function loginWithPassword(username: string, password: string): Promise<LoginAttempt> {
  const response = await http.post<LoginAttemptData>(
    '/auth/login',
    { username, password },
    { validateStatus: (status) => status < 500 },
  )
  return { status: response.status, data: response.data }
}

/** `POST /auth/login/mfa` — completes a password or passkey login that returned `mfa_required`. */
export async function completeMfaLogin(mfaToken: string, code: string): Promise<TokenPair> {
  const { data } = await http.post<TokenPair>('/auth/login/mfa', { mfa_token: mfaToken, code })
  return data
}

/** `POST /auth/login/mfa/enroll/begin` — starts the forced TOTP enrollment for a restricted token. */
export async function beginMfaEnrollment(mfaToken: string): Promise<TotpEnrollment> {
  const { data } = await http.post<TotpEnrollment>('/auth/login/mfa/enroll/begin', { mfa_token: mfaToken })
  return data
}

/** `POST /auth/login/mfa/enroll/complete` — activates TOTP and returns a full token pair plus backup codes. */
export async function completeMfaEnrollment(
  mfaToken: string,
  code: string,
): Promise<MfaEnrollmentCompleteResponse> {
  const { data } = await http.post<MfaEnrollmentCompleteResponse>('/auth/login/mfa/enroll/complete', {
    mfa_token: mfaToken,
    code,
  })
  return data
}

/** `POST /auth/register` — public self-registration; returns the created account id and status. */
export async function registerAccount(body: {
  username: string
  email: string
  password: string
  display_name?: string
}): Promise<{ id: string; status: string }> {
  const { data } = await http.post<Record<string, string>>('/auth/register', body)
  return { id: data.id ?? '', status: data.status ?? '' }
}

/** `POST /auth/password-reset/request` — always 204, so account existence is never disclosed. */
export async function requestPasswordReset(login: string): Promise<void> {
  await http.post('/auth/password-reset/request', { login })
}

/** `POST /auth/password-reset/confirm` — consumes the one-time reset token. */
export async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await http.post('/auth/password-reset/confirm', { token, new_password: newPassword })
}

/** `POST /auth/verify-email` — consumes the one-time verification token. */
export async function verifyEmail(token: string): Promise<void> {
  await http.post('/auth/verify-email', { token })
}

/** `POST /auth/invite/accept` — sets the initial password for an invited account. */
export async function acceptInvitation(body: {
  token: string
  password: string
  display_name?: string
}): Promise<void> {
  await http.post('/auth/invite/accept', body)
}

/** `GET /auth/oidc/callback` — exchanges the issuer `code`/`state` for a login response. */
export async function completeOidcLogin(code: string, state: string): Promise<LoginResponse> {
  const { data } = await http.get<LoginResponse>('/auth/oidc/callback', { params: { code, state } })
  return data
}

/** Absolute URL of `GET /auth/oidc/begin`; the endpoint 302-redirects to the configured issuer. */
export const OIDC_BEGIN_URL = `${http.defaults.baseURL ?? '/iam-api'}/auth/oidc/begin`

/** `POST /auth/passkey/login/begin` — returns the WebAuthn request options under `publicKey`. */
export async function beginPasskeyLogin(username?: string): Promise<Record<string, unknown>> {
  const body = username ? { username } : {}
  const { data } = await http.post<{ publicKey: Record<string, unknown> }>('/auth/passkey/login/begin', body)
  return data.publicKey ?? {}
}

/** `POST /auth/passkey/login/finish` — submits the serialized assertion. */
export async function finishPasskeyLogin(credential: Record<string, unknown>): Promise<LoginResponse> {
  const { data } = await http.post<LoginResponse>('/auth/passkey/login/finish', credential)
  return data
}

/**
 * `POST /me/password` authenticated with the short-lived first-login `change_token` instead of an
 * access token. A bare axios call is required because `http` would overwrite the Authorization
 * header with the (empty) session token.
 */
export async function changePasswordWithChangeToken(
  changeToken: string,
  body: { current_password: string; new_password: string },
): Promise<PasswordChangeResult> {
  try {
    const { data } = await axios.post<PasswordChangeResult>(
      `${http.defaults.baseURL ?? '/iam-api'}/me/password`,
      body,
      { headers: { Authorization: `Bearer ${changeToken}` } },
    )
    return data
  } catch (error) {
    throw toApiError(error)
  }
}
