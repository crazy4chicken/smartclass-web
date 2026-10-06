import { http } from '@/api/http'
import { collectPages, toPage } from '@/api/cursor'
import type {
  EffectivePasswordPolicy,
  LoginActivity,
  Page,
  Passkey,
  PasswordChangeResult,
  SessionInfo,
  TotpEnrollment,
  UserProfile,
} from '@/api/types'

/** `PATCH /me` — updates the signed-in user's username and/or display name. */
export async function updateProfile(body: { username?: string; display_name?: string }): Promise<UserProfile> {
  const { data } = await http.patch<UserProfile>('/me', body)
  return data
}

/** `POST /me/password` — rotates the password; every refresh session is revoked by the service. */
export async function changePassword(body: {
  current_password: string
  new_password: string
}): Promise<PasswordChangeResult> {
  const { data } = await http.post<PasswordChangeResult>('/me/password', body)
  return data
}

/** `GET /me/password-policy` — the fully resolved policy currently applied to the user. */
export async function fetchPasswordPolicy(): Promise<EffectivePasswordPolicy> {
  const { data } = await http.get<EffectivePasswordPolicy>('/me/password-policy')
  return data
}

/** `POST /me/totp/enroll` — starts TOTP enrollment; the secret is pending until confirmed. */
export async function startTotpEnrollment(): Promise<TotpEnrollment> {
  const { data } = await http.post<TotpEnrollment>('/me/totp/enroll')
  return data
}

/** `POST /me/totp/confirm` — activates the pending secret and returns ten one-time backup codes. */
export async function confirmTotpEnrollment(code: string): Promise<string[]> {
  const { data } = await http.post<{ backup_codes: string[] }>('/me/totp/confirm', { code })
  return data.backup_codes ?? []
}

/** `DELETE /me/totp` — disables TOTP; requires a current TOTP code or an unused backup code. */
export async function disableTotp(code: string): Promise<void> {
  await http.delete('/me/totp', { data: { code } })
}

/** `POST /me/totp/backup-codes` — replaces all backup codes; requires the current password. */
export async function regenerateBackupCodes(password: string): Promise<string[]> {
  const { data } = await http.post<{ backup_codes: string[] }>('/me/totp/backup-codes', { password })
  return data.backup_codes ?? []
}

/**
 * `GET /me/passkeys` — the caller's registered passkey identifiers, walking every
 * page. v0.5.0 pages are ordered by credential id (lexicographic), not by
 * registration order, so callers must not rely on the previous ordering.
 */
export async function fetchPasskeys(): Promise<Passkey[]> {
  return collectPages(async (cursor) => {
    const { data } = await http.get<Page<Passkey> | Passkey[]>('/me/passkeys', {
      params: cursor === '' ? undefined : { cursor },
    })
    return toPage(data)
  })
}

/** `POST /me/passkeys/register/begin` — returns the WebAuthn creation options under `publicKey`. */
export async function beginPasskeyRegistration(): Promise<Record<string, unknown>> {
  const { data } = await http.post<{ publicKey: Record<string, unknown> }>('/me/passkeys/register/begin')
  return data.publicKey ?? {}
}

/** `POST /me/passkeys/register/finish` — submits the serialized attestation. */
export async function finishPasskeyRegistration(credential: Record<string, unknown>): Promise<void> {
  await http.post('/me/passkeys/register/finish', credential)
}

/** `DELETE /me/passkeys/{credID}` — removes one passkey by its base64url credential id. */
export async function deletePasskey(credentialId: string): Promise<void> {
  await http.delete(`/me/passkeys/${encodeURIComponent(credentialId)}`)
}

/**
 * `GET /me/sessions` — active, unexpired refresh sessions of the bearer user,
 * ordered by `(created_at, id)` ascending and walked to the last page.
 */
export async function fetchSessions(): Promise<SessionInfo[]> {
  return collectPages(async (cursor) => {
    const { data } = await http.get<Page<SessionInfo> | SessionInfo[]>('/me/sessions', {
      params: cursor === '' ? undefined : { cursor },
    })
    return toPage(data)
  })
}

/** `DELETE /me/sessions/{id}` — revokes one session. */
export async function revokeSession(sessionId: string): Promise<void> {
  await http.delete(`/me/sessions/${encodeURIComponent(sessionId)}`)
}

/**
 * `GET /me/activity` — descending page of the caller's login attempts. The
 * cursor is opaque: v0.5.0 returns a decimal string and terminates with `""`,
 * so it is passed back unchanged (never coerced to a number).
 */
export async function fetchLoginActivity(cursor: string, limit: number): Promise<Page<LoginActivity>> {
  const { data } = await http.get<Page<LoginActivity>>('/me/activity', {
    params: cursor === '' ? { limit } : { cursor, limit },
  })
  return data
}

/** `POST /me/email` — requests an email change; a verification token is sent to the new address. */
export async function requestEmailChange(body: { new_email: string; password: string }): Promise<void> {
  await http.post('/me/email', body)
}

/** `POST /me/email/confirm` — consumes the token sent to the replacement address. */
export async function confirmEmailChange(token: string): Promise<void> {
  await http.post('/me/email/confirm', { token })
}

/** `GET /me/export` — downloads the account data export as a Blob. */
export async function exportAccountData(): Promise<Blob> {
  const { data } = await http.get<Blob>('/me/export', { responseType: 'blob' })
  return data
}

/** `DELETE /me` — irreversibly erases the account; the password is rechecked. */
export async function deleteAccount(password: string): Promise<void> {
  await http.delete('/me', { data: { password } })
}
