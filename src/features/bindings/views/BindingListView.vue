<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'

import IamObjectSelect from '@/components/IamObjectSelect.vue'
import { useCursorList } from '@/composables/useCursorList'
import { IAM_OBJECT_KIND_LABELS, toIamObjectKind } from '@/composables/useIamObjects'
import type { IamObjectKind } from '@/composables/useIamObjects'
import type { Binding, Role } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listRoleOptions } from '@/features/roles/api'
import { createBinding, deleteBinding, listBindings, type BindingCreatePayload } from '../api'

/** The binding endpoint addresses users and groups; a team binding carries `team_id` instead. */
const SUBJECT_KINDS: readonly IamObjectKind[] = ['user', 'group']

const subjectKind = ref<IamObjectKind>('user')
const subjectId = ref('')
const queried = ref(false)

const { items, loading, finished, loadMore, reload } = useCursorList<Binding>((cursor, limit) =>
  listBindings(cursor, limit, subjectKind.value, subjectId.value.trim()),
)

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

async function search(): Promise<void> {
  if (!subjectId.value.trim()) {
    ElMessage.warning('请输入主体 ID')
    return
  }
  queried.value = true
  await refresh()
}

function subjectKindLabel(kind: string): string {
  return IAM_OBJECT_KIND_LABELS[kind as IamObjectKind] ?? kind
}

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

const roleOptions = ref<Role[]>([])

function roleLabel(roleId: string): string {
  return roleOptions.value.find((item) => item.id === roleId)?.name ?? roleId
}

async function loadOptions(): Promise<void> {
  try {
    roleOptions.value = await listRoleOptions()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(loadOptions)

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({
  subjectKind: 'user' as IamObjectKind,
  subjectId: '',
  roleId: '',
  teamId: '',
  condition: '',
  expiresAt: null as Date | null,
})
const rules: FormRules = {
  subjectId: [{ required: true, message: '请选择主体', trigger: 'change' }],
  roleId: [{ required: true, message: '请选择角色', trigger: 'change' }],
}

function openCreate(): void {
  form.subjectKind = subjectKind.value
  form.subjectId = subjectId.value.trim()
  form.roleId = ''
  form.teamId = ''
  form.condition = ''
  form.expiresAt = null
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
  const payload: BindingCreatePayload = {
    role_id: form.roleId.trim(),
    subject_kind: form.subjectKind,
    subject_id: form.subjectId.trim(),
  }
  const teamId = form.teamId.trim()
  if (teamId) {
    payload.team_id = teamId
  }
  const condition = form.condition.trim()
  if (condition) {
    payload.condition = condition
  }
  if (form.expiresAt) {
    payload.expires_at = dayjs(form.expiresAt).toISOString()
  }
  saving.value = true
  try {
    const created = await createBinding(payload)
    ElMessage.success('绑定已创建')
    dialogVisible.value = false
    subjectKind.value = toIamObjectKind(created.subject_kind)
    subjectId.value = created.subject_id
    await search()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row: Binding): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除绑定「${row.id}」？该主体的权限版本会被刷新。`,
      '删除绑定',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  try {
    await deleteBinding(row.id)
    ElMessage.success('绑定已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <IamObjectSelect
        v-model="subjectId"
        v-model:kind="subjectKind"
        class="filter-input"
        :kinds="SUBJECT_KINDS"
        placeholder="搜索并选择主体"
      />
      <el-button type="primary" :icon="Search" @click="search">查询</el-button>
      <div class="toolbar-right">
        <el-button :icon="Refresh" :disabled="!queried" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建绑定</el-button>
      </div>
    </div>

    <template v-if="queried">
      <el-table v-loading="loading" :data="items" border empty-text="该主体暂无绑定">
        <el-table-column prop="id" label="绑定 ID" min-width="220" show-overflow-tooltip />
        <el-table-column label="主体类型" width="110">
          <template #default="{ row }">
            <el-tag size="small">{{ subjectKindLabel(row.subject_kind) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="subject_id" label="主体 ID" min-width="200" show-overflow-tooltip />
        <el-table-column label="角色" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ roleLabel(row.role_id) }}</template>
        </el-table-column>
        <el-table-column label="团队范围" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.team_id || '—' }}</template>
        </el-table-column>
        <el-table-column label="条件" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.condition || '—' }}</template>
        </el-table-column>
        <el-table-column label="过期时间" width="180">
          <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" @click="remove(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="list-footer">
        <el-button v-if="!finished" :loading="loading" @click="loadMoreSafe">加载更多</el-button>
        <span v-else class="list-finished">已加载全部</span>
      </div>
    </template>
    <el-empty v-else description="请选择主体类型并输入主体 ID，然后点击查询" />

    <el-dialog v-model="dialogVisible" title="新建绑定" width="560px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
        <el-form-item label="主体" prop="subjectId">
          <IamObjectSelect
            v-model="form.subjectId"
            v-model:kind="form.subjectKind"
            :kinds="SUBJECT_KINDS"
            placeholder="搜索并选择用户或用户组"
          />
        </el-form-item>
        <el-form-item label="角色" prop="roleId">
          <IamObjectSelect v-model="form.roleId" :kinds="['role']" placeholder="搜索并选择角色" />
        </el-form-item>
        <el-form-item label="团队范围" prop="teamId">
          <IamObjectSelect
            v-model="form.teamId"
            :kinds="['team']"
            placeholder="留空为不限团队，可搜索并选择团队"
          />
        </el-form-item>
        <el-form-item label="条件" prop="condition">
          <el-input
            v-model="form.condition"
            type="textarea"
            :rows="2"
            placeholder="可选，例如 resource.team_id == subject.team_id"
          />
        </el-form-item>
        <el-form-item label="过期时间" prop="expiresAt">
          <el-date-picker
            v-model="form.expiresAt"
            class="full-width"
            type="datetime"
            placeholder="留空为永不过期"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
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

.kind-select {
  width: 140px;
}

.filter-input {
  width: 300px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
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
