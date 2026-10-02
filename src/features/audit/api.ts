import { http } from '@/api/http'
import type { AuditEntry, Page } from '@/api/types'

/** Query parameters accepted by `GET /audit/` (numeric cursor, optional team filter). */
export interface AuditListParams {
  /** Non-negative integer cursor; omit (or 0) for the first page. */
  cursor?: string
  limit?: number
  team_id?: string
}

/** `GET /audit/` — append-only audit rows ordered newest first. `next_cursor` 0 means no next page. */
export async function listAuditEntries(params: AuditListParams = {}): Promise<Page<AuditEntry>> {
  const { data } = await http.get<Page<AuditEntry>>('/audit/', { params })
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
