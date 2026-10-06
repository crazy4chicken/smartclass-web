import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import auditRoutes from '@/features/audit/routes'
import authRoutes from '@/features/auth/routes'
import bindingsRoutes from '@/features/bindings/routes'
import fileRoutes from '@/features/file/routes'
import groupsRoutes from '@/features/groups/routes'
import hubRoutes from '@/features/hub/routes'
import impersonationsRoutes from '@/features/impersonations/routes'
import invitationsRoutes from '@/features/invitations/routes'
import keysRoutes from '@/features/keys/routes'
import meRoutes from '@/features/me/routes'
import permissionsRoutes from '@/features/permissions/routes'
import policiesRoutes from '@/features/policies/routes'
import rolesRoutes from '@/features/roles/routes'
import teamsRoutes from '@/features/teams/routes'
import usersRoutes from '@/features/users/routes'
import AppLayout from '@/layouts/AppLayout.vue'
import SectionLayout from '@/layouts/SectionLayout.vue'
import { services } from '@/services/registry'
import { useAuthStore } from '@/stores/auth'
import ServicePlaceholder from '@/views/ServicePlaceholder.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Routes reachable without an access token (login, register, password reset, ...). */
    public?: boolean
    /** Human readable page title used by breadcrumbs and tabs. */
    title?: string
    /** `dispatch:*` actions that may open the page; read by the guard and the sidebar. */
    actions?: readonly string[]
  }
}

/** Public IAM pages rendered outside IamLayout (centered card layout). */
const publicRoutes: RouteRecordRaw[] = [
  {
    path: '/iam/login',
    name: 'iam-login',
    component: () => import('@/features/auth/views/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/iam/register',
    name: 'iam-register',
    component: () => import('@/features/auth/views/RegisterView.vue'),
    meta: { public: true, title: '注册' },
  },
  {
    path: '/iam/forgot-password',
    name: 'iam-forgot-password',
    component: () => import('@/features/auth/views/ForgotPasswordView.vue'),
    meta: { public: true, title: '忘记密码' },
  },
  {
    path: '/iam/reset-password',
    name: 'iam-reset-password',
    component: () => import('@/features/auth/views/ResetPasswordView.vue'),
    meta: { public: true, title: '重置密码' },
  },
  {
    path: '/iam/verify-email',
    name: 'iam-verify-email',
    component: () => import('@/features/auth/views/VerifyEmailView.vue'),
    meta: { public: true, title: '邮箱验证' },
  },
  {
    path: '/iam/invite/accept',
    name: 'iam-invite-accept',
    component: () => import('@/features/auth/views/InviteAcceptView.vue'),
    meta: { public: true, title: '接受邀请' },
  },
  {
    path: '/iam/oidc/callback',
    name: 'iam-oidc-callback',
    component: () => import('@/features/auth/views/OidcCallbackView.vue'),
    meta: { public: true, title: 'OIDC 登录' },
  },
  {
    path: '/iam/mfa',
    name: 'iam-mfa',
    component: () => import('@/features/auth/views/MfaChallengeView.vue'),
    meta: { public: true, title: 'MFA 验证' },
  },
  {
    path: '/iam/mfa/enroll',
    name: 'iam-mfa-enroll',
    component: () => import('@/features/auth/views/MfaEnrollView.vue'),
    meta: { public: true, title: 'MFA 注册' },
  },
  {
    path: '/iam/password/change',
    name: 'iam-password-change',
    component: () => import('@/features/auth/views/PasswordChangeView.vue'),
    meta: { public: true, title: '修改密码' },
  },
]

/** Authenticated IAM area: every feature contributes its own routes. */
const iamChildren: RouteRecordRaw[] = [
  { path: '', redirect: '/iam/users' },
  ...usersRoutes,
  ...teamsRoutes,
  ...groupsRoutes,
  ...rolesRoutes,
  ...permissionsRoutes,
  ...bindingsRoutes,
  ...policiesRoutes,
  ...auditRoutes,
  ...invitationsRoutes,
  ...impersonationsRoutes,
  ...keysRoutes,
  ...meRoutes,
  ...authRoutes,
]

/** Services that are not implemented yet land on the shared placeholder page. */
const placeholderRoutes: RouteRecordRaw[] = services
  .filter((service) => !service.implemented)
  .map((service) => ({
    path: service.path,
    name: `service-${service.key}`,
    component: ServicePlaceholder,
    meta: { title: service.title },
  }))

const routes: RouteRecordRaw[] = [
  ...publicRoutes,
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: '/iam' },
      { path: 'iam', component: SectionLayout, children: iamChildren },
      { path: 'hub', component: SectionLayout, children: hubRoutes },
      { path: 'file', component: SectionLayout, children: fileRoutes },
      ...placeholderRoutes,
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

/**
 * IAM section path prefixes mapped to the backend admin permission areas that
 * gate them (mirrors `AdminPermissionArea` in teamusers): invitations reuse
 * `iam:users:any`, the policies page serves both `iam:mfa:any` and
 * `iam:policies:any`. `/iam/me` stays unmapped — always available.
 */
const IAM_AREA_BY_PATH: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/iam/users', ['users']],
  ['/iam/teams', ['teams']],
  ['/iam/groups', ['groups']],
  ['/iam/roles', ['roles']],
  ['/iam/permissions', ['permissions']],
  ['/iam/bindings', ['bindings']],
  ['/iam/policies', ['mfa', 'policies']],
  ['/iam/audit', ['audit']],
  ['/iam/invitations', ['users']],
  ['/iam/impersonations', ['impersonate']],
  ['/iam/keys', ['keys']],
]

