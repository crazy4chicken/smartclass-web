<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { confirmPasswordReset } from '@/features/auth/api'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const formRef = ref<FormInstance>()
const loading = ref(false)
const completed = ref(false)
const form = ref({ new_password: '', confirm_password: '' })

const rules: FormRules = {
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 8, message: '新密码至少 8 位', trigger: 'blur' },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== form.value.new_password) {
          callback(new Error('两次输入的新密码不一致'))
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
    await confirmPasswordReset(token.value, form.value.new_password)
    completed.value = true
    ElMessage.success('密码已重置')
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
        <div class="auth-title">重置密码</div>
      </template>
      <el-result
        v-if="!token"
        icon="warning"
        title="重置链接无效"
        sub-title="链接缺少重置令牌，请重新发起忘记密码流程"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/forgot-password')">重新发起</el-button>
        </template>
      </el-result>
      <el-result
        v-else-if="completed"
        icon="success"
        title="密码重置成功"
        sub-title="请使用新密码登录"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">前往登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="新密码" prop="new_password">
            <el-input
              v-model="form.new_password"
              type="password"
              show-password
              placeholder="请输入新密码"
              autocomplete="new-password"
            />
          </el-form-item>
          <el-form-item label="确认新密码" prop="confirm_password">
            <el-input
              v-model="form.confirm_password"
              type="password"
              show-password
              placeholder="请再次输入新密码"
              autocomplete="new-password"
              @keyup.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" class="auth-submit" native-type="submit" :loading="loading">
            重置密码
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
