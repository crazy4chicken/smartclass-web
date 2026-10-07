<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import type { Invitation } from '@/api/types'
import { errorMessage } from '@/utils/error'

import { cancelInvitation, createInvitation, resendInvitation } from '../api'

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = ref({ username: '', email: '', display_name: '' })
const created = ref<Invitation | null>(null)

const actionUserId = ref('')
const resending = ref(false)
const canceling = ref(false)

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
}

const STATUS_LABELS: Record<string, string> = {
  invited: '已邀请',
  pending: '待接受',
  accepted: '已接受',
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

async function onCreate(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  submitting.value = true
  try {
    const payload = {
      username: form.value.username.trim(),
      email: form.value.email.trim(),
      display_name: form.value.display_name.trim() || undefined,
    }
    created.value = await createInvitation(payload)
    ElMessage.success('邀请已创建，邀请链接已通过通知发送')
    formRef.value.resetFields()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

function useCreatedUserId(): void {
  if (created.value) {
    actionUserId.value = created.value.id
  }
}

async function onResend(): Promise<void> {
  const userID = actionUserId.value.trim()
  if (!userID) {
    ElMessage.warning('请输入用户 ID')
    return
  }
  const confirmed = await ElMessageBox.confirm(
    `将失效用户 ${userID} 原有的邀请链接，并重新发送一封有效期 7 天的邀请邮件。确定重发？`,
    '重发邀请',
    { type: 'warning', confirmButtonText: '确认重发', cancelButtonText: '取消' },
  ).catch(() => false)
  if (!confirmed) {
    return
  }
  resending.value = true
  try {
    await resendInvitation(userID)
    ElMessage.success('邀请已重新发送')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    resending.value = false
  }
}

async function onCancel(): Promise<void> {
  const userID = actionUserId.value.trim()
  if (!userID) {
    ElMessage.warning('请输入用户 ID')
    return
  }
  const confirmed = await ElMessageBox.confirm(
    `确定撤销用户 ${userID} 的邀请？该用户及其关联记录将被删除，原邀请链接立即失效。`,
    '撤销邀请',
    { type: 'warning', confirmButtonText: '确认撤销', cancelButtonText: '取消' },
  ).catch(() => false)
  if (!confirmed) {
    return
  }
  canceling.value = true
  try {
    await cancelInvitation(userID)
    ElMessage.success('邀请已撤销')
    if (created.value?.id === userID) {
      created.value = null
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    canceling.value = false
  }
}
</script>

<template>
  <div class="invitations-page">
    <el-card shadow="never" class="section">
      <template #header>创建邀请</template>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" class="create-form">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="登录用户名" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="form.email" placeholder="接收邀请的邮箱" />
        </el-form-item>
        <el-form-item label="显示名称" prop="display_name">
          <el-input v-model="form.display_name" placeholder="可选" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="submitting" @click="onCreate">发送邀请</el-button>
        </el-form-item>
      </el-form>

      <el-alert v-if="created" type="success" :closable="false" show-icon>
        <template #title>
          邀请已创建：用户 ID {{ created.id }}，状态 {{ statusLabel(created.status) }}
        </template>
        <template #default>
          <el-button link type="primary" @click="useCreatedUserId">填入下方操作卡</el-button>
        </template>
      </el-alert>
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>按用户 ID 管理邀请</template>
      <p class="hint">
        服务未提供邀请列表接口，邀请的撤销与重发按邀请创建后返回的用户 ID 进行操作。
      </p>
      <div class="action-row">
        <el-input v-model="actionUserId" class="user-id-input" clearable placeholder="邀请用户的 ID" />
        <el-button :loading="resending" @click="onResend">重发邀请</el-button>
        <el-button type="danger" plain :loading="canceling" @click="onCancel">撤销邀请</el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.section + .section {
  margin-top: 16px;
}

.create-form {
  max-width: 520px;
}

.hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.action-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-id-input {
  width: 320px;
}
</style>
