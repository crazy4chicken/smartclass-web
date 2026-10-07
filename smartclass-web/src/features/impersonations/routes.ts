import type { RouteRecordRaw } from 'vue-router'

/** Routes for the impersonations area (owned by the impersonations feature lane). */
export default [
  {
    path: '/iam/impersonations',
    name: 'iam-impersonations',
    component: () => import('@/features/impersonations/views/ImpersonationsView.vue'),
    meta: { title: '假冒' },
  },
] as RouteRecordRaw[]
