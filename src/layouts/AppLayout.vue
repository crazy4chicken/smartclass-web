<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  ArrowDown,
  Avatar,
  Box,
  Calendar,
  Collection,
  DataLine,
  Expand,
  Fold,
  Key,
  Link,
  Monitor,
  Odometer,
  OfficeBuilding,
  Promotion,
  School,
  SetUp,
  Setting,
  Switch,
  Tickets,
  Tools,
  Unlock,
  Upload,
  User,
  VideoCamera,
} from '@element-plus/icons-vue'

import ThemeToggle from '@/components/ThemeToggle.vue'
import { services } from '@/services/registry'
import { useAuthStore } from '@/stores/auth'

interface Section {
  title: string
  path: string
  icon: Component
  /** Backend admin areas gating this IAM section; undefined means always visible. */
  areas?: readonly string[]
  /** Permission system (`dispatch`, `filehouse`, ...) whose `actions` gate this section. */
  system?: string
  /** Actions checked inside `system` for this section. */
  actions?: readonly string[]
}

/** Section navigation shown while the route lives under `/iam`. */
const IAM_SECTIONS: Section[] = [
  { title: '用户', path: '/iam/users', icon: User, areas: ['users'] },
  { title: '团队', path: '/iam/teams', icon: OfficeBuilding, areas: ['teams'] },
  { title: '用户组', path: '/iam/groups', icon: Collection, areas: ['groups'] },
  { title: '角色', path: '/iam/roles', icon: Avatar, areas: ['roles'] },
  { title: '权限', path: '/iam/permissions', icon: Key, areas: ['permissions'] },
  { title: '绑定', path: '/iam/bindings', icon: Link, areas: ['bindings'] },
  { title: '策略', path: '/iam/policies', icon: SetUp, areas: ['mfa', 'policies'] },
  { title: '审计', path: '/iam/audit', icon: Tickets, areas: ['audit'] },
  { title: '邀请', path: '/iam/invitations', icon: Promotion, areas: ['users'] },
  { title: '假冒', path: '/iam/impersonations', icon: Switch, areas: ['impersonate'] },
  { title: '密钥', path: '/iam/keys', icon: Unlock, areas: ['keys'] },
  { title: '个人中心', path: '/iam/me', icon: Setting },
]

/** Section navigation shown while the route lives under `/hub` (smartclass-dispatchub). */
const HUB_SECTIONS: Section[] = [
  { title: '录播场次', path: '/hub/sessions', icon: VideoCamera, system: 'dispatch', actions: ['read', 'control'] },
  { title: '教室与绑定', path: '/hub/rooms', icon: Monitor, system: 'dispatch', actions: ['read', 'manage', 'control'] },
  { title: '学期与节次', path: '/hub/terms', icon: Calendar, system: 'dispatch', actions: ['read', 'manage'] },
  { title: '课表导入', path: '/hub/timetable', icon: Upload, system: 'dispatch', actions: ['read', 'manage'] },
  { title: '设备', path: '/hub/devices', icon: Monitor, system: 'cam', actions: ['read', 'manage', 'control'] },
  { title: '服务健康', path: '/hub/health', icon: Odometer, system: 'dispatch', actions: ['read', 'manage', 'control'] },
]

/** Section navigation shown while the route lives under `/file` (nsc-filehouse). */
const FILE_SECTIONS: Section[] = [
  { title: '文件桶', path: '/file/buckets', icon: Box, system: 'filehouse', actions: ['read', 'write', 'delete', 'manage'] },
  { title: '我的存储', path: '/file/usage', icon: DataLine },
  { title: '平台管理', path: '/file/admin', icon: Tools, system: 'filehouse', actions: ['manage'] },
]

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const collapsed = ref(false)

const activeServicePath = computed(
  () =>
    services.find((service) => route.path === service.path || route.path.startsWith(`${service.path}/`))?.path ?? '',
)

