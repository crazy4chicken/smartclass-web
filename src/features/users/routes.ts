import type { RouteRecordRaw } from 'vue-router'

/** Routes for the users area (owned by the users feature lane). */
export default [
  {
    path: '/iam/users',
    name: 'iam-users',
    component: () => import('@/features/users/views/UsersListView.vue'),
    meta: { title: '用户' },
  },
] as RouteRecordRaw[]
