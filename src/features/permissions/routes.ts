import type { RouteRecordRaw } from 'vue-router'

/** Routes for the permissions area (owned by the permissions feature lane). */
export default [
  {
    path: '/iam/permissions',
    name: 'iam-permissions',
    component: () => import('@/features/permissions/views/PermissionListView.vue'),
    meta: { title: '权限' },
  },
] as RouteRecordRaw[]
