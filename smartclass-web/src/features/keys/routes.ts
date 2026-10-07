import type { RouteRecordRaw } from 'vue-router'

/** Routes for the keys area (owned by the keys feature lane). */
export default [
  {
    path: '/iam/keys',
    name: 'iam-keys',
    component: () => import('@/features/keys/views/KeysView.vue'),
    meta: { title: '签名密钥' },
  },
] as RouteRecordRaw[]
