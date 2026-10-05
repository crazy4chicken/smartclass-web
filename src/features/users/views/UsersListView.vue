<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules, TableInstance, UploadFile } from 'element-plus'
import { Plus, Refresh, Search, Upload } from '@element-plus/icons-vue'

import type { BatchResult, ImportResult, User } from '@/api/types'
import { useCursorList } from '@/composables/useCursorList'
import { errorMessage } from '@/utils/error'
import {
  approveUser,
  batchUsers,
  createUser,
  deleteUser,
  disableUser,
  importUsers,
  listUsers,
  updateUser,
} from '@/features/users/api'
import type { CreateUserPayload, UpdateUserPayload, UserBatchOp } from '@/features/users/api'
import UserDetailDrawer from '@/features/users/views/UserDetailDrawer.vue'

type TagType = 'success' | 'info' | 'warning' | 'danger'

const STATUS_META: Record<string, { label: string; type: TagType }> = {
  active: { label: '正常', type: 'success' },
  disabled: { label: '已禁用', type: 'info' },
  pending: { label: '待审核', type: 'warning' },
  locked: { label: '已锁定', type: 'danger' },
}

const STATUS_OPTIONS = [
  { label: '正常', value: 'active' },
  { label: '已禁用', value: 'disabled' },
  { label: '待审核', value: 'pending' },
]

const RESULT_ERROR_LABELS: Record<string, string> = {
  invalid_id: 'ID 无效',
  not_found: '用户不存在',
  operation_failed: '操作失败',
  already_member: '已是成员',
  weak_password: '密码强度不足',
  unsupported_field: '不支持的字段',
}

function statusMeta(status: string): { label: string; type: TagType } {
  return STATUS_META[status] ?? { label: status, type: 'info' }
}

function resultErrorText(error?: string): string {
  if (!error) {
    return '—'
  }
  return RESULT_ERROR_LABELS[error] ?? error
}

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

const tableRef = ref<TableInstance>()
const { items, loading, finished, loadMore, reload } = useCursorList<User>(listUsers)

const keyword = ref('')
const statusFilter = ref('')
const filteredItems = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  return items.value.filter((user) => {
    if (statusFilter.value !== '' && user.status !== statusFilter.value) {
      return false
    }
    if (query === '') {
      return true
    }
    return (
      user.username.toLowerCase().includes(query) ||
      user.display_name.toLowerCase().includes(query) ||
      (user.email ?? '').toLowerCase().includes(query)
    )
  })
})

const selection = ref<User[]>([])

function onSelectionChange(rows: User[]): void {
  selection.value = rows
}

const detailVisible = ref(false)
const detailUserId = ref('')

function openDetail(row: User): void {
  detailUserId.value = row.id
  detailVisible.value = true
}

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const original = ref<User | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = ref({
  username: '',
  display_name: '',
  email: '',
  password: '',
  initial_password: '',
  status: 'active',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: ['blur', 'change'] }],
}

function openCreate(): void {
  dialogMode.value = 'create'
  editingId.value = ''
  original.value = null
  form.value = {
    username: '',
    display_name: '',
    email: '',
    password: '',
    initial_password: '',
    status: 'active',
  }
  dialogVisible.value = true
}

function openEdit(row: User): void {
  dialogMode.value = 'edit'
  editingId.value = row.id
  original.value = row
  form.value = {
    username: row.username,
    display_name: row.display_name,
    email: row.email ?? '',
    password: '',
    initial_password: '',
    status: row.status,
  }
  dialogVisible.value = true
}

