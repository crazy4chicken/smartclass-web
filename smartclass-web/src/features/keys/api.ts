import { http } from '@/api/http'
import type { JwksKey, SigningKey } from '@/api/types'

/** Public JSON Web Key Set served by `GET /.well-known/jwks.json`. */
export interface JwksResponse {
  keys: JwksKey[]
}

/** `GET /.well-known/jwks.json` — public signing keys; validate EdDSA JWT signatures locally by kid. */
export async function fetchJwks(): Promise<JwksResponse> {
  const { data } = await http.get<JwksResponse>('/.well-known/jwks.json')
  return data
}

/**
 * `POST /keys/rotate` — activates a fresh EdDSA signing key immediately.
 * Requires `iam:keys:any` plus authentication within the previous ten minutes.
 */
export async function rotateSigningKey(): Promise<SigningKey> {
  const { data } = await http.post<SigningKey>('/keys/rotate')
  return data
}
