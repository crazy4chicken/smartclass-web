<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { completeMfaLogin } from '@/features/auth/api'
import { applyLoginResponse, MFA_TOKEN_KEY, redirectTarget } from '@/features/auth/flow'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const mfaToken = ref(sessionStorage.getItem(MFA_TOKEN_KEY) ?? '')
const code = ref('')
const loading = ref(false)
const missingToken = computed(() => !mfaToken.value)

function backToLogin(): void {
  sessionStorage.removeItem(MFA_TOKEN_KEY)
  router.push('/iam/login')
}

async function onSubmit(): Promise<void> {
  const value = code.value.trim()
  if (!value) {
    ElMessage.warning('请输入动态码或备用码')
    return
  }
  loading.value = true
  try {
    const pair = await completeMfaLogin(mfaToken.value, value)
    sessionStorage.removeItem(MFA_TOKEN_KEY)
    const outcome = await applyLoginResponse(pair, redirectTarget(route.query.redirect))
    if (outcome === 'unknown') {
      ElMessage.error('登录失败：响应中缺少访问令牌')
    }
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
        <div class="auth-title">多因素认证</div>
      </template>
      <el-result v-if="missingToken" icon="warning" title="验证会话已失效" sub-title="请返回登录页重新登录">
        <template #extra>
          <el-button type="primary" @click="backToLogin">返回登录</el-button>
        </template>
      </el-result>
      <template v-else>
        <el-alert
          class="mfa-hint"
          type="info"
          :closable="false"
          title="请输入认证器中的六位动态码，或一个未使用的备用码"
        />
        <el-form label-position="top" @submit.prevent="onSubmit">
          <el-form-item label="动态码 / 备用码">
            <el-input
              v-model="code"
              placeholder="六位动态码或备用码"
              autocomplete="one-time-code"
              @keyup.enter="onSubmit"
            />
          </el-form-item>
          <el-button type="primary" class="auth-submit" native-type="submit" :loading="loading">
            验证并登录
          </el-button>
        </el-form>
        <div class="mfa-back">
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

.mfa-hint {
  margin-bottom: 16px;
}

.auth-submit {
  width: 100%;
}

.mfa-back {
  margin-top: 16px;
  text-align: center;
}
</style>
