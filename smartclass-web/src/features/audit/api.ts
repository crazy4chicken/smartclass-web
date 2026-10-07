import { http } from '@/api/http'
import type { AuditEntry, Page } from '@/api/types'

/**
 * Query parameters accepted by `GET /audit/`. The cursor is opaque: v0.5.0
 * returns a decimal string and terminates with `""` (legacy releases used the
 * number `0`), so it is passed back verbatim and never coerced.
 */
export interface AuditListParams {
  /** Cursor from the previous page; omit for the first page. */
  cursor?: string
  limit?: number
  team_id?: string
}

/** `GET /audit/` — append-only audit rows ordered oldest-first by numeric id. */
export async function listAuditEntries(params: AuditListParams = {}): Promise<Page<AuditEntry>> {
  const query: Record<string, string | number> = {}
  if (params.cursor) {
    query.cursor = params.cursor
  }
  if (params.limit !== undefined) {
    query.limit = params.limit
  }
  if (params.team_id) {
    query.team_id = params.team_id
  }
  const { data } = await http.get<Page<AuditEntry>>('/audit/', { params: query })
  return data
}

/** Export formats supported by `GET /audit/export`. */
export type AuditExportFormat = 'jsonl' | 'csv'

/** `GET /audit/export` — streams every matching row as JSON Lines or CSV. */
export async function exportAuditEntries(format: AuditExportFormat, teamId = ''): Promise<Blob> {
  const params: Record<string, string> = { format }
  if (teamId) {
    params.team_id = teamId
  }
  const { data } = await http.get<Blob>('/audit/export', { params, responseType: 'blob' })
  return data
}
