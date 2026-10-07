<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { isApiError } from '@/api/http'
import {
  beginPasskeyLogin,
  finishPasskeyLogin,
  loginFailureMessage,
  loginWithPassword,
  OIDC_BEGIN_URL,
} from '@/features/auth/api'
import { applyLoginResponse, CHANGE_TOKEN_KEY, redirectTarget } from '@/features/auth/flow'
import {
  serializeAssertion,
  toRequestOptions,
  WEBAUTHN_SUPPORTED,
  webAuthnErrorMessage,
} from '@/features/auth/webauthn'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const formRef = ref<FormInstance>()
const loading = ref(false)
const passkeyLoading = ref(false)
const passkeyDialogVisible = ref(false)
const passkeyUsername = ref('')
const form = ref({ username: '', password: '' })

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function openPasskeyDialog(): void {
  if (!WEBAUTHN_SUPPORTED) {
    ElMessage.warning('当前浏览器不支持通行密钥登录')
    return
  }
  passkeyDialogVisible.value = true
}

async function onSubmit(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  const redirect = redirectTarget(route.query.redirect)
  loading.value = true
  try {
    const attempt = await loginWithPassword(form.value.username, form.value.password)
    if (attempt.status === 200) {
      const outcome = await applyLoginResponse(attempt.data, redirect)
      if (outcome === 'unknown') {
        ElMessage.error('登录失败：响应中缺少访问令牌')
      }
      return
    }
    if (attempt.status === 403 && attempt.data.detail === 'password_change_required') {
      const changeToken = attempt.data.change_token ?? ''
      if (!changeToken) {
        ElMessage.error('需要修改密码，但服务端未返回修改凭证，请联系管理员')
        return
      }
      sessionStorage.setItem(CHANGE_TOKEN_KEY, changeToken)
      ElMessage.warning('当前密码是临时密码，需要先修改密码才能继续')
      await router.push({ path: '/iam/password/change', query: redirect === '/iam' ? {} : { redirect } })
      return
    }
    ElMessage.error(loginFailureMessage(attempt))
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function onPasskeyLogin(): Promise<void> {
  if (!WEBAUTHN_SUPPORTED) {
    ElMessage.warning('当前浏览器不支持通行密钥登录')
    return
  }
  passkeyLoading.value = true
  try {
    const username = passkeyUsername.value.trim()
    const publicKey = await beginPasskeyLogin(username || undefined)
    const credential = (await navigator.credentials.get({
      publicKey: toRequestOptions(publicKey),
    })) as PublicKeyCredential | null
    if (!credential) {
      ElMessage.warning('未获取到通行密钥凭证，请重试')
      return
    }
    const response = await finishPasskeyLogin(serializeAssertion(credential))
    passkeyDialogVisible.value = false
    const outcome = await applyLoginResponse(response, redirectTarget(route.query.redirect))
    if (outcome === 'unknown') {
      ElMessage.error('登录失败：响应中缺少访问令牌')
    }
  } catch (error) {
    ElMessage.error(isApiError(error) ? errorMessage(error) : webAuthnErrorMessage(error))
  } finally {
    passkeyLoading.value = false
  }
}

function onOidcLogin(): void {
  window.location.href = OIDC_BEGIN_URL
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <template #header>
        <div class="auth-title">智慧教室管理平台</div>
      </template>
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @submit.prevent="onSubmit">
        <el-form-item label="用户名" prop="username">
          <el-input v-model="form.username" placeholder="请输入用户名" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            placeholder="请输入密码"
            autocomplete="current-password"
            @keyup.enter="onSubmit"
          />
        </el-form-item>
        <div class="auth-actions">
          <el-button type="primary" class="auth-submit" native-type="submit" :loading="loading">登录</el-button>
        </div>
      </el-form>
      <el-divider>或</el-divider>
      <div class="auth-actions">
        <el-button class="auth-submit" :loading="passkeyLoading" @click="openPasskeyDialog">
          使用 Passkey 登录
        </el-button>
        <el-button class="auth-submit" @click="onOidcLogin">使用 OIDC 单点登录</el-button>
      </div>
      <div class="auth-links">
        <el-link type="primary" :underline="false" @click="router.push('/iam/register')">注册账号</el-link>
        <el-link type="primary" :underline="false" @click="router.push('/iam/forgot-password')">
          忘记密码
        </el-link>
      </div>
    </el-card>

    <el-dialog v-model="passkeyDialogVisible" title="使用 Passkey 登录" width="360px">
      <el-form label-position="top" @submit.prevent="onPasskeyLogin">
        <el-form-item label="用户名（可选）">
          <el-input
            v-model="passkeyUsername"
            placeholder="留空则使用可发现凭证"
            @keyup.enter="onPasskeyLogin"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="passkeyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="passkeyLoading" @click="onPasskeyLogin">开始登录</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.auth-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

.auth-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.auth-actions .el-button + .el-button {
  margin-left: 0;
}

.auth-submit {
  width: 100%;
}

.auth-links {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
</style>