const isIamArea = computed(() => route.path === '/iam' || route.path.startsWith('/iam/'))
const isHubArea = computed(() => route.path === '/hub' || route.path.startsWith('/hub/'))
const isFileArea = computed(() => route.path === '/file' || route.path.startsWith('/file/'))

/** Sections of the area the current route belongs to; empty outside the consoles. */
const activeSections = computed<Section[]>(() => {
  if (isIamArea.value) {
    return IAM_SECTIONS
  }
  if (isHubArea.value) {
    return HUB_SECTIONS
  }
  if (isFileArea.value) {
    return FILE_SECTIONS
  }
  return []
})

const asideTitle = computed(() => {
  if (isIamArea.value) {
    return '身份与访问管理'
  }
  if (isHubArea.value) {
    return '录播调度'
  }
  return '文件服务'
})

/** Sections the current user actually holds grants for. */
const visibleSections = computed(() =>
  activeSections.value.filter((section) => {
    if (!auth.permissionsLoaded) {
      // Grants are still unknown - either the read is in flight or it failed. Nothing is
      // hidden on a guess: an IAM outage must not collapse the sidebar, and a retry must
      // not blank it again. Pages and the router guard report what they cannot reach.
      return true
    }
    if (section.areas) {
      return section.areas.some((area) => auth.hasIamArea(area))
    }
    const { system, actions } = section
    if (system !== undefined && actions !== undefined) {
      return actions.some((action) => auth.hasGrant(system, action))
    }
    return true
  }),
)

/**
 * Header service entries. A gated service (see `registry.ts`) disappears once the grant
 * set is loaded and holds none of its actions; while grants are unknown or unreadable
 * it stays reachable so the area itself can explain the situation.
 */
const visibleServices = computed(() =>
  services.filter((service) => {
    if (!service.gate || !auth.permissionsLoaded) {
      return true
    }
    return service.gate.actions.some((action) => auth.hasGrant(service.gate!.system, action))
  }),
)

const activeSectionPath = computed(
  () =>
    activeSections.value.find(
      (section) => route.path === section.path || route.path.startsWith(`${section.path}/`),
    )?.path ?? '',
)

const displayName = computed(() => auth.profile?.display_name || auth.profile?.username || '用户')

onMounted(() => {
  if (auth.isAuthenticated) {
    if (!auth.profile) {
      auth.fetchProfile().catch(() => {
        // Header keeps the generic label; the HTTP layer already handles expired sessions.
      })
    }
    if (!auth.permissionsLoaded) {
      auth.fetchPermissions().catch(() => {
        // Every entry stays visible while the grants are unknown, so say why the header and
        // the sidebar are showing more than the account may open.
        ElMessage.warning('无法读取当前账号的权限，功能入口暂不过滤显示')
      })
    }
  }
})

async function onUserCommand(command: string): Promise<void> {
  if (command === 'me') {
    await router.push('/iam/me')
    return
  }
  if (command === 'logout') {
    await auth.logout()
    await router.push('/iam/login')
  }
}
</script>

<template>
  <el-container class="app-shell">
    <el-header class="app-header" height="64px">
      <div class="app-brand">
        <el-icon class="app-brand-icon" :size="22"><School /></el-icon>
        <span class="app-brand-title">智慧教室管理平台</span>
      </div>

      <nav class="service-nav" aria-label="服务导航">
        <button
          v-for="service in visibleServices"
          :key="service.key"
          type="button"
          class="service-nav-item"
          :class="{ 'is-active': activeServicePath === service.path }"
          @click="router.push(service.path)"
        >
          <el-icon :size="16"><component :is="service.icon" /></el-icon>
          <span>{{ service.title }}</span>
        </button>
      </nav>

      <div class="app-header-right">
        <ThemeToggle />
        <el-dropdown v-if="auth.isAuthenticated" @command="onUserCommand">
          <span class="app-user">
            {{ displayName }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="me">个人中心</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
        <el-button v-else type="primary" @click="router.push('/iam/login')">登录</el-button>
      </div>
    </el-header>

    <el-container class="app-body">
      <el-aside v-if="isIamArea || isHubArea || isFileArea" :width="collapsed ? '64px' : '220px'" class="app-aside">
        <div v-if="!collapsed" class="app-aside-title">{{ asideTitle }}</div>
        <el-menu
          class="app-aside-menu"
          :collapse="collapsed"
          :collapse-transition="false"
          :default-active="activeSectionPath"
          router
        >
          <el-menu-item v-for="section in visibleSections" :key="section.path" :index="section.path">
            <el-icon><component :is="section.icon" /></el-icon>
            <template #title>{{ section.title }}</template>
          </el-menu-item>
        </el-menu>
        <div class="app-aside-footer">
          <el-tooltip :content="collapsed ? '展开侧栏' : '收起侧栏'" placement="right">
            <el-button class="app-aside-toggle" text @click="collapsed = !collapsed">
              <el-icon :size="18"><Expand v-if="collapsed" /><Fold v-else /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </el-aside>

      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.app-shell {
  height: 100%;
}

.app-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 0 16px;
  background-color: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-light);
}

