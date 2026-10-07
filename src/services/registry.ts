import type { Component } from 'vue'
import { Calendar, Files, Lock, Reading, VideoCamera } from '@element-plus/icons-vue'

export interface ServiceEntry {
  key: string
  title: string
  path: string
  /** Icon shown by the header service guide bar. */
  icon: Component
  implemented: boolean
  /**
   * Permission gate for the header entry: once the grant set is loaded and the caller
   * holds none of `actions` in `system`, the entry is hidden. Omitted for services
   * reachable by any signed-in user (IAM has `/iam/me`, filehouse has `/file/usage`).
   */
  gate?: {
    system: string
    actions: readonly string[]
  }
}

export const services: ServiceEntry[] = [
  { key: 'iam', title: '身份与访问管理', path: '/iam', icon: Lock, implemented: true },
  { key: 'hub', title: '录播调度', path: '/hub', icon: VideoCamera, implemented: true, gate: { system: 'dispatch', actions: ['read', 'manage', 'control'] } },
  { key: 'file', title: '文件服务', path: '/file', icon: Files, implemented: true },
  { key: 'courses', title: '课程管理', path: '/courses', icon: Reading, implemented: false },
  { key: 'bookings', title: '教室预约', path: '/bookings', icon: Calendar, implemented: false },
]
