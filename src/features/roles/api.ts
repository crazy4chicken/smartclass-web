import { http } from '@/api/http'
import type { Page, Role } from '@/api/types'

/** Payload for `POST /roles/`; `team_id` may be a ULID or JSON null (platform role). */
export interface RoleCreatePayload {
  name: string
  team_id?: string | null
}

/** Payload for `PATCH /roles/{id}` — at least one field is required, `team_id: null` clears the team scope. */
export interface RoleUpdatePayload {
  name?: string
  team_id?: string | null
}

/** `GET /roles/` — cursor pages; `team_id` optionally filters by team (omitted → all roles). */
export async function listRoles(cursor: string, limit: number, teamId = ''): Promise<Page<Role>> {
  const params: Record<string, string | number> = { cursor, limit }
  if (teamId) {
    params.team_id = teamId
  }
  const { data } = await http.get<Page<Role>>('/roles/', { params })
  return data
}

/** `GET /roles/` — first page of roles, used to populate role pickers. */
export async function listRoleOptions(limit = 100): Promise<Role[]> {
  const { data } = await http.get<Page<Role>>('/roles/', { params: { limit } })
  return data.items
}

/** `POST /roles/` — create a platform-wide or team-scoped role. */
export async function createRole(payload: RoleCreatePayload): Promise<Role> {
  const { data } = await http.post<Role>('/roles/', payload)
  return data
}

/** `PATCH /roles/{id}` — rename a role or change its team scope. */
export async function updateRole(id: string, payload: RoleUpdatePayload): Promise<Role> {
  const { data } = await http.patch<Role>(`/roles/${id}`, payload)
  return data
}

/** `DELETE /roles/{id}` — removes the role and all of its bindings. */
export async function deleteRole(id: string): Promise<void> {
  await http.delete(`/roles/${id}`)
}

/**
 * `PUT /roles/{id}/permissions` — replaces the complete permission set of a role.
 * Keys must already be registered; a leading `!` marks a deny entry.
 */
export async function setRolePermissions(id: string, permissionKeys: string[]): Promise<void> {
  await http.put(`/roles/${id}/permissions`, { permission_keys: permissionKeys })
}
