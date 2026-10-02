import { http } from '@/api/http'
import type { Binding, Page, Team } from '@/api/types'

/** Payload for `POST /bindings/` — assigns a role to a user or group. */
export interface BindingCreatePayload {
  role_id: string
  subject_kind: string
  subject_id: string
  team_id?: string | null
  condition?: string | null
  expires_at?: string | null
}

/**
 * `GET /bindings/` — cursor pages of the role bindings of one subject.
 * `subject_kind` and `subject_id` are required by the endpoint.
 */
export async function listBindings(
  cursor: string,
  limit: number,
  subjectKind: string,
  subjectId: string,
): Promise<Page<Binding>> {
  const params: Record<string, string | number> = {
    cursor,
    limit,
    subject_kind: subjectKind,
    subject_id: subjectId,
  }
  const { data } = await http.get<Page<Binding>>('/bindings/', { params })
  return data
}

/** `POST /bindings/` — team scope, condition and expiry are optional. */
export async function createBinding(payload: BindingCreatePayload): Promise<Binding> {
  const { data } = await http.post<Binding>('/bindings/', payload)
  return data
}

/** `DELETE /bindings/{id}` — removes the role assignment. */
export async function deleteBinding(id: string): Promise<void> {
  await http.delete(`/bindings/${id}`)
}

/** `GET /teams/` — first page of teams, used to populate the optional team scope picker. */
export async function listTeamOptions(limit = 100): Promise<Team[]> {
  const { data } = await http.get<Page<Team>>('/teams/', { params: { limit } })
  return data.items
}