function iamAreasForPath(path: string): readonly string[] | null {
  return IAM_AREA_BY_PATH.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? null
}

/** Minimal capability surface the router needs for IAM area gating. */
interface IamAccess {
  hasIamArea: (area: string) => boolean
}

/** Minimal capability surface the router needs for the dispatch console. */
interface HubAccess {
  hasGrant: (system: string, area: string) => boolean
}

/** First IAM section the user may open, in sidebar order; `/iam/me` when none. */
function firstAllowedIamPath(auth: IamAccess): string {
  const entry = IAM_AREA_BY_PATH.find(([, areas]) => areas.some((area) => auth.hasIamArea(area)))
  return entry?.[0] ?? '/iam/me'
}

/**
 * `/hub` sections mapped to the `dispatch:*` actions that may open them, mirroring
 * `src/features/hub/routes.ts`. Collection reads need the any-scoped read key while
 * control and manage actions are checked inside each page.
 */
const HUB_AREA_BY_PATH: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/hub/sessions', ['read', 'control']],
  ['/hub/rooms', ['read', 'manage', 'control']],
  ['/hub/terms', ['read', 'manage']],
  ['/hub/timetable', ['read', 'manage']],
  ['/hub/health', ['read', 'manage', 'control']],
]

/** First dispatch section the user may open, in sidebar order; `null` when they hold no key. */
function firstAllowedHubPath(auth: HubAccess): string | null {
  const entry = HUB_AREA_BY_PATH.find(([, actions]) => actions.some((action) => auth.hasGrant('dispatch', action)))
  return entry?.[0] ?? null
}

/**
 * `/file` sections mapped to the `filehouse:*` actions that may open them, mirroring
 * `src/features/file/routes.ts`. `/file/usage` carries no `actions` because the
 * self-service endpoints only require a valid bearer token.
 */
const FILE_AREA_BY_PATH: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/file/buckets', ['read', 'write', 'delete', 'manage']],
  ['/file/admin', ['manage']],
]

/** First filehouse section the user may open; `/file/usage` is open to any caller. */
function firstAllowedFilePath(auth: HubAccess): string {
  const entry = FILE_AREA_BY_PATH.find(([, actions]) => actions.some((action) => auth.hasGrant('filehouse', action)))
  return entry?.[0] ?? '/file/usage'
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!to.meta.public && !auth.isAuthenticated) {
    return { path: '/iam/login', query: { redirect: to.fullPath } }
  }
  if (to.path === '/iam/login' && auth.isAuthenticated) {
    return { path: '/iam' }
  }
  if (auth.isAuthenticated && !to.meta.public) {
    if (to.path === '/file' || to.path.startsWith('/file/')) {
      if (!auth.permissionsLoaded) {
        await auth.fetchPermissions().catch(() => undefined)
      }
      if (!auth.permissionsLoaded) {
        // The grant set could not be read (service unreachable). Keep the page and let it
        // surface the API error instead of bouncing the user into another area.
        return true
      }
      const actions = FILE_AREA_BY_PATH.find(
        ([prefix]) => to.path === prefix || to.path.startsWith(`${prefix}/`),
      )?.[1]
      if (to.path === '/file' || (actions && !actions.some((action) => auth.hasGrant('filehouse', action)))) {
        return { path: firstAllowedFilePath(auth) }
      }
      return true
    }
    if (to.path === '/hub' || to.path.startsWith('/hub/')) {
      if (!auth.permissionsLoaded) {
        await auth.fetchPermissions().catch(() => undefined)
      }
      if (!auth.permissionsLoaded) {
        // Same as `/file`: an unreadable grant set must not redirect into the IAM area.
        return true
      }
      const allowed = firstAllowedHubPath(auth)
      if (!allowed) {
        return { path: firstAllowedIamPath(auth) }
      }
      const actions = HUB_AREA_BY_PATH.find(([prefix]) => to.path === prefix || to.path.startsWith(`${prefix}/`))?.[1]
      if (to.path === '/hub' || (actions && !actions.some((action) => auth.hasGrant('dispatch', action)))) {
        return { path: allowed }
      }
      return true
    }
    const areas = iamAreasForPath(to.path)
    if (to.path === '/iam' || areas) {
      if (!auth.permissionsLoaded) {
        await auth.fetchPermissions().catch(() => undefined)
      }
      if (!auth.permissionsLoaded) {
        // An unreadable grant set keeps every IAM page reachable for the same reason.
        return true
      }
      if (to.path === '/iam') {
        return { path: firstAllowedIamPath(auth) }
      }
      if (areas && !areas.some((area) => auth.hasIamArea(area))) {
        return { path: firstAllowedIamPath(auth) }
      }
    }
  }
  return true
})

export default router
