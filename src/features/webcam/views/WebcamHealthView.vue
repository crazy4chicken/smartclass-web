<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import dayjs from 'dayjs'
import { Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { fetchLiveness, fetchReadiness } from '@/features/webcam/api'

interface ProbeState {
  ok: boolean
  label: string
  detail: string
  checkedAt: string
}

const liveness = ref<ProbeState | null>(null)
const readiness = ref<ProbeState | null>(null)
const loading = ref(false)
const autoRefresh = ref(false)
let timer: number | undefined

function stamp(): string {
  return dayjs().format('HH:mm:ss')
}

async function probe(kind: 'live' | 'ready'): Promise<ProbeState> {
  try {
    const result = kind === 'live' ? await fetchLiveness() : await fetchReadiness()
    return { ok: true, label: result.status, detail: result.reason ?? '', checkedAt: stamp() }
  } catch (error) {
    return { ok: false, label: errorMessage(error), detail: '', checkedAt: stamp() }
  }
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    const [live, ready] = await Promise.all([probe('live'), probe('ready')])
    liveness.value = live
    readiness.value = ready
  } finally {
    loading.value = false
  }
}

function setAutoRefresh(enabled: boolean): void {
  autoRefresh.value = enabled
  window.clearInterval(timer)
  if (enabled) {
    timer = window.setInterval(() => {
      void refresh()
    }, 15000)
  }
}

onMounted(() => {
  void refresh()
})

onUnmounted(() => {
  window.clearInterval(timer)
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">服务健康</div>
      <div class="toolbar-actions">
        <el-switch v-model="autoRefresh" active-text="每 15 秒自动刷新" @change="setAutoRefresh(!!autoRefresh)" />
        <el-button :icon="Refresh" :loading="loading" @click="refresh">立即刷新</el-button>
      </div>
    </div>

    <div class="probes">
      <el-card shadow="never">
        <template #header>存活探针 /healthz</template>
        <div v-if="liveness" class="probe">
          <el-tag :type="liveness.ok ? 'success' : 'danger'" size="large">
            {{ liveness.ok ? liveness.label : '不可用' }}
          </el-tag>
          <div class="probe-detail">{{ liveness.ok ? '进程存活' : liveness.label }}</div>
          <div class="probe-hint">检查时间 {{ liveness.checkedAt }}</div>
        </div>
        <el-empty v-else description="尚未探测" />
      </el-card>

      <el-card shadow="never">
        <template #header>就绪探针 /readyz</template>
        <div v-if="readiness" class="probe">
          <el-tag :type="readiness.ok ? 'success' : 'danger'" size="large">
            {{ readiness.ok ? readiness.label : '未就绪' }}
          </el-tag>
          <div class="probe-detail">{{ readiness.ok ? '可以接受请求' : readiness.label }}</div>
          <div v-if="readiness.detail" class="probe-hint">{{ readiness.detail }}</div>
          <div class="probe-hint">检查时间 {{ readiness.checkedAt }}</div>
        </div>
        <el-empty v-else description="尚未探测" />
      </el-card>
    </div>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.probes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 12px;
}

.probe {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.probe-detail {
  font-size: 14px;
}

.probe-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
