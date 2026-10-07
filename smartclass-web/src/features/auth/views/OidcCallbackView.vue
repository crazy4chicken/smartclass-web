<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { completeOidcLogin } from '@/features/auth/api'
import { applyLoginResponse } from '@/features/auth/flow'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const processing = ref(true)
const failure = ref('')

function fail(message: string): void {
  failure.value = message
  processing.value = false
}

onMounted(async () => {
  const params = route.query
  const providerError = typeof params.error === 'string' ? params.error : ''
  const code = typeof params.code === 'string' ? params.code : ''
  const state = typeof params.state === 'string' ? params.state : ''
  if (providerError) {
    fail(`身份提供方返回错误：${providerError}`)
    return
  }
  if (!code || !state) {
    fail('回调地址缺少 code 或 state 参数，请重新发起 OIDC 登录')
    return
  }
  try {
    const response = await completeOidcLogin(code, state)
    const outcome = await applyLoginResponse(response, '/iam')
    if (outcome === 'unknown') {
      fail('登录失败：响应中缺少访问令牌')
    }
  } catch (error) {
    fail(errorMessage(error))
  }
})
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <template #header>
        <div class="auth-title">OIDC 登录</div>
      </template>
      <div v-if="processing" v-loading="true" class="oidc-loading">
        <p>正在完成单点登录，请稍候…</p>
      </div>
      <el-result v-else icon="error" title="单点登录失败" :sub-title="failure">
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">返回登录</el-button>
        </template>
      </el-result>
    </el-card>
  </div>
</template>

<style scoped>
.auth-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

.oidc-loading {
  min-height: 120px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
