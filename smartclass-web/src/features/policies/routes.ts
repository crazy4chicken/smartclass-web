import type { RouteRecordRaw } from 'vue-router'

/** Routes for the policies area (owned by the policies feature lane). */
export default [
  {
    path: '/iam/policies',
    name: 'iam-policies',
    component: () => import('@/features/policies/views/PolicyListView.vue'),
    meta: { title: '策略' },
  },
] as RouteRecordRaw[]
