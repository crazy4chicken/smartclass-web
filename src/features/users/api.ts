import { http } from '@/api/http'
import type {
  BatchResults,
  Credential,
  EffectivePasswordPolicy,
  ImportResults,
  Page,
  SessionInfo,
  User,
} from '@/api/types'

/**
 * `GET /users/` — the specification exposes no filter parameters for this endpoint,
 * so only the cursor paging parameters are sent (filtering is done on the loaded page).
 */
export function listUsers(cursor: string, limit: number): Promise<Page<User>> {
  const params: Record<string, string | number> = { limit }
  if (cursor !== '') {
    params.cursor = cursor
  }
  return http.get<Page<User>>('/users/', { params }).then((response) => response.data)
}

/** `POST /users/` request body. */
export interface CreateUserPayload {
  username: string
  display_name?: string
  email?: string | null
  /** Takes precedence over `initial_password` when both are supplied. */
  password?: string
  initial_password?: string
}

/** `POST /users/` — creates an active user. */
export function createUser(payload: CreateUserPayload): Promise<User> {
  return http.post<User>('/users/', payload).then((response) => response.data)
}

/** `GET /users/{id}` */
export function getUser(id: string): Promise<User> {
  return http.get<User>(`/users/${id}`).then((response) => response.data)
}

/** `PATCH /users/{id}` request body; at least one field is required. */
export interface UpdateUserPayload {
  username?: string | null
  display_name?: string | null
  email?: string | null
  /** `active` or `disabled`. */
  status?: string | null
}

/** `PATCH /users/{id}` — administrative profile or status change. */
export function updateUser(id: string, payload: UpdateUserPayload): Promise<User> {
  return http.patch<User>(`/users/${id}`, payload).then((response) => response.data)
}

/** `DELETE /users/{id}` — hard deletion. */
export function deleteUser(id: string): Promise<void> {
  return http.delete(`/users/${id}`).then(() => undefined)
}

/**
 * `POST /users/{id}/disable` — dedicated lock switch: resets lockout state,
 * revokes sessions and invalidates permission versions.
 */
export function disableUser(id: string): Promise<User> {
  return http.post<User>(`/users/${id}/disable`).then((response) => response.data)
}

export type UserBatchOp = 'enable' | 'disable'

/** `POST /users/batch` — up to 500 ids, each processed independently. */
export function batchUsers(op: UserBatchOp, ids: string[]): Promise<BatchResults> {
  return http.post<BatchResults>('/users/batch', { op, ids }).then((response) => response.data)
}

/**
 * `POST /users/import` — `text/csv` body with the exact header
 * `username,email,display_name,password` and at most 500 data rows.
 */
export function importUsers(csv: string): Promise<ImportResults> {
  return http
    .post<ImportResults>('/users/import', csv, { headers: { 'Content-Type': 'text/csv' } })
    .then((response) => response.data)
}

/** `POST /users/{id}/approve` — records the administrator as approver. */
export function approveUser(id: string): Promise<User> {
  return http.post<User>(`/users/${id}/approve`).then((response) => response.data)
}

export type CredentialKind = 'password' | 'service'

/** `POST /users/{id}/credentials` request body. */
export interface CreateCredentialPayload {
  kind: CredentialKind
  /** Required when `kind` is `password`. */
  password?: string
}

/**
 * `POST /users/{id}/credentials` response: an open string map. A `service`
 * credential carries the generated secret exactly once — it is never returned again.
 */
export type CredentialResult = Credential & Record<string, string>

export function createUserCredential(
  id: string,
  payload: CreateCredentialPayload,
): Promise<CredentialResult> {
  return http
    .post<CredentialResult>(`/users/${id}/credentials`, payload)
    .then((response) => response.data)
}

/** `GET /users/{id}/sessions` — returns a bare array, not a cursor page. */
export function listUserSessions(id: string): Promise<SessionInfo[]> {
  return http.get<SessionInfo[]>(`/users/${id}/sessions`).then((response) => response.data)
}

/** `DELETE /users/{id}/sessions/{sid}` — revokes one device session. */
export function revokeUserSession(id: string, sid: string): Promise<void> {
  return http.delete(`/users/${id}/sessions/${sid}`).then(() => undefined)
}

/** `DELETE /users/{id}/sessions` — revokes every refresh session of the user. */
export function revokeAllUserSessions(id: string): Promise<void> {
  return http.delete(`/users/${id}/sessions`).then(() => undefined)
}

/** `DELETE /users/{id}/totp` — removes active, pending and backup-code credentials. */
export function resetUserTotp(id: string): Promise<void> {
  return http.delete(`/users/${id}/totp`).then(() => undefined)
}

/** `GET /users/{id}/password-policy` — fully resolved password policy for the user. */
export function getUserPasswordPolicy(id: string): Promise<EffectivePasswordPolicy> {
  return http
    .get<EffectivePasswordPolicy>(`/users/${id}/password-policy`)
    .then((response) => response.data)
}
