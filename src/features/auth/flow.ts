import type { LoginResponse } from '@/api/types'
import router from '@/router'
import { useAuthStore } from '@/stores/auth'

/** sessionStorage key of the restricted token from a `mfa_required` / `mfa_enrollment_required` login. */
export const MFA_TOKEN_KEY = 'iam.mfa_token'

/** sessionStorage key of the ten-minute `change_token` returned with a 403 `password_change_required`. */
export const CHANGE_TOKEN_KEY = 'iam.change_token'

export type LoginOutcome = 'tokens' | 'mfa' | 'enrollment' | 'unknown'

/** Redirect target from a `?redirect=` query value; only same-site absolute paths are honored. */
export function redirectTarget(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return '/iam'
  }
  return value
}

/**
 * Applies a login response shared by password, passkey and OIDC sign-in: stores the token pair and
 * navigates, or forwards to the MFA challenge / forced TOTP enrollment using the restricted token.
 */
export async function applyLoginResponse(data: LoginResponse, redirect: string): Promise<LoginOutcome> {
  const auth = useAuthStore()
  if (data.access_token) {
    auth.setTokens(data.access_token, data.refresh_token ?? '')
    try {
      await auth.fetchProfile()
    } catch {
      // AppLayout retries the profile fetch on mount; a failure must not block the sign-in.
    }
    await router.push(redirect)
    return 'tokens'
  }
  const restrictedToken = data.mfa_token ?? ''
  if (data.mfa_enrollment_required && restrictedToken) {
    sessionStorage.setItem(MFA_TOKEN_KEY, restrictedToken)
    await router.push({ path: '/iam/mfa/enroll', query: redirect === '/iam' ? {} : { redirect } })
    return 'enrollment'
  }
  if (data.mfa_required && restrictedToken) {
    sessionStorage.setItem(MFA_TOKEN_KEY, restrictedToken)
    await router.push({ path: '/iam/mfa', query: redirect === '/iam' ? {} : { redirect } })
    return 'mfa'
  }
  return 'unknown'
}
