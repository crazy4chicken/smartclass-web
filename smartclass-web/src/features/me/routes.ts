import type { RouteRecordRaw } from 'vue-router'

/** Routes for the personal center (mounted inside the shared section layout as a child of `/iam`). */
export default [
  {
    path: '/iam/me',
    name: 'iam-me',
    component: () => import('@/features/me/views/MeView.vue'),
    meta: { title: '个人中心' },
  },
] as RouteRecordRaw[]
