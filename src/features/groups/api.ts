import { http } from '@/api/http'
import type { BatchResults, Group, GroupMember, Page } from '@/api/types'

/**
 * `GET /groups/` — groups are team-scoped, so `team_id` is required by the
 * specification; `cursor` is only sent once a previous page returned one.
 */
export function listGroups(teamId: string, cursor: string, limit: number): Promise<Page<Group>> {
  const params: Record<string, string | number> = { team_id: teamId, limit }
  if (cursor !== '') {
    params.cursor = cursor
  }
  return http.get<Page<Group>>('/groups/', { params }).then((response) => response.data)
}

/** `POST /groups/` request body. */
export interface CreateGroupPayload {
  team_id: string
  name: string
}

/** `POST /groups/` */
export function createGroup(payload: CreateGroupPayload): Promise<Group> {
  return http.post<Group>('/groups/', payload).then((response) => response.data)
}

/** `GET /groups/{id}` */
export function getGroup(id: string): Promise<Group> {
  return http.get<Group>(`/groups/${id}`).then((response) => response.data)
}

/** `PATCH /groups/{id}` request body; at least one field is required. */
export interface UpdateGroupPayload {
  name?: string | null
  team_id?: string | null
}

/** `PATCH /groups/{id}` — rename a group or move it to another team. */
export function updateGroup(id: string, payload: UpdateGroupPayload): Promise<Group> {
  return http.patch<Group>(`/groups/${id}`, payload).then((response) => response.data)
}

/** `DELETE /groups/{id}` — removes the group and its memberships. */
export function deleteGroup(id: string): Promise<void> {
  return http.delete(`/groups/${id}`).then(() => undefined)
}

/** `PUT /groups/{id}/members` request body — add or replace one membership. */
export interface UpsertGroupMemberPayload {
  user_id: string
  expires_at?: string | null
}

/** `PUT /groups/{id}/members` — idempotent add/replace; returns the complete membership. */
export function upsertGroupMember(groupId: string, payload: UpsertGroupMemberPayload): Promise<GroupMember> {
  return http
    .put<GroupMember>(`/groups/${groupId}/members`, payload)
    .then((response) => response.data)
}

/** `DELETE /groups/{id}/members/{userID}` — remove by URL path. */
export function removeGroupMember(groupId: string, userId: string): Promise<void> {
  return http.delete(`/groups/${groupId}/members/${userId}`).then(() => undefined)
}

/** `DELETE /groups/{id}/members` — remove by JSON request body. */
export function removeGroupMemberByBody(
  groupId: string,
  payload: UpsertGroupMemberPayload,
): Promise<void> {
  return http.delete(`/groups/${groupId}/members`, { data: payload }).then(() => undefined)
}

/** `POST /groups/{id}/members/batch` — up to 500 user ids, each processed independently. */
export function addGroupMembersBatch(groupId: string, userIds: string[]): Promise<BatchResults> {
  return http
    .post<BatchResults>(`/groups/${groupId}/members/batch`, { user_ids: userIds })
    .then((response) => response.data)
}
