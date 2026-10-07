import { http } from '@/api/http'
import type { MfaPolicy, Page, PasswordPolicy } from '@/api/types'

/**
 * Payload for `POST /policies/mfa`.
 * `subject_kind` and `required` are required; `subject_id` is required for
 * team/group/role subjects and omitted for the `default` population.
 */
export interface MfaPolicyCreatePayload {
  subject_kind: string
  required: boolean
  name?: string
  subject_id?: string
  deny_unenrolled?: boolean
  priority?: number
}

/** Payload for `PATCH /policies/mfa/{id}` — omitted fields stay unchanged, `null` clears them. */
export interface MfaPolicyUpdatePayload {
  name?: string | null
  subject_kind?: string | null
  subject_id?: string | null
  required?: boolean | null
  deny_unenrolled?: boolean | null
  priority?: number | null
}

/**
 * Payload for `POST /policies/password`.
 * `subject_kind` and `subject_id` are required; unset (null) fields inherit defaults.
 */
export interface PasswordPolicyCreatePayload {
  subject_kind: string
  subject_id: string
  name?: string
  priority?: number
  min_length?: number | null
  history_count?: number | null
  breach_check?: boolean | null
  require_upper?: boolean | null
  require_lower?: boolean | null
  require_letter?: boolean | null
  require_digit?: boolean | null
  require_symbol?: boolean | null
}

/** Payload for `PATCH /policies/password/{id}` — `null` clears a nullable field so it inherits again. */
export interface PasswordPolicyUpdatePayload {
  name?: string
  subject_kind?: string
  subject_id?: string
  priority?: number
  min_length?: number | null
  history_count?: number | null
  breach_check?: boolean | null
  require_upper?: boolean | null
  require_lower?: boolean | null
  require_letter?: boolean | null
  require_digit?: boolean | null
  require_symbol?: boolean | null
}

/** `GET /policies/mfa` — cursor pages of MFA policies. */
export async function listMfaPolicies(cursor: string, limit: number): Promise<Page<MfaPolicy>> {
  const { data } = await http.get<Page<MfaPolicy>>('/policies/mfa', { params: { cursor, limit } })
  return data
}

/** `POST /policies/mfa` — create an MFA requirement for users, teams, groups or roles. */
export async function createMfaPolicy(payload: MfaPolicyCreatePayload): Promise<MfaPolicy> {
  const { data } = await http.post<MfaPolicy>('/policies/mfa', payload)
  return data
}

/** `PATCH /policies/mfa/{id}` — partially update an MFA policy. */
export async function updateMfaPolicy(id: string, payload: MfaPolicyUpdatePayload): Promise<MfaPolicy> {
  const { data } = await http.patch<MfaPolicy>(`/policies/mfa/${id}`, payload)
  return data
}

/** `DELETE /policies/mfa/{id}` — remove an MFA policy. */
export async function deleteMfaPolicy(id: string): Promise<void> {
  await http.delete(`/policies/mfa/${id}`)
}

/** `GET /policies/password` — cursor pages of password policies. */
export async function listPasswordPolicies(cursor: string, limit: number): Promise<Page<PasswordPolicy>> {
  const { data } = await http.get<Page<PasswordPolicy>>('/policies/password', { params: { cursor, limit } })
  return data
}

/** `POST /policies/password` — create a password policy; unset fields inherit defaults. */
export async function createPasswordPolicy(payload: PasswordPolicyCreatePayload): Promise<PasswordPolicy> {
  const { data } = await http.post<PasswordPolicy>('/policies/password', payload)
  return data
}

/** `PATCH /policies/password/{id}` — partially update a password policy. */
export async function updatePasswordPolicy(id: string, payload: PasswordPolicyUpdatePayload): Promise<PasswordPolicy> {
  const { data } = await http.patch<PasswordPolicy>(`/policies/password/${id}`, payload)
  return data
}

/** `DELETE /policies/password/{id}` — remove a password policy. */
export async function deletePasswordPolicy(id: string): Promise<void> {
  await http.delete(`/policies/password/${id}`)
}
