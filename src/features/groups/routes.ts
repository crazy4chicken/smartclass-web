import type { RouteRecordRaw } from 'vue-router'

/** Routes for the groups area (owned by the groups feature lane). */
export default [
  {
    path: '/iam/groups',
    name: 'iam-groups',
    component: () => import('@/features/groups/views/GroupsListView.vue'),
    meta: { title: '用户组' },
  },
] as RouteRecordRaw[]
