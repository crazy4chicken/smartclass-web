<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { requestPasswordReset } from '@/features/auth/api'
import { errorMessage } from '@/utils/error'

const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const requested = ref(false)
const form = ref({ login: '' })

const rules: FormRules = {
  login: [{ required: true, message: '请输入用户名或邮箱', trigger: 'blur' }],
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
    await requestPasswordReset(form.value.login.trim())
    requested.value = true
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
        <div class="auth-title">忘记密码</div>
      </template>
      <el-result
        v-if="requested"
        icon="success"
        title="重置请求已提交"
        sub-title="如果该账号存在，我们已向对应邮箱发送密码重置邮件，请查收并按邮件提示操作。"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">返回登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="用户名或邮箱" prop="login">
            <el-input
              v-model="form.login"
              placeholder="请输入用户名或注册邮箱"
              @keyup.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" class="auth-submit" native-type="submit" :loading="loading">
            发送重置邮件
          </el-button>
        </el-form>
        <div class="auth-links">
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
  margin-top: 16px;
}
</style>
