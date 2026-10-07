<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type FormInstance, type FormItemRule, type FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

import IamObjectSelect from '@/components/IamObjectSelect.vue'
import { useCursorList } from '@/composables/useCursorList'
import { IAM_OBJECT_KIND_LABELS, toIamObjectKind } from '@/composables/useIamObjects'
import type { IamObjectKind } from '@/composables/useIamObjects'
import type { MfaPolicy } from '@/api/types'
import { errorMessage } from '@/utils/error'
import {
  createMfaPolicy,
  deleteMfaPolicy,
  listMfaPolicies,
  updateMfaPolicy,
  type MfaPolicyCreatePayload,
  type MfaPolicyUpdatePayload,
} from '../api'

/** `default` targets everyone and carries no subject id; the rest are IAM object kinds. */
const SUBJECT_KINDS = [
  { label: '默认人群', value: 'default' },
  { label: '团队', value: 'team' },
  { label: '用户组', value: 'group' },
  { label: '角色', value: 'role' },
] as const

/** The panel picks the kind itself (it also has `default`), so the object picker shows only the target. */
const subjectObjectKinds = computed<readonly IamObjectKind[]>(() =>
  form.subjectKind === 'default' ? ['team'] : [form.subjectKind],
)

const { items, loading, finished, loadMore, reload } = useCursorList<MfaPolicy>(listMfaPolicies)

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
  return SUBJECT_KINDS.find((item) => item.value === kind)?.label ?? IAM_OBJECT_KIND_LABELS[kind as IamObjectKind] ?? kind
}

function formatTime(value: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

const dialogVisible = ref(false)
const editing = ref<MfaPolicy | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  name: '',
  subjectKind: 'default' as 'default' | IamObjectKind,
  subjectId: '',
  required: true,
  denyUnenrolled: false,
  priority: null as number | null,
})

const validateSubjectId: FormItemRule['validator'] = (_rule, value, callback) => {
  if (form.subjectKind !== 'default' && !String(value ?? '').trim()) {
    callback(new Error('请输入主体 ID'))
    return
  }
  callback()
}

const rules: FormRules = {
  subjectId: [{ validator: validateSubjectId, trigger: 'blur' }],
}

function openCreate(): void {
  editing.value = null
  form.name = ''
  form.subjectKind = 'default'
  form.subjectId = ''
  form.required = true
  form.denyUnenrolled = false
  form.priority = null
  dialogVisible.value = true
}

function openEdit(row: MfaPolicy): void {
  editing.value = row
  form.name = row.name
  form.subjectKind = row.subject_kind === 'default' ? 'default' : toIamObjectKind(row.subject_kind)
  form.subjectId = row.subject_id ?? ''
  form.required = row.required
  form.denyUnenrolled = row.deny_unenrolled
  form.priority = row.priority
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
  const subjectId = form.subjectKind === 'default' ? '' : form.subjectId.trim()
  saving.value = true
  try {
    if (editing.value) {
      const payload: MfaPolicyUpdatePayload = {
        name: form.name.trim(),
        subject_kind: form.subjectKind,
        subject_id: subjectId || null,
        required: form.required,
        deny_unenrolled: form.denyUnenrolled,
      }
      if (form.priority !== null) {
        payload.priority = form.priority
      }
      await updateMfaPolicy(editing.value.id, payload)
      ElMessage.success('MFA 策略已更新')
    } else {
      const payload: MfaPolicyCreatePayload = {
        subject_kind: form.subjectKind,
        required: form.required,
        deny_unenrolled: form.denyUnenrolled,
      }
      if (form.name.trim()) {
        payload.name = form.name.trim()
      }
      if (subjectId) {
        payload.subject_id = subjectId
      }
      if (form.priority !== null) {
        payload.priority = form.priority
      }
      await createMfaPolicy(payload)
      ElMessage.success('MFA 策略已创建')
    }
    dialogVisible.value = false
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row: MfaPolicy): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除 MFA 策略「${row.name || row.id}」？`, '删除 MFA 策略', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deleteMfaPolicy(row.id)
    ElMessage.success('MFA 策略已删除')
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
        <el-button type="primary" :icon="Plus" @click="openCreate">新建 MFA 策略</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border empty-text="暂无 MFA 策略">
      <el-table-column prop="name" label="名称" min-width="140" show-overflow-tooltip />
      <el-table-column label="主体类型" width="110">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ subjectKindLabel(row.subject_kind) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="主体 ID" min-width="200" show-overflow-tooltip>
        <template #default="{ row }">{{ row.subject_id || '—' }}</template>
      </el-table-column>
      <el-table-column label="要求 MFA" width="100">
        <template #default="{ row }">
          <el-tag :type="row.required ? 'success' : 'info'" size="small">{{ row.required ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="未注册即拒绝" width="120">
        <template #default="{ row }">
          <el-tag :type="row.deny_unenrolled ? 'warning' : 'info'" size="small">
            {{ row.deny_unenrolled ? '是' : '否' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="priority" label="优先级" width="90" />
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
      :title="editing ? '编辑 MFA 策略' : '新建 MFA 策略'"
      width="560px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="策略名称，可留空" />
        </el-form-item>
        <el-form-item label="主体类型" prop="subjectKind">
          <el-select v-model="form.subjectKind" class="full-width">
            <el-option v-for="item in SUBJECT_KINDS" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="form.subjectKind !== 'default'" label="主体" prop="subjectId">
          <IamObjectSelect
            v-model="form.subjectId"
            :kinds="subjectObjectKinds"
            placeholder="搜索并选择目标对象"
          />
        </el-form-item>
        <el-form-item label="要求 MFA" prop="required">
          <el-switch v-model="form.required" />
        </el-form-item>
        <el-form-item label="未注册即拒绝" prop="denyUnenrolled">
          <el-switch v-model="form.denyUnenrolled" />
        </el-form-item>
        <el-form-item label="优先级" prop="priority">
          <el-input-number v-model="form.priority" :step="1" step-strictly placeholder="留空使用默认优先级" />
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