async function submitForm(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  submitting.value = true
  try {
    const username = form.value.username.trim()
    const displayName = form.value.display_name.trim()
    const email = form.value.email.trim()
    if (dialogMode.value === 'create') {
      const payload: CreateUserPayload = { username }
      if (displayName !== '') {
        payload.display_name = displayName
      }
      payload.email = email === '' ? null : email
      if (form.value.password !== '') {
        payload.password = form.value.password
      }
      if (form.value.initial_password !== '') {
        payload.initial_password = form.value.initial_password
      }
      await createUser(payload)
      ElMessage.success('用户已创建')
    } else {
      const current = original.value
      if (!current) {
        return
      }
      const payload: UpdateUserPayload = {}
      if (username !== current.username) {
        payload.username = username
      }
      if (displayName !== current.display_name) {
        payload.display_name = displayName
      }
      if (email !== (current.email ?? '')) {
        payload.email = email === '' ? null : email
      }
      if (form.value.status !== current.status) {
        payload.status = form.value.status
      }
      if (Object.keys(payload).length === 0) {
        ElMessage.info('没有需要提交的修改')
        return
      }
      await updateUser(editingId.value, payload)
      ElMessage.success('用户已更新')
    }
    dialogVisible.value = false
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function onDelete(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除用户「${row.username}」吗？该操作会级联删除相关记录且不可恢复。`,
      '删除用户',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteUser(row.id)
    ElMessage.success('用户已删除')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onDisable(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定禁用用户「${row.username}」吗？禁用会重置其锁定状态、吊销全部会话并使权限失效。`,
      '禁用用户',
      { type: 'warning', confirmButtonText: '禁用', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await disableUser(row.id)
    ElMessage.success('用户已禁用')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onEnable(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定启用用户「${row.username}」吗？`, '启用用户', {
      type: 'warning',
      confirmButtonText: '启用',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await updateUser(row.id, { status: 'active' })
    ElMessage.success('用户已启用')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onApprove(row: User): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定通过用户「${row.username}」的注册审批吗？`, '审批用户', {
      type: 'warning',
      confirmButtonText: '通过',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await approveUser(row.id)
    ElMessage.success('用户已通过审批')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

const batchResults = ref<BatchResult[]>([])
const batchResultVisible = ref(false)
const batchTitle = ref('批量操作结果')
const batchFailedCount = computed(() => batchResults.value.filter((result) => !result.ok).length)

async function onBatch(op: UserBatchOp): Promise<void> {
  const rows = selection.value
  if (rows.length === 0) {
    ElMessage.warning('请先勾选需要操作的用户')
    return
  }
  const label = op === 'disable' ? '禁用' : '启用'
  try {
    await ElMessageBox.confirm(`确定批量${label}选中的 ${rows.length} 个用户吗？`, `批量${label}`, {
      type: 'warning',
      confirmButtonText: label,
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    const response = await batchUsers(
      op,
      rows.map((row) => row.id),
    )
    batchTitle.value = `批量${label}结果`
    batchResults.value = response.results
    batchResultVisible.value = true
    if (batchFailedCount.value === 0) {
      ElMessage.success(`已批量${label} ${response.results.length} 个用户`)
    } else {
      ElMessage.warning(`${batchFailedCount.value} 个用户操作失败，请查看结果明细`)
    }
    tableRef.value?.clearSelection()
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

const importVisible = ref(false)
const importFileName = ref('')
const importCsv = ref('')
const importing = ref(false)
const importResults = ref<ImportResult[]>([])
const importResultVisible = ref(false)
const importFailedCount = computed(() => importResults.value.filter((result) => !result.ok).length)

function openImport(): void {
  importFileName.value = ''
  importCsv.value = ''
  importVisible.value = true
}

function validateCsv(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  if (lines.length === 0) {
    return 'CSV 内容为空'
  }
  if (lines[0].trim() !== 'username,email,display_name,password') {
    return 'CSV 表头必须为 username,email,display_name,password'
  }
  if (lines.length - 1 > 500) {
    return 'CSV 最多允许 500 行数据'
  }
  return ''
}

async function onImportFileChange(file: UploadFile): Promise<void> {
  const raw = file.raw
  if (!raw) {
    return
  }
  const text = (await raw.text()).replace(/^\uFEFF/, '')
  const problem = validateCsv(text)
  if (problem !== '') {
    importFileName.value = ''
    importCsv.value = ''
    ElMessage.error(problem)
    return
  }
  importFileName.value = file.name
  importCsv.value = text
}

async function submitImport(): Promise<void> {
  if (importCsv.value === '') {
    ElMessage.warning('请先选择 CSV 文件')
    return
  }
  importing.value = true
  try {
    const response = await importUsers(importCsv.value)
    importResults.value = response.results
    importResultVisible.value = true
    if (importFailedCount.value === 0) {
      ElMessage.success(`导入完成，共 ${response.results.length} 行全部成功`)
    } else {
      ElMessage.warning(`导入完成，${importFailedCount.value} 行失败，请查看结果明细`)
    }
    importVisible.value = false
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    importing.value = false
  }
}

onMounted(() => {
  void loadMore()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">用户</div>
      <div class="toolbar-filters">
        <el-input
          v-model="keyword"
          :prefix-icon="Search"
          placeholder="搜索用户名 / 显示名 / 邮箱（本地过滤）"
          clearable
          class="search-input"
        />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select">
          <el-option v-for="option in STATUS_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </div>
      <div class="toolbar-actions">
        <span v-if="selection.length > 0" class="selection-hint">已选 {{ selection.length }} 项</span>
        <el-button :disabled="selection.length === 0" @click="onBatch('enable')">批量启用</el-button>
        <el-button type="danger" plain :disabled="selection.length === 0" @click="onBatch('disable')">
          批量禁用
        </el-button>
        <el-button :icon="Upload" @click="openImport">CSV 导入</el-button>
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建用户</el-button>
      </div>
    </div>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="filteredItems"
      border
      stripe
      row-key="id"
      @selection-change="onSelectionChange"
    >
      <el-table-column type="selection" width="46" />
      <el-table-column prop="username" label="用户名" min-width="140" />
      <el-table-column prop="display_name" label="显示名" min-width="140" />
      <el-table-column label="邮箱" min-width="200">
        <template #default="{ row }">{{ row.email ?? '—' }}</template>
      </el-table-column>
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDetail(row)">详情</el-button>
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="row.status === 'pending'" link type="success" @click="onApprove(row)">审批</el-button>
          <el-button v-if="row.status === 'active'" link type="warning" @click="onDisable(row)">禁用</el-button>
          <el-button v-else-if="row.status !== 'pending'" link type="success" @click="onEnable(row)">启用</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMore">加载更多</el-button>
      <span v-else class="footer-hint">已加载全部用户</span>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建用户' : '编辑用户'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="显示名" prop="display_name">
          <el-input v-model="form.display_name" placeholder="展示名称（可选）" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="邮箱（可选）" />
        </el-form-item>
        <template v-if="dialogMode === 'create'">
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="直接生效的正式密码（可选）"
            />
          </el-form-item>
          <el-form-item label="初始密码" prop="initial_password">
            <el-input
              v-model="form.initial_password"
              type="password"
              show-password
              placeholder="首次登录后必须修改；同时填写密码时以密码为准（可选）"
            />
          </el-form-item>
        </template>
        <el-form-item v-else label="状态" prop="status">
          <el-select v-model="form.status" class="full-width">
            <el-option label="正常" value="active" />
            <el-option label="已禁用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importVisible" title="CSV 导入用户" width="560px" destroy-on-close>
      <el-alert type="info" :closable="false" show-icon class="block">
        <template #title>
          CSV 表头必须为 username,email,display_name,password，最多 500 行数据，逐行返回导入结果。
        </template>
      </el-alert>
      <el-upload
        :auto-upload="false"
        :show-file-list="false"
        accept=".csv,text/csv"
        :on-change="onImportFileChange"
      >
        <el-button :icon="Upload">选择 CSV 文件</el-button>
      </el-upload>
      <div v-if="importFileName !== ''" class="import-file">已选择：{{ importFileName }}</div>
      <template #footer>
        <el-button @click="importVisible = false">取消</el-button>
        <el-button type="primary" :loading="importing" :disabled="importCsv === ''" @click="submitImport">
          开始导入
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="batchResultVisible" :title="batchTitle" width="520px">
      <el-alert v-if="batchFailedCount > 0" type="warning" :closable="false" show-icon class="block">
        <template #title>{{ batchFailedCount }} / {{ batchResults.length }} 个用户操作失败。</template>
      </el-alert>
      <el-table :data="batchResults" border stripe max-height="360">
        <el-table-column label="用户 ID" min-width="200">
          <template #default="{ row }">
            <span class="mono">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="错误" min-width="140">
          <template #default="{ row }">{{ resultErrorText(row.error) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="primary" @click="batchResultVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="importResultVisible" title="CSV 导入结果" width="620px">
      <el-alert v-if="importFailedCount > 0" type="warning" :closable="false" show-icon class="block">
        <template #title>{{ importFailedCount }} / {{ importResults.length }} 行导入失败。</template>
      </el-alert>
      <el-table :data="importResults" border stripe max-height="360">
        <el-table-column label="行号" width="80">
          <template #default="{ row }">{{ row.row ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="用户名" min-width="130">
          <template #default="{ row }">{{ row.username ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag :type="row.ok ? 'success' : 'danger'">{{ row.ok ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="用户 ID" min-width="190">
          <template #default="{ row }">
            <span class="mono">{{ row.id ?? '—' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="错误" min-width="130">
          <template #default="{ row }">{{ resultErrorText(row.error) }}</template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button type="primary" @click="importResultVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <UserDetailDrawer v-model="detailVisible" :user-id="detailUserId" />
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
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
}

.toolbar-filters {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 260px;
}

.search-input {
  max-width: 320px;
}

.status-select {
  width: 140px;
}

.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.selection-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.table-footer {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.footer-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.block {
  margin-bottom: 12px;
}

.import-file {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.mono {
  font-family: monospace;
}

.full-width {
  width: 100%;
}
</style>
