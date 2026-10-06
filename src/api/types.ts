/**
 * TypeScript mirrors of the IAM OpenAPI specification (iam-openapi.yaml at the repo root).
 * Field names, optionality and nullability follow the spec exactly — do not rename fields here.
 */

/** RFC 9457 problem+json error payload returned by the IAM service. */
export interface ProblemDetails {
  type: string
  title: string
  status: number
  detail?: string
  instance?: string
}

/**
 * Cursor-paginated envelope returned by every collection endpoint.
 * `next_cursor` is an opaque key: pass it back verbatim and stop only on the
 * terminal value — `""` since teamusers v0.5.0, the number `0` on legacy
 * releases. Never parse or coerce it into a page number.
 */
export interface Page<T> {
  items: T[]
  next_cursor: string | number
}

/** Successful token response (`/auth/login/mfa`, `/auth/refresh`, `/auth/client-credentials`, ...). */
export interface TokenPair {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

/** `POST /auth/login`, `/auth/oidc/callback`, `/auth/passkey/login/finish`. */
export interface LoginResponse {
  access_token?: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  mfa_required?: boolean
  mfa_enrollment_required?: boolean
  mfa_methods?: string[]
  mfa_token?: string
}

/** `POST /auth/login/mfa/enroll/begin`, `POST /me/totp/enroll`. */
export interface TotpEnrollment {
  secret: string
  otpauth_url: string
}

/** `POST /auth/login/mfa/enroll/complete`. */
export interface MfaEnrollmentCompleteResponse extends TokenPair {
  backup_codes: string[]
}

/** `POST /auth/introspect`. */
export interface IntrospectionResult {
  active: boolean
  sub?: string
  kind?: string
  team?: string
  perm_ver?: number
  exp?: number
  imp?: boolean
  act?: Record<string, string>
}

/** `POST /authz/check`. */
export interface AuthzCheckResult {
  allow: boolean
  matched: string[]
  reason: string
}

/** One effective grant inside {@link EffectiveGrants}. */
export interface PermissionGrant {
  key: string
  condition?: string | null
}

/** `GET /authz/permissions/{userID}`. */
export interface EffectiveGrants {
  user_id: string
  perm_ver: number
  grants: PermissionGrant[]
}

/** `GET /me`, `PATCH /me` — the current user's own profile. */
export interface UserProfile {
  id: string
  username: string
  display_name: string
  email?: string | null
  email_verified_at?: string | null
  status: string
  created_at: string
}

/** Admin view of a user (`/users/`, `/users/{id}`, `/users/{id}/approve`, ...). */
export interface User {
  id: string
  username: string
  display_name: string
  email?: string | null
  email_verified_at?: string | null
  status: string
  created_at: string
  updated_at: string
  failed_logins: number
  perm_ver: number
  approved_at?: string | null
  approved_by?: string | null
  locked_until?: string | null
}

/** `GET /teams/`, `POST /teams/`, ... */
export interface Team {
  id: string
  name: string
  slug: string
  status: string
  created_at: string
}

/** `GET /groups/`, `POST /groups/`, ... */
export interface Group {
  id: string
  name: string
  team_id: string
}

/** `PUT /groups/{id}/members` — one group membership. */
export interface GroupMember {
  group_id: string
  team_id: string
  user_id: string
  expires_at?: string | null
}

/** `GET /roles/`, `POST /roles/`, ... */
export interface Role {
  id: string
  name: string
  team_id?: string | null
}

/** `GET /permissions/`, `POST /permissions/`. */
export interface Permission {
  key: string
  description: string
  registered_by: string
  created_at: string
}

/** `GET /bindings/`, `POST /bindings/` — a role binding for a subject. */
export interface Binding {
  id: string
  role_id: string
  subject_id: string
  subject_kind: string
  team_id?: string | null
  condition?: string | null
  expires_at?: string | null
}

/** `GET /policies/mfa`, `POST /policies/mfa`, ... */
export interface MfaPolicy {
  id: string
  name: string
  subject_kind: string
  subject_id: string
  required: boolean
  deny_unenrolled: boolean
  priority: number
  created_at: string
  updated_at: string
}

/** `GET /policies/password`, `POST /policies/password`, ... (unset fields inherit defaults). */
export interface PasswordPolicy {
  id: string
  name: string
  subject_kind: string
  subject_id: string
  priority: number
  created_at: string
  updated_at: string
  min_length?: number | null
  history_count?: number | null
  breach_check?: boolean | null
  require_upper?: boolean | null
  require_lower?: boolean | null
  require_letter?: boolean | null
  require_digit?: boolean | null
  require_symbol?: boolean | null
}

/** `GET /me/password-policy`, `GET /users/{id}/password-policy` — fully resolved policy. */
export interface EffectivePasswordPolicy {
  min_length: number
  history_count: number
  breach_check: boolean
  require_upper: boolean
  require_lower: boolean
  require_letter: boolean
  require_digit: boolean
  require_symbol: boolean
}

/** `GET /audit/` (numeric cursor), `GET /audit/export` (JSON Lines / CSV). */
export interface AuditEntry {
  id: number
  at: string
  actor_id?: string | null
  action: string
  target: string
  team_id?: string | null
  request_id?: string | null
  diff: unknown
}

/** `POST /invitations/` — an invitation is identified by the created user and its status. */
export interface Invitation {
  id: string
  status: string
}

/** `POST /impersonations` — the impersonation token to use on behalf of a user. */
export interface Impersonation {
  access_token: string
  token_type: string
  expires_at: string
}

/** `GET /me/sessions`, `GET /users/{id}/sessions`. */
export interface SessionInfo {
  id: string
  created_at: string
  last_active_at: string
  expires_at: string
}

/** `GET /me/activity` — one login activity row. */
export interface LoginActivity {
  id: number
  user_id: string
  at: string
  ip: string
  method: string
  result: string
  user_agent: string
}

/** `GET /me/passkeys`. */
export interface Passkey {
  id: string
  created_at: string
}

/** `POST /users/{id}/credentials` — the credential that was created or rotated. */
export interface Credential {
  user_id: string
  username: string
  kind: string
}

/** `POST /keys/rotate` — the newly activated signing key. */
export interface SigningKey {
  kid: string
  retire_at: string
  warning?: string
}

/** One entry of `GET /.well-known/jwks.json`. */
export interface JwksKey {
  kty: string
  crv: string
  kid: string
  use: string
  alg: string
  x: string
}

/** One row of the batch endpoints (`POST /users/batch`, `POST /groups/{id}/members/batch`). */
export interface BatchResult {
  id: string
  ok: boolean
  error?: string
}

/** `POST /users/batch`, `POST /groups/{id}/members/batch`. */
export interface BatchResults {
  results: BatchResult[]
}

/** One row of `POST /users/import`. */
export interface ImportResult {
  ok: boolean
  id?: string
  username?: string
  row?: number
  error?: string
}

/** `POST /users/import`. */
export interface ImportResults {
  results: ImportResult[]
}

/** `POST /me/password`. */
export interface PasswordChangeResult {
  message: string
  sessions_revoked: boolean
}

/** One active session inside {@link MeExport}. */
export interface ExportedSession {
  id: string
  created_at: string
  last_active_at: string
  expires_at: string
}

/** One membership inside {@link MeExport}. */
export interface ExportedMembership {
  team_id: string
  group_id: string
}

/** `GET /me/export`. */
export interface MeExport {
  profile: UserProfile
  effective_permissions: string[]
  memberships: ExportedMembership[]
  active_sessions: ExportedSession[]
  passkey_count: number
  totp_enabled: boolean
}

/** `GET /me/permissions` — effective unconditional allow keys for the current user. */
export interface MePermissionsResponse {
  permissions: string[]
}
