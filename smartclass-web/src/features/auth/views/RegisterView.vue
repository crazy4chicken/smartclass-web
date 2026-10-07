<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { registerAccount } from '@/features/auth/api'
import { errorMessage } from '@/utils/error'

const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const registered = ref(false)
const form = ref({ username: '', email: '', display_name: '', password: '', confirm_password: '' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' },
  ],
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
    await registerAccount({
      username: form.value.username.trim(),
      email: form.value.email.trim(),
      password: form.value.password,
      ...(displayName ? { display_name: displayName } : {}),
    })
    registered.value = true
    ElMessage.success('注册成功')
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
        <div class="auth-title">注册账号</div>
      </template>
      <el-result
        v-if="registered"
        icon="success"
        title="注册成功"
        sub-title="我们已向你的邮箱发送验证邮件，请查收并完成邮箱验证；若站点开启了审核模式，还需等待管理员审批。"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">前往登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="用户名" prop="username">
            <el-input v-model="form.username" placeholder="用于登录的用户名" autocomplete="username" />
          </el-form-item>
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="form.email" placeholder="用于接收验证邮件" autocomplete="email" />
          </el-form-item>
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
            注册
          </el-button>
        </el-form>
        <div class="auth-links">
          <span class="auth-links-text">已有账号？</span>
          <el-link type="primary" :underline="false" @click="router.push('/iam/login')">返回登录</el-link>
        </div>
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

.auth-submit {
  width: 100%;
}

.auth-links {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.auth-links-text {
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
