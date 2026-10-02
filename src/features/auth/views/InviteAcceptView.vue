<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { acceptInvitation } from '@/features/auth/api'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const formRef = ref<FormInstance>()
const loading = ref(false)
const accepted = ref(false)
const form = ref({ display_name: '', password: '', confirm_password: '' })

const rules: FormRules = {
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 8, message: '密码至少 8 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.value.password) {
          callback(new Error('两次输入的密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  loading.value = true
  try {
    const displayName = form.value.display_name.trim()
    await acceptInvitation({
      token: token.value,
      password: form.value.password,
      ...(displayName ? { display_name: displayName } : {}),
    })
    accepted.value = true
    ElMessage.success('邀请已接受')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <template #header>
        <div class="auth-title">接受邀请</div>
      </template>
      <el-result
        v-if="!token"
        icon="warning"
        title="邀请链接无效"
        sub-title="链接缺少邀请令牌，请使用邮件中的完整链接"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">返回登录</el-button>
        </template>
      </el-result>
      <el-result
        v-else-if="accepted"
        icon="success"
        title="邀请已接受"
        sub-title="账号已激活，请使用刚设置的密码登录"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">前往登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-alert
          class="invite-hint"
          type="info"
          :closable="false"
          title="设置初始密码后，邀请邮箱将自动标记为已验证"
        />
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="显示名称（可选）">
            <el-input v-model="form.display_name" placeholder="展示在平台中的名称" />
          </el-form-item>
          <el-form-item label="密码" prop="password">
            <el-input
              v-model="form.password"
              type="password"
              show-password
              placeholder="请输入密码"
              autocomplete="new-password"
            />
          </el-form-item>
          <el-form-item label="确认密码" prop="confirm_password">
            <el-input
              v-model="form.confirm_password"
              type="password"
              show-password
              placeholder="请再次输入密码"
              autocomplete="new-password"
              @keyup.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" class="auth-submit" native-type="submit" :loading="loading">
            接受邀请
          </el-button>
        </el-form>
      </template>
    </el-card>
  </div>
</template>

<style scoped>
.auth-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

.invite-hint {
  margin-bottom: 16px;
}

.auth-submit {
  width: 100%;
}
</style>
