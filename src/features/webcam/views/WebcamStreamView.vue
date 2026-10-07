<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Download, Link, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { getStream } from '@/features/webcam/api'
import type { StreamDetail, StreamSegment } from '@/features/webcam/api'

const route = useRoute()
const router = useRouter()

const streamId = computed(() => String(route.params.streamId ?? ''))
const detail = ref<StreamDetail | null>(null)
const loading = ref(false)

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) {
    return '—'
  }
  const seconds = ms / 1000
  return seconds < 60 ? `${seconds.toFixed(1)} 秒` : `${(seconds / 60).toFixed(1)} 分钟`
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    detail.value = await getStream(streamId.value, 500)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function copyLink(row: StreamSegment & { download_url?: string }): Promise<void> {
  if (!row.download_url) {
    ElMessage.warning('该分段没有可用的下载链接（对象可能已被回收）')
    return
  }
  try {
    await navigator.clipboard.writeText(row.download_url)
    ElMessage.success('下载链接已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <div class="toolbar-title">
        <el-button link @click="router.push(`/webcam/devices/${encodeURIComponent(detail?.device_id ?? '')}`)">
          ← 设备详情
        </el-button>
        <span>录制分段</span>
        <span class="mono">{{ streamId }}</span>
      </div>
      <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
    </div>

    <el-card shadow="never">
      <template #header>场次信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="设备 ID"><span class="mono">{{ detail?.device_id ?? '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="摄像头编号">{{ detail?.camera_enum ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="detail?.status === 'active' ? 'success' : detail?.status === 'failed' ? 'danger' : 'info'">
            {{ detail?.status === 'active' ? '录制中' : detail?.status === 'completed' ? '已完成' : detail?.status === 'failed' ? '失败' : '—' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="分辨率">{{ detail?.metadata?.resolution || '—' }}</el-descriptions-item>
        <el-descriptions-item label="开始">{{ formatTime(detail?.started_at) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ formatTime(detail?.ended_at) }}</el-descriptions-item>
        <el-descriptions-item label="帧率">{{ detail?.metadata?.fps ? `${detail.metadata.fps} fps` : '—' }}</el-descriptions-item>
        <el-descriptions-item label="编码">
          {{ (detail?.metadata?.codecs ?? (detail?.metadata?.codec ? [detail.metadata.codec] : [])).join(' / ') || '—' }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <template #header>
        分段
        <span class="field-hint">{{ detail?.segments?.length ?? 0 }} 个</span>
      </template>
      <el-table :data="detail?.segments ?? []" border size="small">
        <el-table-column prop="segment_seq" label="序号" width="80" />
        <el-table-column prop="id" label="分段 ID" min-width="240" show-overflow-tooltip />
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
        </el-table-column>
        <el-table-column label="时长" width="110">
          <template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template>
        </el-table-column>
        <el-table-column label="写入时间" width="170">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="170" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              :icon="Download"
              :disabled="!row.download_url"
              tag="a"
              :href="row.download_url"
              target="_blank"
              rel="noopener"
            >
              下载
            </el-button>
            <el-button link type="primary" :icon="Link" @click="copyLink(row)">复制链接</el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="该场次还没有分段" />
        </template>
      </el-table>
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.mono {
  font-family: monospace;
}

.field-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
