import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, http } from '@/api/http'
import type { LoginResponse, MePermissionsResponse, UserProfile } from '@/api/types'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem(ACCESS_TOKEN_KEY) ?? '')
  const refreshToken = ref(localStorage.getItem(REFRESH_TOKEN_KEY) ?? '')
  const profile = ref<UserProfile | null>(null)
  const permissions = ref<string[]>([])
  const permissionsLoaded = ref(false)

  const isAuthenticated = computed(() => !!accessToken.value)

  function setTokens(access: string, refresh: string): void {
    accessToken.value = access
    refreshToken.value = refresh
    localStorage.setItem(ACCESS_TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  }

  function clear(): void {
    accessToken.value = ''
    refreshToken.value = ''
    profile.value = null
    permissions.value = []
    permissionsLoaded.value = false
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }

  /**
   * Signs in with a password. The raw response is returned so callers can branch on
   * `mfa_required`, `mfa_enrollment_required` or a 403 `password_change_required` error;
   * the token pair is only stored when the response actually carries an access token.
   */
  async function login(username: string, password: string): Promise<LoginResponse> {
    const { data } = await http.post<LoginResponse>('/auth/login', { username, password })
    if (data.access_token) {
      setTokens(data.access_token, data.refresh_token ?? '')
    }
    return data
  }

  /** Best-effort refresh-token revocation; local state is cleared regardless. */
  async function logout(): Promise<void> {
    const current = refreshToken.value
    try {
      if (current) {
        await http.post('/auth/logout', { refresh_token: current })
      }
    } catch {
      // Ignore logout failures: the local session is dropped either way.
    }
    clear()
  }

  async function fetchProfile(): Promise<UserProfile> {
    const { data } = await http.get<UserProfile>('/me')
    profile.value = data
    return data
  }

  /** `GET /me/permissions` — the caller's effective unconditional allow keys. */
  async function fetchPermissions(): Promise<string[]> {
    const { data } = await http.get<MePermissionsResponse>('/me/permissions')
    permissions.value = data.permissions
    permissionsLoaded.value = true
    return data.permissions
  }

  /**
   * Whether the user holds any effective grant in `<system>:<area>` (`*` matches either
   * segment). Mirrors the backend's `any > team > own` ladder for existence checks:
   * a narrower scope still proves the caller may open the area.
   */
  function hasGrant(system: string, area: string): boolean {
    return permissions.value.some((key) => {
      const [grantedSystem, grantedArea] = key.split(':')
      return (grantedSystem === system || grantedSystem === '*') && (grantedArea === '*' || grantedArea === area)
    })
  }

  /** Whether the user holds any effective grant in the given IAM admin area. */
  function hasIamArea(area: string): boolean {
    return hasGrant('iam', area)
  }

  return { accessToken, refreshToken, profile, permissions, permissionsLoaded, isAuthenticated, setTokens, clear, login, logout, fetchProfile, fetchPermissions, hasGrant, hasIamArea }
})
