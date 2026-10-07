<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { changePasswordWithChangeToken } from '@/features/auth/api'
import { CHANGE_TOKEN_KEY, redirectTarget } from '@/features/auth/flow'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const changeToken = ref(sessionStorage.getItem(CHANGE_TOKEN_KEY) ?? '')
const formRef = ref<FormInstance>()
const loading = ref(false)
const form = ref({ current_password: '', new_password: '', confirm_password: '' })
const missingToken = computed(() => !changeToken.value)

const rules: FormRules = {
  current_password: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
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

function backToLogin(): void {
  sessionStorage.removeItem(CHANGE_TOKEN_KEY)
  router.push('/iam/login')
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  if (form.value.new_password === form.value.current_password) {
    ElMessage.warning('新密码不能与当前密码相同')
    return
  }
  loading.value = true
  try {
    await changePasswordWithChangeToken(changeToken.value, {
      current_password: form.value.current_password,
      new_password: form.value.new_password,
    })
    sessionStorage.removeItem(CHANGE_TOKEN_KEY)
    auth.clear()
    ElMessage.success('密码修改成功，所有登录会话已注销，请使用新密码重新登录')
    const redirect = redirectTarget(route.query.redirect)
    await router.push({ path: '/iam/login', query: redirect === '/iam' ? {} : { redirect } })
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
        <div class="auth-title">修改密码</div>
      </template>
      <el-result
        v-if="missingToken"
        icon="warning"
        title="修改凭证已失效"
        sub-title="该页面只能通过首次登录提示进入，请返回登录页重新登录"
      >
        <template #extra>
          <el-button type="primary" @click="backToLogin">返回登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-alert
          class="change-hint"
          type="warning"
          :closable="false"
          title="当前使用的是管理员分配的初始密码，必须先修改密码后才能继续使用"
        />
        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="当前密码" prop="current_password">
            <el-input
              v-model="form.current_password"
              type="password"
              show-password
              placeholder="请输入管理员分配的当前密码"
              autocomplete="current-password"
            />
          </el-form-item>
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
            修改密码
          </el-button>
        </el-form>
        <div class="change-back">
          <el-link type="primary" :underline="false" @click="backToLogin">返回登录</el-link>
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

.change-hint {
  margin-bottom: 16px;
}

.auth-submit {
  width: 100%;
}

.change-back {
  margin-top: 16px;
  text-align: center;
}
</style>
