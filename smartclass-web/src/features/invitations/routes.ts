import type { RouteRecordRaw } from 'vue-router'

/** Routes for the invitations area (owned by the invitations feature lane). */
export default [
  {
    path: '/iam/invitations',
    name: 'iam-invitations',
    component: () => import('@/features/invitations/views/InvitationsView.vue'),
    meta: { title: '邀请管理' },
  },
] as RouteRecordRaw[]
