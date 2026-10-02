import { http } from '@/api/http'
import type { Page, Team } from '@/api/types'

/** `GET /teams/` — cursor paging only; the specification exposes no filter parameters. */
export function listTeams(cursor: string, limit: number): Promise<Page<Team>> {
  const params: Record<string, string | number> = { limit }
  if (cursor !== '') {
    params.cursor = cursor
  }
  return http.get<Page<Team>>('/teams/', { params }).then((response) => response.data)
}

/** `POST /teams/` request body; `status` defaults to `active`. */
export interface CreateTeamPayload {
  name: string
  slug: string
  status?: string
}

/** `POST /teams/` */
export function createTeam(payload: CreateTeamPayload): Promise<Team> {
  return http.post<Team>('/teams/', payload).then((response) => response.data)
}

/** `GET /teams/{id}` */
export function getTeam(id: string): Promise<Team> {
  return http.get<Team>(`/teams/${id}`).then((response) => response.data)
}

/** `PATCH /teams/{id}` request body; at least one field is required. */
export interface UpdateTeamPayload {
  name?: string | null
  slug?: string | null
  /** `active` or `disabled`. */
  status?: string | null
}

/** `PATCH /teams/{id}` */
export function updateTeam(id: string, payload: UpdateTeamPayload): Promise<Team> {
  return http.patch<Team>(`/teams/${id}`, payload).then((response) => response.data)
}

/** `DELETE /teams/{id}` — removes the team and its dependent administrative records. */
export function deleteTeam(id: string): Promise<void> {
  return http.delete(`/teams/${id}`).then(() => undefined)
}
