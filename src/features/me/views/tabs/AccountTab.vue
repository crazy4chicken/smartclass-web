<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { confirmEmailChange, deleteAccount, exportAccountData, requestEmailChange } from '@/features/me/api'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const router = useRouter()
const auth = useAuthStore()

const emailFormRef = ref<FormInstance>()
const emailRequesting = ref(false)
const emailForm = ref({ new_email: '', password: '' })
const confirmToken = ref('')
const confirmingEmail = ref(false)

const exporting = ref(false)
const deleting = ref(false)

const profile = computed(() => auth.profile)

const emailRules: FormRules = {
  new_email: [
    { required: true, message: '请输入新邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
}

async function onRequestEmailChange(): Promise<void> {
  if (!emailFormRef.value) {
    return
  }
  const valid = await emailFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  emailRequesting.value = true
  try {
    await requestEmailChange({
      new_email: emailForm.value.new_email.trim(),
      password: emailForm.value.password,
    })
    emailForm.value.password = ''
    ElMessage.success('验证邮件已发送至新邮箱，请在邮件中获取令牌并完成确认')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    emailRequesting.value = false
  }
}

async function onConfirmEmailChange(): Promise<void> {
  const token = confirmToken.value.trim()
  if (!token) {
    ElMessage.warning('请输入邮件中的验证令牌')
    return
  }
  confirmingEmail.value = true
  try {
    await confirmEmailChange(token)
    confirmToken.value = ''
    await auth.fetchProfile()
    ElMessage.success('邮箱已更新')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    confirmingEmail.value = false
  }
}

async function onExport(): Promise<void> {
  exporting.value = true
  try {
    const blob = await exportAccountData()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `iam-account-export-${dayjs().format('YYYYMMDD-HHmmss')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
    ElMessage.success('账号数据已导出')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    exporting.value = false
  }
}

async function onDeleteAccount(): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt(
      '注销后账号将被停用并匿名化，所有凭证与会话都会被删除且无法恢复。请输入当前密码确认。',
      '永久注销账号',
      {
        type: 'error',
        confirmButtonText: '永久注销',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPlaceholder: '请输入当前密码',
        inputValidator: (input) => (input ? true : '请输入当前密码'),
      },
    )
    deleting.value = true
    try {
      await deleteAccount(value)
      auth.clear()
      ElMessage.success('账号已注销')
      await router.push('/iam/login')
    } finally {
      deleting.value = false
    }
  } catch (error) {
    if (typeof error === 'string') {
      return
    }
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <div>
    <el-divider content-position="left">邮箱变更</el-divider>
    <p class="section-desc">
      当前邮箱：{{ profile?.email || '未设置' }}。变更需先验证当前密码，再通过发送至新邮箱的一次性令牌确认。
    </p>
    <el-form
      ref="emailFormRef"
      :model="emailForm"
      :rules="emailRules"
      label-width="100px"
      class="section-form"
      @submit.prevent="onRequestEmailChange"
    >
      <el-form-item label="新邮箱" prop="new_email">
        <el-input v-model="emailForm.new_email" placeholder="新的邮箱地址" />
      </el-form-item>
      <el-form-item label="当前密码" prop="password">
        <el-input
          v-model="emailForm.password"
          type="password"
          show-password
          placeholder="请输入当前密码"
          autocomplete="current-password"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="emailRequesting">发送验证邮件</el-button>
      </el-form-item>
    </el-form>
    <el-form label-width="100px" class="section-form" @submit.prevent="onConfirmEmailChange">
      <el-form-item label="验证令牌">
        <el-input v-model="confirmToken" placeholder="新邮箱收到的验证令牌" />
      </el-form-item>
      <el-form-item>
        <el-button :loading="confirmingEmail" @click="onConfirmEmailChange">确认邮箱变更</el-button>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">数据导出</el-divider>
    <p class="section-desc">导出个人资料、成员关系、有效权限、活动会话与安全信息的 JSON 文件。</p>
    <el-button :loading="exporting" @click="onExport">导出账号数据</el-button>

    <el-divider content-position="left">注销账号</el-divider>
    <el-alert
      class="section-alert"
      type="error"
      :closable="false"
      title="注销不可恢复：账号将被停用并匿名化，所有凭证与会话都会被删除。"
    />
    <el-button type="danger" :loading="deleting" @click="onDeleteAccount">永久注销账号</el-button>
  </div>
</template>

<style scoped>
.section-desc {
  margin: 0 0 12px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.section-form {
  max-width: 480px;
}

.section-alert {
  margin-bottom: 12px;
}
</style>
