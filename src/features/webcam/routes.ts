import type { RouteRecordRaw } from 'vue-router'

/**
 * Pages of the smartclass-webcam-server console, mounted under `/webcam`.
 * `meta.actions` lists the `cam:*` actions that may open the page; the router guard
 * and the sidebar both read it, so navigation and visibility cannot disagree.
 */
const webcamRoutes: RouteRecordRaw[] = [
  { path: '', redirect: '/webcam/devices' },
  {
    path: 'devices',
    name: 'webcam-devices',
    component: () => import('@/features/webcam/views/WebcamDevicesView.vue'),
    meta: { title: '设备', actions: ['read', 'manage'] },
  },
  {
    path: 'devices/:deviceId',
    name: 'webcam-device-detail',
    component: () => import('@/features/webcam/views/WebcamDeviceDetailView.vue'),
    meta: { title: '设备详情', actions: ['read', 'manage', 'control'] },
  },
  {
    path: 'streams/:streamId',
    name: 'webcam-stream',
    component: () => import('@/features/webcam/views/WebcamStreamView.vue'),
    meta: { title: '录制分段', actions: ['read'] },
  },
  {
    path: 'photos/:photoId',
    name: 'webcam-photo',
    component: () => import('@/features/webcam/views/WebcamPhotoView.vue'),
    meta: { title: '照片', actions: ['read'] },
  },
  {
    path: 'health',
    name: 'webcam-health',
    component: () => import('@/features/webcam/views/WebcamHealthView.vue'),
    meta: { title: '服务健康', actions: ['read', 'manage', 'control'] },
  },
]

export default webcamRoutes
