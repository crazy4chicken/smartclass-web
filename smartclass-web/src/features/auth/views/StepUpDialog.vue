<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { completeMfaLogin, loginFailureMessage, loginWithPassword } from '@/features/auth/api'
import { cancelStepUp, completeStepUp, stepUpVisible } from '@/features/auth/stepup'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const auth = useAuthStore()

/** `password` asks for the current password, `totp` for a dynamic or backup code. */
const stage = ref<'password' | 'totp'>('password')
const submitting = ref(false)
const errorText = ref('')
const mfaToken = ref('')
const form = ref({ password: '', code: '' })

const canSubmit = computed(() =>
  stage.value === 'password' ? form.value.password.length > 0 : form.value.code.trim().length > 0,
)

watch(stepUpVisible, (visible) => {
  // A close that is not a successful re-authentication must reject the shared demand,
  // otherwise the interceptor would await a promise that never settles.
  if (!visible) {
    cancelStepUp()
  }
  // Every prompt starts clean; `destroy-on-close` only tears down the rendered markup.
  stage.value = 'password'
  submitting.value = false
  errorText.value = ''
  mfaToken.value = ''
  form.value.password = ''
  form.value.code = ''
})

async function resolveUsername(): Promise<string> {
  let profile = auth.profile
  if (!profile) {
    try {
      profile = await auth.fetchProfile()
    } catch {
      // The dialog shows the missing-account hint below; the raw error adds nothing here.
    }
  }
  return profile?.username ?? ''
}

async function submitPassword(): Promise<void> {
  const password = form.value.password
  if (!password || submitting.value) {
    return
  }
  errorText.value = ''
  submitting.value = true
  try {
    const username = await resolveUsername()
    if (!username) {
      errorText.value = '无法确定当前账号，请退出后重新登录'
      return
    }
    const attempt = await loginWithPassword(username, password)
    if (attempt.status === 200 && attempt.data.access_token) {
      // Store before completing: the interceptor replays the original request right after.
      auth.setTokens(attempt.data.access_token, attempt.data.refresh_token ?? '')
      completeStepUp()
      return
    }
    if (attempt.status === 200 && attempt.data.mfa_enrollment_required) {
      errorText.value = '该账号需要先注册 MFA，请退出后重新登录完成注册'
      return
    }
    if (attempt.status === 200 && attempt.data.mfa_required && attempt.data.mfa_token) {
      mfaToken.value = attempt.data.mfa_token
      stage.value = 'totp'
      form.value.password = ''
      return
    }
    errorText.value = loginFailureMessage(attempt)
  } catch (error) {
    errorText.value = errorMessage(error)
  } finally {
    submitting.value = false
  }
}

async function submitCode(): Promise<void> {
  const code = form.value.code.trim()
  if (!code || !mfaToken.value || submitting.value) {
    return
  }
  errorText.value = ''
  submitting.value = true
  try {
    const pair = await completeMfaLogin(mfaToken.value, code)
    auth.setTokens(pair.access_token, pair.refresh_token)
    completeStepUp()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function onSubmit(): Promise<void> {
  if (stage.value === 'password') {
    await submitPassword()
  } else {
    await submitCode()
  }
}

function onBeforeClose(done: () => void): void {
  if (submitting.value) {
    return
  }
  cancelStepUp()
  done()
}
</script>

<template>
  <el-dialog
    v-model="stepUpVisible"
    title="身份重新验证"
    width="420px"
    :close-on-click-modal="false"
    :close-on-press-escape="!submitting"
    :before-close="onBeforeClose"
    destroy-on-close
  >
    <el-alert
      class="stepup-hint"
      type="warning"
      :closable="false"
      title="该操作要求 10 分钟内的重新认证，请验证身份后重试。"
    />
    <el-form label-position="top" @submit.prevent="onSubmit">
      <el-form-item v-if="stage === 'password'" label="当前密码">
        <el-input
          v-model="form.password"
          type="password"
          show-password
          placeholder="请输入当前密码"
          autocomplete="current-password"
          @keyup.enter="onSubmit"
        />
      </el-form-item>
      <el-form-item v-else label="动态码">
        <el-input
          v-model="form.code"
          placeholder="请输入动态码或一个未使用的备用码"
          autocomplete="one-time-code"
          @keyup.enter="onSubmit"
        />
      </el-form-item>
    </el-form>
    <el-alert v-if="errorText" class="stepup-hint" type="error" :closable="false" :title="errorText" />
    <template #footer>
      <el-button :disabled="submitting" @click="cancelStepUp">取消</el-button>
      <el-button type="primary" :loading="submitting" :disabled="!canSubmit" @click="onSubmit">确认</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.stepup-hint {
  margin-bottom: 16px;
}
</style>
