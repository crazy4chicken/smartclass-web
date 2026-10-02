<script setup lang="ts">
import { Check, Monitor, Moon, Sunny } from '@element-plus/icons-vue'

import { useTheme, type ThemeMode } from '@/composables/useTheme'

const { mode, resolved, setThemeMode } = useTheme()

const options: Array<{ value: ThemeMode; label: string; icon: typeof Sunny }> = [
  { value: 'light', label: '浅色模式', icon: Sunny },
  { value: 'dark', label: '深色模式', icon: Moon },
  { value: 'system', label: '跟随系统', icon: Monitor },
]
</script>

<template>
  <el-dropdown trigger="click" @command="(value: ThemeMode) => setThemeMode(value)">
    <el-button class="theme-toggle" circle text aria-label="切换外观主题" title="外观主题">
      <el-icon :size="18">
        <Monitor v-if="mode === 'system'" />
        <Moon v-else-if="resolved === 'dark'" />
        <Sunny v-else />
      </el-icon>
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          v-for="option in options"
          :key="option.value"
          :command="option.value"
          :class="{ 'is-active-mode': mode === option.value }"
        >
          <el-icon><component :is="option.icon" /></el-icon>
          <span>{{ option.label }}</span>
          <el-icon v-if="mode === option.value" class="check"><Check /></el-icon>
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.theme-toggle {
  color: var(--el-text-color-regular);
}

.theme-toggle:hover {
  background-color: var(--el-fill-color-light);
  color: var(--el-color-primary);
}

.is-active-mode {
  color: var(--el-color-primary);
}

.check {
  margin-left: 12px;
}
</style>
