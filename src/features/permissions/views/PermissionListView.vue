<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Document, Plus, Refresh, Upload } from '@element-plus/icons-vue'

import { useCursorList } from '@/composables/useCursorList'
import type { Permission } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listAllPermissions, listPermissions, registerPermission } from '../api'
import { permissionKeyError, wildcardSuggestions } from '../grammar'
import { PERMISSION_IMPORT_MAX_ENTRIES, parsePermissionImport } from '../import'
import type { PermissionImportEntry, PermissionImportIssue } from '../import'

const keyword = ref('')
const { items, loading, finished, loadMore, reload } = useCursorList<Permission>(listPermissions)

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) {
    return items.value
  }
  return items.value.filter(
    (item) => item.key.toLowerCase().includes(kw) || item.description.toLowerCase().includes(kw),
  )
})

async function refresh(): Promise<void> {
  try {
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function loadMoreSafe(): Promise<void> {
  try {
    await loadMore()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(refresh)

function formatTime(value: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ key: '', registeredBy: '', description: '' })
const rules: FormRules = {
  key: [
    { required: true, message: '请输入权限 key', trigger: 'blur' },
    {
      validator: (_rule: unknown, value: unknown, callback: (error?: string | Error) => void) => {
        const reason = permissionKeyError(String(value ?? ''))
        if (reason) {
          callback(new Error(reason))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
  registeredBy: [{ required: true, message: '请输入注册方名称', trigger: 'blur' }],
}

/** Resource of the key being typed, used to offer its wildcard variants. */
const formResource = computed(() => form.key.trim().replace(/^!/, '').split(':')[0] ?? '')
const formWildcards = computed(() => wildcardSuggestions(formResource.value))

function applyWildcard(key: string): void {
  form.key = key
}

function openRegister(item?: Permission): void {
  form.key = item?.key ?? ''
  form.registeredBy = item?.registered_by ?? ''
  form.description = item?.description ?? ''
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  saving.value = true
  try {
    await registerPermission({
      key: form.key.trim(),
      registered_by: form.registeredBy.trim(),
      description: form.description.trim(),
    })
    ElMessage.success('权限已保存')
    dialogVisible.value = false
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

// --- JSON import -------------------------------------------------------------
// The file never leaves the browser: it is parsed and validated here, and only the
// entries that pass are registered one by one through `POST /permissions/`.

const importInput = ref<HTMLInputElement>()
const importVisible = ref(false)
const importParsing = ref(false)
const importing = ref(false)
const importEntries = ref<PermissionImportEntry[]>([])
const importIssues = ref<PermissionImportIssue[]>([])
const importFileName = ref('')
const importProgress = ref({ done: 0, total: 0 })
/** Failures from the last run, keyed by permission key. */
const importFailures = ref<Array<{ key: string; reason: string }>>([])
const importFinished = ref(false)

const importNewCount = computed(() => importEntries.value.filter((entry) => entry.state === 'new').length)
const importExistingCount = computed(() => importEntries.value.filter((entry) => entry.state === 'existing').length)

function openImport(): void {
  importInput.value?.click()
}

/** Reads and parses the picked file; a whole-file rejection never opens the preview. */
async function onImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  importParsing.value = true
  try {
    const text = await file.text()
    let knownKeys: ReadonlySet<string>
    try {
      knownKeys = new Set((await listAllPermissions()).map((permission) => permission.key))
    } catch (error) {
      ElMessage.error(`读取已注册权限失败：${errorMessage(error)}`)
      return
    }
    const parsed = parsePermissionImport(text, knownKeys)
    if (parsed.documentError) {
      ElMessage.error(parsed.documentError)
      return
    }
    importFileName.value = file.name
    importEntries.value = parsed.entries
    importIssues.value = parsed.issues
    importFailures.value = []
    importFinished.value = false
    importProgress.value = { done: 0, total: parsed.entries.length }
    importVisible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    importParsing.value = false
  }
}

async function runImport(): Promise<void> {
  importing.value = true
  importFailures.value = []
  importFinished.value = false
  importProgress.value = { done: 0, total: importEntries.value.length }
  const failures: Array<{ key: string; reason: string }> = []
  try {
    for (const entry of importEntries.value) {
      try {
        await registerPermission({
          key: entry.key,
          registered_by: entry.registeredBy,
          description: entry.description,
        })
      } catch (error) {
        failures.push({ key: entry.key, reason: errorMessage(error) })
      }
      importProgress.value = { done: importProgress.value.done + 1, total: importEntries.value.length }
    }
    importFailures.value = failures
    importFinished.value = true
    const succeeded = importEntries.value.length - failures.length
    if (failures.length === 0) {
      ElMessage.success(`已导入 ${succeeded} 条权限`)
    } else {
      ElMessage.warning(`导入完成：成功 ${succeeded} 条，失败 ${failures.length} 条`)
    }
    await refresh()
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="keyword" class="filter-input" placeholder="按 key 过滤（仅过滤已加载数据）" clearable />
      <div class="toolbar-right">
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button :icon="Upload" :loading="importParsing" @click="openImport">批量导入 JSON</el-button>
        <el-button type="primary" :icon="Plus" @click="openRegister()">注册/更新权限</el-button>
      </div>
    </div>

    <input
      ref="importInput"
      class="import-input"
      type="file"
      accept="application/json,.json"
      @change="onImportFile"
    />

    <el-table v-loading="loading" :data="filteredItems" border empty-text="暂无已注册权限">
      <el-table-column label="权限 key" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="row.key.startsWith('!')" type="danger" size="small" class="deny-tag">拒绝</el-tag>
          <span>{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="registered_by" label="注册方" min-width="160" show-overflow-tooltip />
      <el-table-column label="注册时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRegister(row)">更新</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="list-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMoreSafe">加载更多</el-button>
      <span v-else class="list-finished">已加载全部</span>
    </div>

    <el-dialog v-model="dialogVisible" title="注册/更新权限" width="560px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
        <el-form-item label="权限 key" prop="key">
          <el-input v-model="form.key" placeholder="resource:action:scope，如 iam:users:any 或 orders:*:any" />
          <div class="key-hint">
            支持通配符：action 段可写 <code>*</code>，scope 段可写 <code>own</code>/<code>team</code>/<code>any</code>/<code>*</code>；
            resource 段不支持 <code>*</code>；<code>iam</code> 只允许 <code>:any</code>（或 teams/groups/roles/bindings 的 <code>:team</code>）。
          </div>
          <div v-if="formWildcards.length" class="key-suggestions">
            <span class="key-suggestions-label">通配写法：</span>
            <el-button v-for="key in formWildcards" :key="key" link type="primary" size="small" @click="applyWildcard(key)">
              {{ key }}
            </el-button>
          </div>
        </el-form-item>
        <el-form-item label="注册方" prop="registeredBy">
          <el-input v-model="form.registeredBy" placeholder="注册该权限的服务名，如 orders-service" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="权限用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="批量导入权限" width="820px" :close-on-click-modal="false">
      <div class="import-summary">
        <span class="import-file">
          <el-icon><Document /></el-icon>
          {{ importFileName }}
        </span>
        <el-tag size="small" type="success">新增 {{ importNewCount }}</el-tag>
        <el-tag size="small" type="warning">更新 {{ importExistingCount }}</el-tag>
        <el-tag size="small" :type="importIssues.length ? 'danger' : 'info'">
          无效 {{ importIssues.length }}
        </el-tag>
        <span class="field-hint">最多 {{ PERMISSION_IMPORT_MAX_ENTRIES }} 条；格式见 docs/permission-import.md</span>
      </div>

      <el-alert
        v-if="importIssues.length"
        class="import-alert"
        type="warning"
        :closable="false"
        show-icon
        title="无效条目不会被导入，请修正后重新导入这些条目。"
      />

      <el-table :data="importEntries" border size="small" max-height="320">
        <el-table-column type="index" label="#" width="60" />
        <el-table-column label="权限 key" min-width="240" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.key.startsWith('!')" type="danger" size="small" class="deny-tag">拒绝</el-tag>
            <span>{{ row.key }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="registeredBy" label="注册方" min-width="150" show-overflow-tooltip />
        <el-table-column prop="description" label="描述" min-width="180" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.state === 'new' ? 'success' : 'warning'">
              {{ row.state === 'new' ? '新增' : '更新' }}
            </el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="没有可导入的条目" />
        </template>
      </el-table>

      <el-table v-if="importIssues.length" :data="importIssues" border size="small" class="block" max-height="200">
        <el-table-column prop="index" label="行" width="60" />
        <el-table-column prop="key" label="权限 key" min-width="220" show-overflow-tooltip />
        <el-table-column prop="reason" label="问题" min-width="220" show-overflow-tooltip />
      </el-table>

      <el-progress
        v-if="importing || importFinished"
        class="import-progress"
        :percentage="importProgress.total ? Math.round((importProgress.done / importProgress.total) * 100) : 0"
        :status="importFinished && importFailures.length === 0 ? 'success' : undefined"
      />

      <el-alert
        v-if="importFinished && importFailures.length"
        class="import-alert"
        type="error"
        :closable="false"
        show-icon
        :title="`${importFailures.length} 条导入失败`"
      >
        <div v-for="failure in importFailures" :key="failure.key" class="import-failure">
          <span class="mono">{{ failure.key }}</span>：{{ failure.reason }}
        </div>
      </el-alert>

      <template #footer>
        <el-button @click="importVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :loading="importing"
          :disabled="importEntries.length === 0 || importing"
          @click="runImport"
        >
          确认导入 {{ importEntries.length }} 条
        </el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-input {
  width: 320px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.deny-tag {
  margin-right: 6px;
}

.key-hint {
  margin-top: 6px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.6;
}

.key-hint code,
.key-suggestions code {
  padding: 0 3px;
  font-family: var(--el-font-family-mono, monospace);
  background: var(--el-fill-color-light);
  border-radius: 3px;
}

.key-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
}

.key-suggestions-label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.list-footer {
  display: flex;
  justify-content: center;
  padding: 12px 0 0;
}

.list-finished {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.import-input {
  display: none;
}

.import-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.import-file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}

.import-alert {
  margin-bottom: 12px;
}

.import-progress {
  margin-top: 12px;
}

.import-failure {
  margin-top: 4px;
  font-size: 12px;
}

.field-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.mono {
  font-family: monospace;
}

.block {
  margin-top: 12px;
}
</style>
