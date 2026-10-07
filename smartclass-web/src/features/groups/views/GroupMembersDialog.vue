<script setup lang="ts">
import { ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import type { BatchResult, Group, GroupMember } from '@/api/types'
import { errorMessage } from '@/utils/error'
import {
  addGroupMembersBatch,
  removeGroupMember,
  removeGroupMemberByBody,
  upsertGroupMember,
} from '@/features/groups/api'
import type { UpsertGroupMemberPayload } from '@/features/groups/api'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ group: Group | null }>()

const RESULT_ERROR_LABELS: Record<string, string> = {
  invalid_id: '用户 ID 无效',
  not_found: '用户不存在',
  already_member: '已是该组成员',
  operation_failed: '操作失败',
}

function resultErrorText(error?: string): string {
  return error ? (RESULT_ERROR_LABELS[error] ?? error) : '—'
}

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

// The specification has no "list members" endpoint, so the roster only tracks members
// successfully added/replaced through this dialog during the current session.
const members = ref<GroupMember[]>([])

const addFormRef = ref<FormInstance>()
const addSubmitting = ref(false)
const addForm = ref<{ userId: string; expiresAt: Date | null }>({ userId: '', expiresAt: null })

const addRules: FormRules = {
  userId: [{ required: true, message: '请输入用户 ID', trigger: 'blur' }],
}

const batchText = ref('')
const batchSubmitting = ref(false)
const batchResults = ref<BatchResult[]>([])

const removeFormRef = ref<FormInstance>()
const removeSubmitting = ref(false)
const removeForm = ref<{ userId: string; mode: 'path' | 'body' }>({ userId: '', mode: 'path' })

const removeRules: FormRules = {
  userId: [{ required: true, message: '请输入用户 ID', trigger: 'blur' }],
}

watch(visible, (open) => {
  if (!open) {
    return
  }
  members.value = []
  addForm.value = { userId: '', expiresAt: null }
  batchText.value = ''
  batchResults.value = []
  removeForm.value = { userId: '', mode: 'path' }
})

function mergeMember(member: GroupMember): void {
  const index = members.value.findIndex((item) => item.user_id === member.user_id)
  if (index === -1) {
    members.value.push(member)
    return
  }
  members.value.splice(index, 1, member)
}

async function submitAdd(): Promise<void> {
  const group = props.group
  if (!group || !addFormRef.value) {
    return
  }
  const valid = await addFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  addSubmitting.value = true
  try {
    const payload: UpsertGroupMemberPayload = {
      user_id: addForm.value.userId.trim(),
      expires_at: addForm.value.expiresAt ? dayjs(addForm.value.expiresAt).toISOString() : null,
    }
    const member = await upsertGroupMember(group.id, payload)
    mergeMember(member)
    addForm.value = { userId: '', expiresAt: null }
    ElMessage.success('成员已添加/替换')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    addSubmitting.value = false
  }
}

