<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { fetchLiveness, fetchMePermissions, fetchReadiness, fetchUsage } from '@/features/file/api'
import type { MePermissions, ProbeResult, Usage } from '@/features/file/api'

const usage = ref<Usage | null>(null)
const permissions = ref<MePermissions | null>(null)
const liveness = ref<ProbeResult | null>(null)
const readiness = ref<ProbeResult | null>(null)
const readinessError = ref('')
const loading = ref(false)

const allowKeys = computed(() => (permissions.value?.permissions ?? []).filter((key) => !key.startsWith('!')))
const denyKeys = computed(() => (permissions.value?.permissions ?? []).filter((key) => key.startsWith('!')))

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatQuota(value: number, unit: 'bytes' | 'objects'): string {
  if (value === 0) {
    return '不限'
  }
  return unit === 'bytes' ? formatBytes(value) : `${value} 个`
}

async function refresh(): Promise<void> {
  loading.value = true
  readinessError.value = ''
  try {
    usage.value = await fetchUsage()
    permissions.value = await fetchMePermissions()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
  liveness.value = await fetchLiveness().catch(() => null)
  try {
    readiness.value = await fetchReadiness()
  } catch (error) {
    readiness.value = null
    readinessError.value = errorMessage(error)
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">我的存储</div>
      <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <div class="cards">
      <el-card shadow="never">
        <template #header>已用容量</template>
        <div class="metric">{{ usage ? formatBytes(usage.used_bytes) : '—' }}</div>
        <div class="metric-hint">配额 {{ usage ? formatQuota(usage.quota_bytes, 'bytes') : '—' }}</div>
      </el-card>
      <el-card shadow="never">
        <template #header>已用对象数</template>
        <div class="metric">{{ usage?.used_objects ?? '—' }}</div>
        <div class="metric-hint">配额 {{ usage ? formatQuota(usage.quota_objects, 'objects') : '—' }}</div>
      </el-card>
      <el-card shadow="never">
        <template #header>探针</template>
        <div class="probe-row">
          <el-tag :type="liveness?.status === 'ok' ? 'success' : 'danger'">/healthz {{ liveness?.status ?? '—' }}</el-tag>
          <el-tag :type="readiness?.status === 'ready' ? 'success' : 'danger'">
            /readyz {{ readiness?.status ?? 'unavailable' }}
          </el-tag>
        </div>
        <div v-if="readinessError" class="metric-hint">{{ readinessError }}</div>
      </el-card>
    </div>

    <el-card shadow="never">
      <template #header>按桶用量</template>
      <el-table :data="usage?.buckets ?? []" border size="small">
        <el-table-column prop="bucket_name" label="桶" min-width="180" />
        <el-table-column label="归属" width="130">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ row.owner_kind }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="已用 / 桶配额" min-width="230">
          <template #default="{ row }">
            {{ formatBytes(row.used_bytes) }} · {{ row.used_objects }} 个 /
            {{ formatQuota(row.quota_bytes, 'bytes') }} · {{ formatQuota(row.quota_objects, 'objects') }}
          </template>
        </el-table-column>
        <el-table-column label="主体上限" min-width="200">
          <template #default="{ row }">
            {{ formatQuota(row.subject_max_bytes, 'bytes') }} · {{ formatQuota(row.subject_max_objects, 'objects') }}
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        我的 filehouse 权限
        <span v-if="permissions" class="field-hint">{{ permissions.subject.kind }} · {{ permissions.subject.id }}</span>
      </template>
      <div class="keys">
        <el-tag v-for="key in allowKeys" :key="key" type="success" class="key-tag">{{ key }}</el-tag>
        <el-tag v-for="key in denyKeys" :key="key" type="danger" class="key-tag">{{ key }}</el-tag>
        <span v-if="!permissions" class="field-hint">加载中…</span>
      </div>
    </el-card>
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

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
}

.metric {
  font-size: 24px;
  font-weight: 600;
}

.metric-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.probe-row {
  display: flex;
  gap: 8px;
}

.keys {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.key-tag {
  font-family: monospace;
}

.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
