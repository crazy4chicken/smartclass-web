import type { RouteRecordRaw } from 'vue-router'

/** Routes for the audit area (owned by the audit feature lane). */
export default [
  {
    path: '/iam/audit',
    name: 'iam-audit',
    component: () => import('@/features/audit/views/AuditListView.vue'),
    meta: { title: '审计日志' },
  },
] as RouteRecordRaw[]
