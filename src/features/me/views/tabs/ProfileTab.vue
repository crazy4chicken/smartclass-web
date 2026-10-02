<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { updateProfile } from '@/features/me/api'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const auth = useAuthStore()
const formRef = ref<FormInstance>()
const loading = ref(false)
const saving = ref(false)
const form = ref({ username: '', display_name: '' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  display_name: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
}

const profile = computed(() => auth.profile)
const statusTag = computed(() => {
  switch (profile.value?.status) {
    case 'active':
      return { label: '正常', type: 'success' as const }
    case 'disabled':
      return { label: '禁用', type: 'info' as const }
    case 'pending':
      return { label: '待审核', type: 'warning' as const }
    case 'invited':
      return { label: '已邀请', type: 'warning' as const }
    default:
      return { label: profile.value?.status || '未知', type: 'info' as const }
  }
})

async function reload(): Promise<void> {
  loading.value = true
  try {
    const data = await auth.fetchProfile()
    form.value.username = data.username
    form.value.display_name = data.display_name
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(reload)

async function onSave(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  const username = form.value.username.trim()
  const displayName = form.value.display_name.trim()
  if (username === (profile.value?.username ?? '') && displayName === (profile.value?.display_name ?? '')) {
    ElMessage.info('资料未发生变化')
    return
  }
  saving.value = true
  try {
    const updated = await updateProfile({ username, display_name: displayName })
    auth.profile = updated
    form.value.username = updated.username
    form.value.display_name = updated.display_name
    ElMessage.success('资料已更新')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div v-loading="loading">
    <el-descriptions :column="2" border>
      <el-descriptions-item label="用户 ID">{{ profile?.id || '—' }}</el-descriptions-item>
      <el-descriptions-item label="账号状态">
        <el-tag :type="statusTag.type">{{ statusTag.label }}</el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="邮箱">
        <span>{{ profile?.email || '未设置' }}</span>
        <el-tag
          v-if="profile?.email"
          class="email-tag"
          size="small"
          :type="profile.email_verified_at ? 'success' : 'warning'"
        >
          {{ profile.email_verified_at ? '已验证' : '未验证' }}
        </el-tag>
      </el-descriptions-item>
      <el-descriptions-item label="邮箱验证时间">
        {{ profile?.email_verified_at ? dayjs(profile.email_verified_at).format('YYYY-MM-DD HH:mm:ss') : '—' }}
      </el-descriptions-item>
      <el-descriptions-item label="注册时间">
        {{ profile?.created_at ? dayjs(profile.created_at).format('YYYY-MM-DD HH:mm:ss') : '—' }}
      </el-descriptions-item>
    </el-descriptions>

    <el-divider content-position="left">编辑资料</el-divider>
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      class="profile-form"
      @submit.prevent="onSave"
    >
      <el-form-item label="用户名" prop="username">
        <el-input v-model="form.username" placeholder="登录用户名" />
      </el-form-item>
      <el-form-item label="显示名称" prop="display_name">
        <el-input v-model="form.display_name" placeholder="展示在平台中的名称" />
      </el-form-item>
      <el-form-item label="邮箱">
        <el-input :model-value="profile?.email ?? ''" disabled placeholder="邮箱变更请前往「账号」页" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="saving">保存修改</el-button>
        <el-button @click="reload">重置</el-button>
      </el-form-item>
    </el-form>
  </div>
</template>

<style scoped>
.email-tag {
  margin-left: 8px;
}

.profile-form {
  max-width: 480px;
}
</style>
