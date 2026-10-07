import { http } from '@/api/http'
import type { Impersonation } from '@/api/types'

/** Body of `POST /impersonations` — target user, mandatory reason and optional TTL. */
export interface StartImpersonationPayload {
  user_id: string
  /** Recorded verbatim in the append-only audit log. */
  reason: string
  /** 1–900 seconds, defaults to 300 on the server. */
  ttl_seconds?: number
}

/**
 * `POST /impersonations` — starts an audited, time-bounded impersonation.
 * Requires `iam:impersonate:any` plus authentication within the previous ten minutes;
 * a stale session answers 403 step_up_required.
 */
export async function startImpersonation(payload: StartImpersonationPayload): Promise<Impersonation> {
  const { data } = await http.post<Impersonation>('/impersonations', payload)
  return data
}
