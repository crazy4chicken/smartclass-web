<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import type { UploadFile, UploadInstance } from 'element-plus'
import { CopyDocument, Refresh, Upload } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import { getImport, importTimetable, listImports, MAX_IMPORT_BYTES } from '@/features/hub/api'
import type { ImportBatch, ImportError, ImportOptions, ImportResult } from '@/features/hub/api'

const auth = useAuthStore()
const canManage = auth.hasGrant('dispatch', 'manage')

type TagType = 'success' | 'info' | 'warning' | 'danger'

const STATUS_META: Record<string, { label: string; type: TagType }> = {
  dry_run: { label: '试运行', type: 'info' },
  committed: { label: '已提交', type: 'success' },
  failed: { label: '校验失败', type: 'danger' },
}

function statusMeta(status: string): { label: string; type: TagType } {
  return STATUS_META[status] ?? { label: status, type: 'info' }
}

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

const filters = ref({ term_code: '', limit: 100 })
const batches = ref<ImportBatch[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    batches.value = await listImports(filters.value.term_code.trim(), filters.value.limit)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

// --- Import dialog ---------------------------------------------------------

const importVisible = ref(false)
const importSubmitting = ref(false)
const uploadRef = ref<UploadInstance>()
const selectedFile = ref<File | null>(null)
const importOptions = ref<ImportOptions>({ mode: 'replace', dryRun: true, force: false })
const outcome = ref<{ result?: ImportResult; failure?: { message: string; errors: ImportError[] } }>({})

function openImport(): void {
  selectedFile.value = null
  outcome.value = {}
  importOptions.value = { mode: 'replace', dryRun: true, force: false }
  importVisible.value = true
  uploadRef.value?.clearFiles()
}

function onFileChange(file: UploadFile): void {
  const raw = file.raw
  if (!raw) {
    return
  }
  if (raw.size > MAX_IMPORT_BYTES) {
    ElMessage.error('文件超过 1 MiB，服务端会拒绝该文件')
    uploadRef.value?.clearFiles()
    selectedFile.value = null
    return
  }
  selectedFile.value = raw
  outcome.value = {}
}

async function submitImport(): Promise<void> {
  const file = selectedFile.value
  if (!file) {
    ElMessage.error('请选择 CSV 文件')
    return
  }
  importSubmitting.value = true
  try {
    const result = await importTimetable(file, importOptions.value)
    if (result.ok) {
      outcome.value = { result: result.batch }
      ElMessage.success(result.batch.status === 'dry_run' ? '试运行完成，未写入数据' : '课表已导入')
      await load()
    } else {
      outcome.value = { failure: { message: result.message, errors: result.errors } }
      ElMessage.error(result.message)
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    importSubmitting.value = false
  }
}

// --- Batch detail ----------------------------------------------------------

const detailVisible = ref(false)
const detailLoading = ref(false)
const detail = ref<ImportBatch | null>(null)

async function openDetail(row: ImportBatch): Promise<void> {
  detailVisible.value = true
  detail.value = null
  detailLoading.value = true
  try {
    detail.value = await getImport(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">课表导入</div>
      <div class="filters">
        <el-input v-model="filters.term_code" class="filter-input" placeholder="学期编码" clearable />
        <el-select v-model="filters.limit" class="filter-limit">
          <el-option :value="50" label="50 条" />
          <el-option :value="100" label="100 条" />
          <el-option :value="200" label="200 条" />
          <el-option :value="500" label="500 条" />
        </el-select>
        <el-button type="primary" @click="load">查询</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Upload" @click="openImport">导入 CSV</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="batches" border stripe>
      <el-table-column label="批次 ID" min-width="300">
        <template #default="{ row }">
          <div class="id-cell">
            <span class="mono">{{ row.id }}</span>
            <el-button link type="primary" :icon="CopyDocument" title="复制 ID" @click="copy(row.id, 'ID')" />
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="term_code" label="学期" width="130" />
      <el-table-column prop="filename" label="文件" min-width="200" show-overflow-tooltip />
      <el-table-column prop="mode" label="模式" width="100" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="行数（成功/错误）" width="170">
        <template #default="{ row }">{{ row.row_count }}（{{ row.ok_count }}/{{ row.error_count }}）</template>
      </el-table-column>
      <el-table-column label="导入时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="importVisible" title="导入课表 CSV" width="760px" :close-on-click-modal="false">
      <el-alert class="block" type="info" :closable="false">
        <template #title>
          表头固定为 term_code,course_code,course_name,teacher_username,room_code,weekday,period_start,period_end,weeks（顺序不限，大小写敏感），最大 1 MiB。
        </template>
      </el-alert>
      <el-form label-width="120px">
        <el-form-item label="CSV 文件">
          <el-upload
            ref="uploadRef"
            :auto-upload="false"
            :limit="1"
            :show-file-list="true"
            accept=".csv,text/csv"
            :on-change="onFileChange"
          >
            <el-button :icon="Upload">选择文件</el-button>
          </el-upload>
        </el-form-item>
        <el-form-item label="导入模式">
          <el-radio-group v-model="importOptions.mode">
            <el-radio value="replace">replace（覆盖该学期原课表）</el-radio>
            <el-radio value="append">append（追加）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="试运行">
          <el-switch v-model="importOptions.dryRun" />
          <span class="field-hint">仅校验并预览，不写入课表与场次</span>
        </el-form-item>
        <el-form-item label="强制提交">
          <el-switch v-model="importOptions.force" />
          <span class="field-hint">同一文件此前已提交时也继续写入（否则 409 重复导入）</span>
        </el-form-item>
      </el-form>

      <template v-if="outcome.result">
        <el-divider content-position="left">导入结果</el-divider>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="状态">
            <el-tag :type="statusMeta(outcome.result.status).type">{{ statusMeta(outcome.result.status).label }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="模式">{{ outcome.result.mode }}</el-descriptions-item>
          <el-descriptions-item label="行数">{{ outcome.result.row_count }}</el-descriptions-item>
          <el-descriptions-item label="成功 / 错误">
            {{ outcome.result.ok_count }} / {{ outcome.result.error_count }}
          </el-descriptions-item>
        </el-descriptions>
        <el-table v-if="outcome.result.preview?.length" :data="outcome.result.preview" border size="small" class="result-table">
          <el-table-column prop="row" label="行" width="70" />
          <el-table-column prop="course_code" label="课程" min-width="120" />
          <el-table-column prop="session_count" label="场次数" width="100" />
          <el-table-column label="首次开始" width="170">
            <template #default="{ row }">{{ formatTime(row.first_starts_at) }}</template>
          </el-table-column>
          <el-table-column label="末次结束" width="170">
            <template #default="{ row }">{{ formatTime(row.last_ends_at) }}</template>
          </el-table-column>
        </el-table>
      </template>

      <template v-if="outcome.failure">
        <el-divider content-position="left">校验失败</el-divider>
        <el-alert class="block" type="error" :closable="false" :title="outcome.failure.message" />
        <el-table v-if="outcome.failure.errors.length" :data="outcome.failure.errors" border size="small">
          <el-table-column prop="row" label="行" width="70" />
          <el-table-column prop="column" label="列" width="150" />
          <el-table-column prop="code" label="代码" width="180" />
          <el-table-column prop="message" label="说明" min-width="220" />
        </el-table>
      </template>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button type="primary" :loading="importSubmitting" @click="submitImport">开始导入</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="detailVisible" title="导入批次详情" width="720px">
      <div v-loading="detailLoading">
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="批次 ID">
              <div class="id-cell">
                <span class="mono">{{ detail.id }}</span>
                <el-button link type="primary" :icon="CopyDocument" title="复制 ID" @click="copy(detail.id, 'ID')" />
              </div>
            </el-descriptions-item>
            <el-descriptions-item label="学期 / 文件">{{ detail.term_code }} · {{ detail.filename }}</el-descriptions-item>
            <el-descriptions-item label="状态">
              <el-tag :type="statusMeta(detail.status).type">{{ statusMeta(detail.status).label }}</el-tag>
              <span class="field-hint">模式 {{ detail.mode }}</span>
            </el-descriptions-item>
            <el-descriptions-item label="行数">{{ detail.row_count }}（{{ detail.ok_count }}/{{ detail.error_count }}）</el-descriptions-item>
            <el-descriptions-item label="sha256"><span class="mono">{{ detail.sha256 }}</span></el-descriptions-item>
            <el-descriptions-item label="导入人 / 时间">
              {{ detail.imported_by }} · {{ formatTime(detail.created_at) }}
            </el-descriptions-item>
          </el-descriptions>
          <el-table v-if="detail.errors.length" :data="detail.errors" border size="small" class="result-table">
            <el-table-column prop="row" label="行" width="70" />
            <el-table-column prop="column" label="列" width="150" />
            <el-table-column prop="code" label="代码" width="180" />
            <el-table-column prop="message" label="说明" min-width="220" />
          </el-table>
          <el-alert v-else class="result-table" type="success" :closable="false" title="该批次没有错误或警告" />
        </template>
      </div>
    </el-dialog>
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
  width: 180px;
}

.filter-limit {
  width: 110px;
}

.block {
  margin-bottom: 12px;
}

.field-hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.id-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mono {
  font-family: monospace;
}

.result-table {
  margin-top: 12px;
}
</style>
