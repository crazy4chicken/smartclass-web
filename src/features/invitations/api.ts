import { http } from '@/api/http'
import type { Invitation } from '@/api/types'

/** Body of `POST /invitations/` — an invited user is created and notified. */
export interface CreateInvitationPayload {
  username: string
  email: string
  display_name?: string
}

/** `POST /invitations/` — creates the invited user and sends a one-time invitation token. */
export async function createInvitation(payload: CreateInvitationPayload): Promise<Invitation> {
  const { data } = await http.post<Invitation>('/invitations/', payload)
  return data
}

/** `DELETE /invitations/{userID}` — withdraws a pending invitation (204); the invited user is deleted. */
export async function cancelInvitation(userID: string): Promise<void> {
  await http.delete(`/invitations/${encodeURIComponent(userID)}`)
}

/** `POST /invitations/{userID}/resend` — invalidates the previous token and sends a fresh seven-day one (204). */
export async function resendInvitation(userID: string): Promise<void> {
  await http.post(`/invitations/${encodeURIComponent(userID)}/resend`)
}
