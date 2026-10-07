import type { RouteRecordRaw } from 'vue-router'

/**
 * Pages of the nsc-filehouse console, mounted under `/file`.
 * `meta.actions` lists the `filehouse:*` actions that may open the page; the router
 * guard and the sidebar both read it, so navigation and visibility cannot disagree.
 */
const fileRoutes: RouteRecordRaw[] = [
  { path: '', redirect: '/file/buckets' },
  {
    path: 'buckets',
    name: 'file-buckets',
    component: () => import('@/features/file/views/FileBucketsView.vue'),
    meta: { title: '文件桶', actions: ['read', 'write', 'delete', 'manage'] },
  },
  {
    path: 'buckets/:bucket',
    name: 'file-bucket-detail',
    component: () => import('@/features/file/views/FileBucketDetailView.vue'),
    meta: { title: '桶详情', actions: ['read', 'write', 'delete', 'manage'] },
  },
  {
    path: 'usage',
    name: 'file-usage',
    component: () => import('@/features/file/views/FileUsageView.vue'),
    meta: { title: '我的存储' },
  },
  {
    path: 'admin',
    name: 'file-admin',
    component: () => import('@/features/file/views/FileAdminView.vue'),
    meta: { title: '平台管理', actions: ['manage'] },
  },
]

export default fileRoutes
