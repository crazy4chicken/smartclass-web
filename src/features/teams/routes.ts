import type { RouteRecordRaw } from 'vue-router'

/** Routes for the teams area (owned by the teams feature lane). */
export default [
  {
    path: '/iam/teams',
    name: 'iam-teams',
    component: () => import('@/features/teams/views/TeamsListView.vue'),
    meta: { title: '团队' },
  },
] as RouteRecordRaw[]
