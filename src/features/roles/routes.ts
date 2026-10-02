import type { RouteRecordRaw } from 'vue-router'

/** Routes for the roles area (owned by the roles feature lane). */
export default [
  {
    path: '/iam/roles',
    name: 'iam-roles',
    component: () => import('@/features/roles/views/RoleListView.vue'),
    meta: { title: '角色' },
  },
] as RouteRecordRaw[]
