import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

import auditRoutes from '@/features/audit/routes'
import authRoutes from '@/features/auth/routes'
import bindingsRoutes from '@/features/bindings/routes'
import groupsRoutes from '@/features/groups/routes'
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
import IamLayout from '@/layouts/IamLayout.vue'
import { services } from '@/services/registry'
import { useAuthStore } from '@/stores/auth'
import ServicePlaceholder from '@/views/ServicePlaceholder.vue'

declare module 'vue-router' {
  interface RouteMeta {
    /** Routes reachable without an access token (login, register, password reset, ...). */
    public?: boolean
    /** Human readable page title used by breadcrumbs and tabs. */
    title?: string
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
      { path: 'iam', component: IamLayout, children: iamChildren },
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

/** First IAM section the user may open, in sidebar order; `/iam/me` when none. */
function firstAllowedIamPath(auth: IamAccess): string {
  const entry = IAM_AREA_BY_PATH.find(([, areas]) => areas.some((area) => auth.hasIamArea(area)))
  return entry?.[0] ?? '/iam/me'
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
    const areas = iamAreasForPath(to.path)
    if (to.path === '/iam' || areas) {
      if (!auth.permissionsLoaded) {
        // Without a readable grant set, pages stay visible and surface API errors.
        await auth.fetchPermissions().catch(() => undefined)
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
