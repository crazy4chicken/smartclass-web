import type { RouteRecordRaw } from 'vue-router'

/**
 * Pages of the smartclass-dispatchub console, mounted under `/hub`.
 * `meta.actions` lists the `dispatch:*` actions that may open the page; the router guard
 * and the sidebar both read it, so navigation and visibility cannot disagree.
 */
const hubRoutes: RouteRecordRaw[] = [
  { path: '', redirect: '/hub/sessions' },
  {
    path: 'sessions',
    name: 'hub-sessions',
    component: () => import('@/features/hub/views/HubSessionsView.vue'),
    meta: { title: '录播场次', actions: ['read', 'control'] },
  },
  {
    path: 'rooms',
    name: 'hub-rooms',
    component: () => import('@/features/hub/views/HubRoomsView.vue'),
    meta: { title: '教室与绑定', actions: ['read', 'manage', 'control'] },
  },
  {
    path: 'terms',
    name: 'hub-terms',
    component: () => import('@/features/hub/views/HubTermsView.vue'),
    meta: { title: '学期与节次', actions: ['read', 'manage'] },
  },
  {
    path: 'timetable',
    name: 'hub-timetable',
    component: () => import('@/features/hub/views/HubTimetableView.vue'),
    meta: { title: '课表导入', actions: ['read', 'manage'] },
  },
  {
    path: 'health',
    name: 'hub-health',
    component: () => import('@/features/hub/views/HubHealthView.vue'),
    meta: { title: '服务健康', actions: ['read', 'manage', 'control'] },
  },
  {
    // In-area explainer shown when the caller holds no dispatch grant at all. It must
    // stay reachable without any permission so the guard can always send users here
    // instead of bouncing them into another area.
    path: 'denied',
    name: 'hub-denied',
    component: () => import('@/features/hub/views/HubDeniedView.vue'),
    meta: { title: '无权限' },
  },
]

export default hubRoutes
