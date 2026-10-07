<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

import { isApiError } from '@/api/http'
import type { AuditEntry } from '@/api/types'
import { useCursorList } from '@/composables/useCursorList'
import { errorMessage } from '@/utils/error'

import { exportAuditEntries, listAuditEntries, type AuditExportFormat } from '../api'

const teamId = ref('')
const teamIdInput = ref('')
const exportFormat = ref<AuditExportFormat>('jsonl')
const exporting = ref(false)

const { items, loading, finished, loadMore, reload } = useCursorList<AuditEntry>((cursor, limit) =>
  listAuditEntries({ cursor, limit, team_id: teamId.value || undefined }),
)

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

function formatDiff(diff: unknown): string {
  if (diff === null || diff === undefined) {
    return '（无变更详情）'
  }
  try {
    return JSON.stringify(diff, null, 2)
  } catch {
    return String(diff)
  }
}

function diffSummary(diff: unknown): string {
  if (diff === null || diff === undefined) {
    return '—'
  }
  if (typeof diff === 'object') {
    const count = Array.isArray(diff) ? diff.length : Object.keys(diff as Record<string, unknown>).length
    return Array.isArray(diff) ? `${count} 项` : `${count} 个字段`
  }
  return String(diff)
}

/** The list composable reports a failed page itself, so these only drive the filters. */
async function fetchPage(): Promise<void> {
  await loadMore()
}

async function onFilter(): Promise<void> {
  teamId.value = teamIdInput.value.trim()
  await reload()
}

async function onResetFilter(): Promise<void> {
  teamIdInput.value = ''
  teamId.value = ''
  await reload()
}

/** Blob error bodies bypass the shared problem+json parsing, so map documented statuses here. */
function exportErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.detail) {
      return errorMessage(error)
    }
    if (error.status === 400) {
      return '导出参数无效（format 必须为 jsonl 或 csv）'
    }
    if (error.status === 401) {
      return '登录状态已失效，请重新登录'
    }
    if (error.status === 403) {
      return '权限不足，无法导出审计日志'
    }
    if (error.status === 500) {
      return '认证服务不可用'
    }
  }
  return errorMessage(error)
}

async function onExport(): Promise<void> {
  exporting.value = true
  try {
    const blob = await exportAuditEntries(exportFormat.value, teamId.value)
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `audit-export-${dayjs().format('YYYYMMDD-HHmmss')}.${exportFormat.value}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('导出文件已开始下载')
  } catch (error) {
    ElMessage.error(exportErrorMessage(error))
  } finally {
    exporting.value = false
  }
}

onMounted(fetchPage)
</script>

<template>
  <div class="audit-page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="teamIdInput"
          class="team-filter"
          clearable
          placeholder="按团队 ID 过滤"
          @keyup.enter="onFilter"
          @clear="onFilter"
        />
        <el-button type="primary" @click="onFilter">查询</el-button>
        <el-button @click="onResetFilter">重置</el-button>
        <div class="toolbar-spacer" />
        <el-select v-model="exportFormat" class="format-select">
          <el-option label="JSON Lines" value="jsonl" />
          <el-option label="CSV" value="csv" />
        </el-select>
        <el-button type="primary" plain :loading="exporting" @click="onExport">导出</el-button>
      </div>

      <el-table v-loading="loading" :data="items" border stripe empty-text="暂无审计记录">
        <el-table-column type="expand">
          <template #default="{ row }">
            <pre class="diff">{{ formatDiff(row.diff) }}</pre>
          </template>
        </el-table-column>
        <el-table-column label="时间" width="180">
          <template #default="{ row }">{{ formatTime(row.at) }}</template>
        </el-table-column>
        <el-table-column label="操作者" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.actor_id || '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作" min-width="180" show-overflow-tooltip />
        <el-table-column label="目标" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.target }}</span>
          </template>
        </el-table-column>
        <el-table-column label="变更详情" width="120">
          <template #default="{ row }">
            <el-tag size="small" type="info">{{ diffSummary(row.diff) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="请求 ID" min-width="160">
          <template #default="{ row }">
            <span class="mono">{{ row.request_id || '—' }}</span>
          </template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-button v-if="!finished" :loading="loading" @click="fetchPage">加载更多</el-button>
        <span v-else class="pager-tip">已加载全部记录（共 {{ items.length }} 条）</span>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.team-filter {
  width: 260px;
}

.format-select {
  width: 130px;
}

.toolbar-spacer {
  flex: 1;
}

.diff {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}

.pager {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.pager-tip {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
