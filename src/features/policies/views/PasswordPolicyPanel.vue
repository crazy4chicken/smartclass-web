<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

import IamObjectSelect from '@/components/IamObjectSelect.vue'
import { useCursorList } from '@/composables/useCursorList'
import { IAM_OBJECT_KIND_LABELS, toIamObjectKind } from '@/composables/useIamObjects'
import type { IamObjectKind } from '@/composables/useIamObjects'
import type { PasswordPolicy } from '@/api/types'
import { errorMessage } from '@/utils/error'
import {
  createPasswordPolicy,
  deletePasswordPolicy,
  listPasswordPolicies,
  updatePasswordPolicy,
  type PasswordPolicyCreatePayload,
  type PasswordPolicyUpdatePayload,
} from '../api'

/** UI state for a nullable boolean policy field: inherit (null), require (true), forbid (false). */
type TriState = 'inherit' | 'require' | 'forbid'

/** Every subject kind a password rule can target; the id picks one of them. */
const SUBJECT_KINDS: readonly IamObjectKind[] = ['user', 'team', 'group', 'role']

const REQUIRE_OPTIONS = [
  { label: '继承默认', value: 'inherit' },
  { label: '要求', value: 'require' },
  { label: '不要求', value: 'forbid' },
]

const BREACH_OPTIONS = [
  { label: '继承默认', value: 'inherit' },
  { label: '开启', value: 'require' },
  { label: '关闭', value: 'forbid' },
]

const { items, loading, finished, loadMore, reload } = useCursorList<PasswordPolicy>(listPasswordPolicies)

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

function subjectKindLabel(kind: string): string {
  return IAM_OBJECT_KIND_LABELS[kind as IamObjectKind] ?? kind
}

function boolLabel(value?: boolean | null): string {
  if (value === null || value === undefined) {
    return '继承'
  }
  return value ? '是' : '否'
}

function requirementSummary(row: PasswordPolicy): string {
  const parts: string[] = []
  if (row.require_upper) parts.push('大写')
  if (row.require_lower) parts.push('小写')
  if (row.require_letter) parts.push('字母')
  if (row.require_digit) parts.push('数字')
  if (row.require_symbol) parts.push('符号')
  return parts.length > 0 ? parts.join(' / ') : '—'
}

function formatTime(value: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

function toTriState(value?: boolean | null): TriState {
  if (value === null || value === undefined) {
    return 'inherit'
  }
  return value ? 'require' : 'forbid'
}

function toNullableBool(value: TriState): boolean | null {
  if (value === 'inherit') {
    return null
  }
  return value === 'require'
}

const dialogVisible = ref(false)
const editing = ref<PasswordPolicy | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  subjectKind: 'user' as IamObjectKind,
  subjectId: '',
  priority: null as number | null,
  minLength: null as number | null,
  historyCount: null as number | null,
  breachCheck: 'inherit' as TriState,
  requireUpper: 'inherit' as TriState,
  requireLower: 'inherit' as TriState,
  requireLetter: 'inherit' as TriState,
  requireDigit: 'inherit' as TriState,
  requireSymbol: 'inherit' as TriState,
})

const rules: FormRules = {
  subjectId: [{ required: true, message: '请输入主体 ID', trigger: 'blur' }],
}

function openCreate(): void {
  editing.value = null
  form.name = ''
  form.subjectKind = 'user'
  form.subjectId = ''
  form.priority = null
  form.minLength = null
  form.historyCount = null
  form.breachCheck = 'inherit'
  form.requireUpper = 'inherit'
  form.requireLower = 'inherit'
  form.requireLetter = 'inherit'
  form.requireDigit = 'inherit'
  form.requireSymbol = 'inherit'
  dialogVisible.value = true
}

