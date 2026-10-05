<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { CopyDocument, Download, Refresh, VideoPause, VideoPlay } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import { getSession, getSessionArtifacts, listSessions, startSessionRecording, stopSessionRecording } from '@/features/hub/api'
import type { Session, SessionArtifacts, SessionDetail, SessionQuery } from '@/features/hub/api'

const auth = useAuthStore()
const canControl = auth.hasGrant('dispatch', 'control')

type TagType = 'success' | 'info' | 'warning' | 'danger'

const STATUS_META: Record<string, { label: string; type: TagType }> = {
  planned: { label: '已计划', type: 'info' },
  starting: { label: '启动中', type: 'warning' },
  recording: { label: '录制中', type: 'danger' },
  stopping: { label: '停止中', type: 'warning' },
  completed: { label: '已完成', type: 'success' },
  failed: { label: '失败', type: 'danger' },
  canceled: { label: '已取消', type: 'info' },
  missed: { label: '已错过', type: 'warning' },
}

const STATUS_OPTIONS = Object.entries(STATUS_META).map(([value, meta]) => ({ value, label: meta.label }))

function statusMeta(status: string): { label: string; type: TagType } {
  return STATUS_META[status] ?? { label: status, type: 'info' }
}

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

const filters = ref<{ term_code: string; room_code: string; status: string; date: string; course_code: string; limit: number }>({
  term_code: '',
  room_code: '',
  status: '',
  date: '',
  course_code: '',
  limit: 100,
})

