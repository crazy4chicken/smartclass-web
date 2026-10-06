import { http } from '@/api/http'
import { collectPages } from '@/api/cursor'
import type { Page, Permission } from '@/api/types'

/** Payload for `POST /permissions/` — registration is an upsert keyed by `key`. */
export interface PermissionRegisterPayload {
  key: string
  registered_by: string
  description?: string
}

/** Hard cap on pages walked by {@link listAllPermissions} to avoid an endless loop. */
const MAX_PERMISSION_PAGES = 50

/** `GET /permissions/` — cursor pages of registered permissions. */
export async function listPermissions(cursor: string, limit: number): Promise<Page<Permission>> {
  const { data } = await http.get<Page<Permission>>('/permissions/', { params: { cursor, limit } })
  return data
}

/**
 * `GET /permissions/` — walks every cursor page and returns the full registry,
 * used to populate the role permission picker.
 */
export async function listAllPermissions(): Promise<Permission[]> {
  return collectPages((cursor) => listPermissions(cursor, 100), MAX_PERMISSION_PAGES)
}

/**
 * `POST /permissions/` — register or update a permission key.
 * Keys follow the `resource:action:scope` grammar with an optional `!` deny prefix.
 */
export async function registerPermission(payload: PermissionRegisterPayload): Promise<Permission> {
  const { data } = await http.post<Permission>('/permissions/', payload)
  return data
}