function openEdit(row: PasswordPolicy): void {
  editing.value = row
  form.name = row.name
  form.subjectKind = toIamObjectKind(row.subject_kind)
  form.subjectId = row.subject_id
  form.priority = row.priority
  form.minLength = row.min_length ?? null
  form.historyCount = row.history_count ?? null
  form.breachCheck = toTriState(row.breach_check)
  form.requireUpper = toTriState(row.require_upper)
  form.requireLower = toTriState(row.require_lower)
  form.requireLetter = toTriState(row.require_letter)
  form.requireDigit = toTriState(row.require_digit)
  form.requireSymbol = toTriState(row.require_symbol)
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
  const name = form.name.trim()
  const subjectId = form.subjectId.trim()
  saving.value = true
  try {
    if (editing.value) {
      const payload: PasswordPolicyUpdatePayload = {
        name,
        subject_kind: form.subjectKind,
        subject_id: subjectId,
        min_length: form.minLength,
        history_count: form.historyCount,
        breach_check: toNullableBool(form.breachCheck),
        require_upper: toNullableBool(form.requireUpper),
        require_lower: toNullableBool(form.requireLower),
        require_letter: toNullableBool(form.requireLetter),
        require_digit: toNullableBool(form.requireDigit),
        require_symbol: toNullableBool(form.requireSymbol),
      }
      if (form.priority !== null) {
        payload.priority = form.priority
      }
      await updatePasswordPolicy(editing.value.id, payload)
      ElMessage.success('密码策略已更新')
    } else {
      const payload: PasswordPolicyCreatePayload = {
        subject_kind: form.subjectKind,
        subject_id: subjectId,
        breach_check: toNullableBool(form.breachCheck),
        require_upper: toNullableBool(form.requireUpper),
        require_lower: toNullableBool(form.requireLower),
        require_letter: toNullableBool(form.requireLetter),
        require_digit: toNullableBool(form.requireDigit),
        require_symbol: toNullableBool(form.requireSymbol),
      }
      if (name) {
        payload.name = name
      }
      if (form.priority !== null) {
        payload.priority = form.priority
      }
      if (form.minLength !== null) {
        payload.min_length = form.minLength
      }
      if (form.historyCount !== null) {
        payload.history_count = form.historyCount
      }
      await createPasswordPolicy(payload)
      ElMessage.success('密码策略已创建')
    }
    dialogVisible.value = false
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row: PasswordPolicy): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除密码策略「${row.name || row.id}」？`, '删除密码策略', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deletePasswordPolicy(row.id)
    ElMessage.success('密码策略已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <div>
    <div class="toolbar">
      <el-button :icon="Refresh" @click="refresh">刷新</el-button>
      <div class="toolbar-right">
        <el-button type="primary" :icon="Plus" @click="openCreate">新建密码策略</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border empty-text="暂无密码策略">
      <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
      <el-table-column label="主体类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ subjectKindLabel(row.subject_kind) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="subject_id" label="主体 ID" min-width="200" show-overflow-tooltip />
      <el-table-column prop="priority" label="优先级" width="90" />
      <el-table-column label="最小长度" width="100">
        <template #default="{ row }">{{ row.min_length ?? '继承' }}</template>
      </el-table-column>
      <el-table-column label="历史密码数" width="110">
        <template #default="{ row }">{{ row.history_count ?? '继承' }}</template>
      </el-table-column>
      <el-table-column label="弱密码库检查" width="120">
        <template #default="{ row }">{{ boolLabel(row.breach_check) }}</template>
      </el-table-column>
      <el-table-column label="字符要求" min-width="180">
        <template #default="{ row }">{{ requirementSummary(row) }}</template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="130" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="list-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMoreSafe">加载更多</el-button>
      <span v-else class="list-finished">已加载全部</span>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑密码策略' : '新建密码策略'"
      width="620px"
      :close-on-click-modal="false"
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="未设置（继承默认）的字段会向下继承低优先级策略与内置默认值"
        class="form-alert"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px" @submit.prevent>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="策略名称，可留空" />
        </el-form-item>
        <el-form-item label="主体" prop="subjectId">
          <IamObjectSelect
            v-model="form.subjectId"
            v-model:kind="form.subjectKind"
            :kinds="SUBJECT_KINDS"
            placeholder="搜索并选择用户 / 团队 / 用户组 / 角色"
          />
        </el-form-item>
        <el-form-item label="优先级" prop="priority">
          <el-input-number v-model="form.priority" :step="1" step-strictly placeholder="留空使用默认优先级" />
        </el-form-item>
        <el-form-item label="最小长度" prop="minLength">
          <el-input-number
            v-model="form.minLength"
            :min="1"
            :max="1024"
            step-strictly
            placeholder="留空为继承默认（1-1024）"
          />
        </el-form-item>
        <el-form-item label="历史密码数" prop="historyCount">
          <el-input-number
            v-model="form.historyCount"
            :min="0"
            :max="24"
            step-strictly
            placeholder="留空为继承默认（0-24）"
          />
        </el-form-item>
        <el-form-item label="弱密码库检查" prop="breachCheck">
          <el-select v-model="form.breachCheck" class="full-width">
            <el-option v-for="item in BREACH_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求大写字母" prop="requireUpper">
          <el-select v-model="form.requireUpper" class="full-width">
            <el-option v-for="item in REQUIRE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求小写字母" prop="requireLower">
          <el-select v-model="form.requireLower" class="full-width">
            <el-option v-for="item in REQUIRE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求字母" prop="requireLetter">
          <el-select v-model="form.requireLetter" class="full-width">
            <el-option v-for="item in REQUIRE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求数字" prop="requireDigit">
          <el-select v-model="form.requireDigit" class="full-width">
            <el-option v-for="item in REQUIRE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="要求符号" prop="requireSymbol">
          <el-select v-model="form.requireSymbol" class="full-width">
            <el-option v-for="item in REQUIRE_OPTIONS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.toolbar-right {
  margin-left: auto;
}

.full-width {
  width: 100%;
}

.form-alert {
  margin-bottom: 12px;
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
</style>