const sessions = ref<Session[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    const query: SessionQuery = { limit: filters.value.limit }
    if (filters.value.term_code.trim() !== '') {
      query.term_code = filters.value.term_code.trim()
    }
    if (filters.value.room_code.trim() !== '') {
      query.room_code = filters.value.room_code.trim()
    }
    if (filters.value.status !== '') {
      query.status = filters.value.status
    }
    if (filters.value.date !== '') {
      query.date = filters.value.date
    }
    if (filters.value.course_code.trim() !== '') {
      query.course_code = filters.value.course_code.trim()
    }
    sessions.value = await listSessions(query)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function resetFilters(): void {
  filters.value = { term_code: '', room_code: '', status: '', date: '', course_code: '', limit: 100 }
  void load()
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

/** A fresh key per operator action: it only deduplicates retries of that same command. */
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

async function onStart(row: Session): Promise<void> {
  try {
    await startSessionRecording(row.id, newIdempotencyKey())
    ElMessage.success('已下发开始录制指令')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onStop(row: Session): Promise<void> {
  try {
    await stopSessionRecording(row.id, newIdempotencyKey())
    ElMessage.success('已下发停止录制指令')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

// --- Detail drawer ---------------------------------------------------------

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<SessionDetail | null>(null)
const artifacts = ref<SessionArtifacts | null>(null)
const artifactsLoading = ref(false)

async function openDetail(row: Session): Promise<void> {
  detailVisible.value = true
  detail.value = null
  artifacts.value = null
  detailLoading.value = true
  try {
    detail.value = await getSession(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function loadArtifacts(): Promise<void> {
  const session = detail.value
  if (!session) {
    return
  }
  artifactsLoading.value = true
  try {
    artifacts.value = await getSessionArtifacts(session.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    artifactsLoading.value = false
  }
}

function upstreamText(): string {
  const upstream = detail.value?.upstream
  if (upstream === undefined || upstream === null) {
    return '—'
  }
  return JSON.stringify(upstream, null, 2)
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">录播场次</div>
      <div class="filters">
        <el-input v-model="filters.term_code" class="filter-input" placeholder="学期编码" clearable />
        <el-input v-model="filters.room_code" class="filter-input" placeholder="教室编码" clearable />
        <el-select v-model="filters.status" class="filter-select" placeholder="全部状态" clearable>
          <el-option v-for="option in STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
        <el-date-picker v-model="filters.date" type="date" value-format="YYYY-MM-DD" placeholder="UTC 日期" class="filter-date" />
        <el-input v-model="filters.course_code" class="filter-input" placeholder="课程编码" clearable />
        <el-select v-model="filters.limit" class="filter-limit">
          <el-option :value="50" label="50 条" />
          <el-option :value="100" label="100 条" />
          <el-option :value="200" label="200 条" />
          <el-option :value="500" label="500 条" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="resetFilters">重置</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="sessions" border stripe>
      <el-table-column label="场次 ID" min-width="300">
        <template #default="{ row }">
          <div class="id-cell">
            <span class="mono">{{ row.id }}</span>
            <el-button link type="primary" :icon="CopyDocument" title="复制 ID" @click="copy(row.id, 'ID')" />
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="room_code" label="教室" width="120" />
      <el-table-column prop="origin" label="来源" width="110" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="计划开始" width="180">
        <template #default="{ row }">{{ formatTime(row.starts_at) }}</template>
      </el-table-column>
      <el-table-column label="计划结束" width="180">
        <template #default="{ row }">{{ formatTime(row.ends_at) }}</template>
      </el-table-column>
      <el-table-column label="实际操作" width="180">
        <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button
            v-if="canControl && (row.status === 'planned' || row.status === 'failed')"
            link
            type="success"
            :icon="VideoPlay"
            @click="onStart(row)"
          >
            开始
          </el-button>
          <el-button
            v-if="canControl && (row.status === 'recording' || row.status === 'starting')"
            link
            type="warning"
            :icon="VideoPause"
            @click="onStop(row)"
          >
            停止
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-drawer v-model="detailVisible" title="场次详情" size="640px">
      <div v-loading="detailLoading" class="detail-body">
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="场次 ID">
              <div class="id-cell">
                <span class="mono">{{ detail.id }}</span>
                <el-button link type="primary" :icon="CopyDocument" title="复制 ID" @click="copy(detail.id, 'ID')" />
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="教室 / 设备">
              {{ detail.room_code }} · {{ detail.device_id }} （机位 {{ detail.camera_enum }}）
            </el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detail.status).type">{{ statusMeta(detail.status).label }}</el-tag>
              <span v-if="detail.retry_count" class="detail-hint">重试 {{ detail.retry_count }} 次</span>
            </el-descriptions-item>
            <el-descriptions-item label="计划窗口">
              {{ formatTime(detail.starts_at) }} → {{ formatTime(detail.ends_at) }}
            </el-descriptions-item>
            <el-descriptions-item label="实际窗口">
              {{ formatTime(detail.started_at) }} → {{ formatTime(detail.stopped_at) }}
            </el-descriptions-item>
            <el-descriptions-item label="流 ID">{{ detail.stream_id ?? '—' }}</el-descriptions-item>
            <el-descriptions-item label="课表条目">{{ detail.entry_id ?? '—' }}</el-descriptions-item>
            <el-descriptions-item v-if="detail.last_error" label="最近错误">{{ detail.last_error }}</el-descriptions-item>
          </el-descriptions>

          <div class="detail-section">
            <div class="detail-section-title">照片账本</div>
            <el-table v-if="detail.photos.length" :data="detail.photos" border size="small">
              <el-table-column prop="id" label="照片 ID" min-width="220" show-overflow-tooltip />
              <el-table-column prop="status" label="状态" width="110" />
              <el-table-column prop="source" label="来源" width="110" />
              <el-table-column prop="attempts" label="尝试" width="80" />
              <el-table-column label="拍摄时间" width="170">
                <template #default="{ row }">{{ formatTime(row.taken_at) }}</template>
              </el-table-column>
            </el-table>
            <el-alert v-else type="info" :closable="false" title="该场次没有照片记录" />
          </div>

          <div class="detail-section">
            <div class="detail-section-title">
              录制产物
              <el-button class="detail-load" link type="primary" :loading="artifactsLoading" @click="loadArtifacts">
                获取下载地址
              </el-button>
            </div>
            <el-alert
              class="detail-tip"
              type="info"
              :closable="false"
              title="下载地址由 webcam-server 现场签发，约 15 分钟后失效，失效后重新获取即可。"
            />
            <template v-if="artifacts">
              <el-table v-if="artifacts.segments.length" :data="artifacts.segments" border size="small">
                <el-table-column prop="segment_seq" label="片段" width="80" />
                <el-table-column label="大小" width="120">
                  <template #default="{ row }">{{ (row.size_bytes / 1024 / 1024).toFixed(2) }} MiB</template>
                </el-table-column>
                <el-table-column label="时长" width="110">
                  <template #default="{ row }">{{ row.duration_ms ? `${(row.duration_ms / 1000).toFixed(1)} s` : '—' }}</template>
                </el-table-column>
                <el-table-column label="" width="110">
                  <template #default="{ row }">
                    <el-link :href="row.download_url" target="_blank" type="primary" :icon="Download">下载</el-link>
                  </template>
                </el-table-column>
              </el-table>
              <el-table v-if="artifacts.photos.length" :data="artifacts.photos" border size="small" class="detail-table">
                <el-table-column prop="photo_id" label="照片" min-width="200" show-overflow-tooltip />
                <el-table-column label="拍摄时间" width="170">
                  <template #default="{ row }">{{ formatTime(row.taken_at) }}</template>
                </el-table-column>
                <el-table-column label="" width="110">
                  <template #default="{ row }">
                    <el-link :href="row.download_url" target="_blank" type="primary" :icon="Download">下载</el-link>
                  </template>
                </el-table-column>
              </el-table>
              <el-alert
                v-if="!artifacts.segments.length && !artifacts.photos.length"
                type="info"
                :closable="false"
                :title="`暂无可下载产物（状态 ${artifacts.status}）`"
              />
            </template>
          </div>

          <div class="detail-section">
            <div class="detail-section-title">上游流信息</div>
            <pre class="detail-pre">{{ upstreamText() }}</pre>
          </div>
        </template>
      </div>
    </el-drawer>
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
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
}

.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-input {
  width: 150px;
}

.filter-select {
  width: 140px;
}

.filter-date {
  width: 160px;
}

.filter-limit {
  width: 110px;
}

.id-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mono {
  font-family: monospace;
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.detail-section-title {
  margin-bottom: 8px;
  font-weight: 600;
}

.detail-load {
  margin-left: 8px;
}

.detail-tip {
  margin-bottom: 8px;
}

.detail-table {
  margin-top: 8px;
}

.detail-pre {
  max-height: 240px;
  margin: 0;
  padding: 8px;
  overflow: auto;
  font-size: 12px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
}
</style>
