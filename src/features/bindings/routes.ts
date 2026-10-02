import type { RouteRecordRaw } from 'vue-router'

/** Routes for the bindings area (owned by the bindings feature lane). */
export default [
  {
    path: '/iam/bindings',
    name: 'iam-bindings',
    component: () => import('@/features/bindings/views/BindingListView.vue'),
    meta: { title: '绑定' },
  },
] as RouteRecordRaw[]
