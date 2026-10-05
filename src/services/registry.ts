import type { Component } from 'vue'
import { Calendar, Lock, Monitor, Reading, VideoCamera } from '@element-plus/icons-vue'

export interface ServiceEntry {
  key: string
  title: string
  path: string
  /** Icon shown by the header service guide bar. */
  icon: Component
  implemented: boolean
}

export const services: ServiceEntry[] = [
  { key: 'iam', title: '身份与访问管理', path: '/iam', icon: Lock, implemented: true },
  { key: 'hub', title: '录播调度', path: '/hub', icon: VideoCamera, implemented: true },
  { key: 'devices', title: '设备管理', path: '/devices', icon: Monitor, implemented: false },
  { key: 'courses', title: '课程管理', path: '/courses', icon: Reading, implemented: false },
  { key: 'bookings', title: '教室预约', path: '/bookings', icon: Calendar, implemented: false },
]
