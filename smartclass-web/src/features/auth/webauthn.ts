/**
 * WebAuthn helpers shared by passkey login (`src/features/auth`) and passkey management
 * (`src/features/me`). The IAM service transports every binary field as an unpadded
 * base64url string, so credentials must be converted in both directions.
 */

type JsonObject = Record<string, unknown>

/** True when the current browser exposes the WebAuthn credential API. */
export const WEBAUTHN_SUPPORTED =
  typeof window !== 'undefined' && typeof window.PublicKeyCredential !== 'undefined'

export function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null
}

/** Decodes a required base64url field; a missing field means the server sent unusable options. */
function decodeBinary(value: unknown, field: string): ArrayBuffer {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`WebAuthn 选项缺少 ${field}`)
  }
  return base64UrlToBuffer(value)
}

function toDescriptors(value: unknown): PublicKeyCredentialDescriptor[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isJsonObject).map((item) => {
    const descriptor: PublicKeyCredentialDescriptor = {
      id: decodeBinary(item.id, 'credential id'),
      type: 'public-key',
    }
    if (Array.isArray(item.transports)) {
      descriptor.transports = item.transports as AuthenticatorTransport[]
    }
    return descriptor
  })
}

/** Converts the `publicKey` request options of `POST /auth/passkey/login/begin` for `credentials.get`. */
export function toRequestOptions(publicKey: JsonObject): PublicKeyCredentialRequestOptions {
  const options: PublicKeyCredentialRequestOptions = {
    challenge: decodeBinary(publicKey.challenge, 'challenge'),
  }
  if (typeof publicKey.rpId === 'string' && publicKey.rpId) {
    options.rpId = publicKey.rpId
  }
  if (typeof publicKey.timeout === 'number') {
    options.timeout = publicKey.timeout
  }
  if (typeof publicKey.userVerification === 'string') {
    options.userVerification = publicKey.userVerification as UserVerificationRequirement
  }
  const allowCredentials = toDescriptors(publicKey.allowCredentials)
  if (allowCredentials.length > 0) {
    options.allowCredentials = allowCredentials
  }
  return options
}

/** Converts the `publicKey` creation options of `POST /me/passkeys/register/begin` for `credentials.create`. */
export function toCreationOptions(publicKey: JsonObject): PublicKeyCredentialCreationOptions {
  const rp = isJsonObject(publicKey.rp) ? publicKey.rp : {}
  const user = isJsonObject(publicKey.user) ? publicKey.user : {}
  const params = Array.isArray(publicKey.pubKeyCredParams)
    ? publicKey.pubKeyCredParams
        .filter(isJsonObject)
        .map((item) => ({ type: 'public-key' as PublicKeyCredentialType, alg: Number(item.alg) }))
        .filter((item) => Number.isFinite(item.alg))
    : []
  if (params.length === 0) {
    throw new Error('WebAuthn 选项缺少可用的签名算法')
  }
  const options: PublicKeyCredentialCreationOptions = {
    challenge: decodeBinary(publicKey.challenge, 'challenge'),
    rp: {
      name: typeof rp.name === 'string' && rp.name ? rp.name : 'IAM',
      ...(typeof rp.id === 'string' && rp.id ? { id: rp.id } : {}),
    },
    user: {
      id: decodeBinary(user.id, 'user.id'),
      name: typeof user.name === 'string' ? user.name : '',
      displayName: typeof user.displayName === 'string' ? user.displayName : '',
    },
    pubKeyCredParams: params,
  }
  if (isJsonObject(publicKey.authenticatorSelection)) {
    options.authenticatorSelection = publicKey.authenticatorSelection as AuthenticatorSelectionCriteria
  }
  if (typeof publicKey.attestation === 'string') {
    options.attestation = publicKey.attestation as AttestationConveyancePreference
  }
  if (typeof publicKey.timeout === 'number') {
    options.timeout = publicKey.timeout
  }
  const excludeCredentials = toDescriptors(publicKey.excludeCredentials)
  if (excludeCredentials.length > 0) {
    options.excludeCredentials = excludeCredentials
  }
  return options
}

/** Serializes a creation credential into the body of `POST /me/passkeys/register/finish`. */
export function serializeAttestation(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
}

/** Serializes an assertion credential into the body of `POST /auth/passkey/login/finish`. */
export function serializeAssertion(credential: PublicKeyCredential): Record<string, unknown> {
  const response = credential.response as AuthenticatorAssertionResponse
  const body: Record<string, unknown> = {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      authenticatorData: bufferToBase64Url(response.authenticatorData),
      signature: bufferToBase64Url(response.signature),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  }
  if (response.userHandle) {
    ;(body.response as Record<string, unknown>).userHandle = bufferToBase64Url(response.userHandle)
  }
  return body
}

/** Maps WebAuthn/browser failures to a Simplified Chinese message for `ElMessage.error`. */
export function webAuthnErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') {
      return '操作已取消或超时，请重试'
    }
    if (error.name === 'InvalidStateError') {
      return '该设备上已注册此通行密钥'
    }
    if (error.name === 'NotSupportedError') {
      return '当前浏览器或设备不支持该通行密钥'
    }
    if (error.name === 'SecurityError') {
      return '当前环境不允许使用通行密钥（需要 HTTPS）'
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return '通行密钥操作失败'
}