async function submitBatch(): Promise<void> {
  const group = props.group
  if (!group) {
    return
  }
  const userIds = Array.from(new Set(batchText.value.split(/[\s,;]+/).filter((item) => item !== '')))
  if (userIds.length === 0) {
    ElMessage.warning('请输入至少一个用户 ID')
    return
  }
  if (userIds.length > 500) {
    ElMessage.error('批量添加最多允许 500 个用户 ID')
    return
  }
  batchSubmitting.value = true
  try {
    const response = await addGroupMembersBatch(group.id, userIds)
    batchResults.value = response.results
    const succeeded = response.results.filter((result) => result.ok)
    for (const result of succeeded) {
      mergeMember({
        group_id: group.id,
        team_id: group.team_id,
        user_id: result.id,
        expires_at: null,
      })
    }
    const failed = response.results.length - succeeded.length
    if (failed === 0) {
      ElMessage.success(`已批量添加 ${succeeded.length} 名成员`)
    } else {
      ElMessage.warning(`${failed} 个用户添加失败，请查看结果明细`)
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    batchSubmitting.value = false
  }
}

async function performRemove(userId: string, mode: 'path' | 'body'): Promise<void> {
  const group = props.group
  if (!group || userId === '') {
    return
  }
  try {
    await ElMessageBox.confirm(`确定将用户「${userId}」移出用户组「${group.name}」吗？`, '移除成员', {
      type: 'warning',
      confirmButtonText: '移除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    if (mode === 'body') {
      await removeGroupMemberByBody(group.id, { user_id: userId })
    } else {
      await removeGroupMember(group.id, userId)
    }
    members.value = members.value.filter((item) => item.user_id !== userId)
    ElMessage.success('成员已移除')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function submitRemove(): Promise<void> {
  if (!removeFormRef.value) {
    return
  }
  const valid = await removeFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  removeSubmitting.value = true
  try {
    await performRemove(removeForm.value.userId.trim(), removeForm.value.mode)
  } finally {
    removeSubmitting.value = false
  }
}
</script>

<template>
  <el-dialog v-model="visible" :title="group ? `成员管理：${group.name}` : '成员管理'" width="760px">
    <el-descriptions v-if="group" :column="2" border class="block">
      <el-descriptions-item label="用户组 ID">
        <span class="mono">{{ group.id }}</span>
      </el-descriptions-item>
      <el-descriptions-item label="所属团队">
        <span class="mono">{{ group.team_id }}</span>
      </el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">添加 / 替换成员</el-divider>
    <el-form ref="addFormRef" :model="addForm" :rules="addRules" inline>
      <el-form-item label="用户 ID" prop="userId">
        <el-input v-model="addForm.userId" placeholder="用户 ULID" class="user-input" />
      </el-form-item>
      <el-form-item label="到期时间">
        <el-date-picker
          v-model="addForm.expiresAt"
          type="datetime"
          placeholder="可选，留空表示长期有效"
          class="date-input"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" :loading="addSubmitting" @click="submitAdd">添加 / 替换</el-button>
      </el-form-item>
    </el-form>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="同一用户重复提交会替换其成员关系（含到期时间）。"
      class="block"
    />

    <el-divider content-position="left">批量添加成员</el-divider>
    <el-input
      v-model="batchText"
      type="textarea"
      :rows="4"
      placeholder="每行一个用户 ID，也可用空格或逗号分隔，最多 500 个"
    />
    <div class="section-actions">
      <el-button type="primary" :loading="batchSubmitting" @click="submitBatch">批量添加</el-button>
    </div>
    <el-table v-if="batchResults.length > 0" :data="batchResults" border stripe max-height="240" class="block">
      <el-table-column label="用户 ID" min-width="220">
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

    <el-divider content-position="left">移除成员</el-divider>
    <el-form ref="removeFormRef" :model="removeForm" :rules="removeRules" inline>
      <el-form-item label="用户 ID" prop="userId">
        <el-input v-model="removeForm.userId" placeholder="用户 ULID" class="user-input" />
      </el-form-item>
      <el-form-item label="调用方式">
        <el-radio-group v-model="removeForm.mode">
          <el-radio value="path">路径参数</el-radio>
          <el-radio value="body">请求体</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item>
        <el-button type="danger" plain :loading="removeSubmitting" @click="submitRemove">移除</el-button>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">本次会话已添加的成员</el-divider>
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="规范未提供成员列表查询接口，下表仅显示本次会话中通过本对话框成功添加/替换的成员。"
      class="block"
    />
    <el-table :data="members" border stripe max-height="240">
      <el-table-column label="用户 ID" min-width="220">
        <template #default="{ row }">
          <span class="mono">{{ row.user_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="团队 ID" min-width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.team_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="到期时间" width="180">
        <template #default="{ row }">{{ row.expires_at ? formatTime(row.expires_at) : '长期有效' }}</template>
      </el-table-column>
      <el-table-column label="操作" width="90" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="performRemove(row.user_id, 'path')">移除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <template #footer>
      <el-button type="primary" @click="visible = false">关闭</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.block {
  margin-bottom: 12px;
}

.section-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

.user-input {
  width: 260px;
}

.date-input {
  width: 220px;
}

.mono {
  font-family: monospace;
}
</style>