.app-brand {
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
}

.app-brand-icon {
  color: var(--el-color-primary);
}

.app-brand-title {
  font-size: 17px;
  font-weight: 600;
  white-space: nowrap;
  color: var(--el-text-color-primary);
}

.service-nav {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
}

.service-nav-item {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 14px;
  border: none;
  border-radius: 8px;
  background-color: transparent;
  color: var(--el-text-color-regular);
  font-family: inherit;
  font-size: 14px;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background-color 0.2s,
    color 0.2s;
}

.service-nav-item:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.service-nav-item.is-active {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.app-header-right {
  display: flex;
  flex: none;
  align-items: center;
  gap: 12px;
}

.app-user {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  outline: none;
  color: var(--el-text-color-primary);
}

.app-body {
  flex: 1;
  min-height: 0;
}

.app-aside {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color-light);
  transition: width 0.2s;
}

.app-aside-title {
  flex: none;
  padding: 16px 20px 8px;
  font-size: 12px;
  letter-spacing: 0.5px;
  white-space: nowrap;
  color: var(--el-text-color-secondary);
}

.app-aside-menu {
  flex: 1;
  box-sizing: border-box;
  padding: 4px 0;
  overflow-x: hidden;
  overflow-y: auto;
  border-right: none;
  scrollbar-width: thin;
  scrollbar-color: var(--el-border-color-lighter) transparent;
}

.app-aside-menu::-webkit-scrollbar {
  width: 6px;
}

.app-aside-menu::-webkit-scrollbar-track {
  background-color: transparent;
}

.app-aside-menu::-webkit-scrollbar-thumb {
  border-radius: 3px;
  background-color: var(--el-border-color-lighter);
}

.app-aside-menu:not(.el-menu--collapse) {
  width: 100%;
}

/* The 64px rail keeps its icons dead-centre: scrolling stays, the bar does not. */
.app-aside-menu.el-menu--collapse {
  scrollbar-width: none;
}

.app-aside-menu.el-menu--collapse::-webkit-scrollbar {
  width: 0;
}

.app-aside-menu :deep(.el-menu-item) {
  height: 42px;
  margin-bottom: 2px;
  line-height: 42px;
}

.app-aside-menu:not(.el-menu--collapse) :deep(.el-menu-item) {
  margin-right: 8px;
  margin-left: 8px;
  border-radius: 8px;
}

.app-aside-menu :deep(.el-menu-item:hover) {
  background-color: var(--el-fill-color-light);
}

.app-aside-menu :deep(.el-menu-item.is-active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
  font-weight: 600;
}

.app-aside-menu :deep(.el-menu-item.is-active:hover) {
  background-color: var(--el-color-primary-light-8);
}

.app-aside-footer {
  display: flex;
  flex: none;
  justify-content: center;
  padding: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.app-aside-toggle {
  width: 100%;
  color: var(--el-text-color-secondary);
}

.app-main {
  padding: 0;
  background-color: var(--el-bg-color-page);
}
</style>
