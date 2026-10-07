<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'

import { beginMfaEnrollment, completeMfaEnrollment } from '@/features/auth/api'
import { MFA_TOKEN_KEY, redirectTarget } from '@/features/auth/flow'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const mfaToken = ref(sessionStorage.getItem(MFA_TOKEN_KEY) ?? '')
const secret = ref('')
const otpauthUrl = ref('')
const code = ref('')
const loading = ref(false)
const submitting = ref(false)
const loadError = ref('')
const backupCodes = ref<string[]>([])
const backupDialogVisible = ref(false)
const redirect = redirectTarget(route.query.redirect)

async function loadEnrollment(): Promise<void> {
  loading.value = true
  loadError.value = ''
  try {
    const enrollment = await beginMfaEnrollment(mfaToken.value)
    secret.value = enrollment.secret
    otpauthUrl.value = enrollment.otpauth_url
  } catch (error) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (mfaToken.value) {
    void loadEnrollment()
  }
})

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

async function onSubmit(): Promise<void> {
  const value = code.value.trim()
  if (!value) {
    ElMessage.warning('请输入认证器显示的六位动态码')
    return
  }
  submitting.value = true
  try {
    const result = await completeMfaEnrollment(mfaToken.value, value)
    sessionStorage.removeItem(MFA_TOKEN_KEY)
    auth.setTokens(result.access_token, result.refresh_token)
    try {
      await auth.fetchProfile()
    } catch {
      // AppLayout retries the profile fetch on mount; a failure must not block the sign-in.
    }
    backupCodes.value = result.backup_codes
    backupDialogVisible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

function backToLogin(): void {
  sessionStorage.removeItem(MFA_TOKEN_KEY)
  router.push('/iam/login')
}

async function onContinue(): Promise<void> {
  backupDialogVisible.value = false
  await router.push(redirect)
}

async function copyBackupCodes(): Promise<void> {
  await copy(backupCodes.value.join('\n'), '全部备用码')
}
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card auth-card-wide">
      <template #header>
        <div class="auth-title">注册多因素认证（TOTP）</div>
      </template>
      <el-result
        v-if="!mfaToken"
        icon="warning"
        title="注册会话已失效"
        sub-title="请返回登录页重新登录后再试"
      >
        <template #extra>
          <el-button type="primary" @click="backToLogin">返回登录</el-button>
        </template>
      </el-result>
      <div v-else v-loading="loading">
        <el-alert
          class="enroll-hint"
          type="warning"
          :closable="false"
          title="当前账号需要注册多因素认证后才能继续使用"
        />
        <el-alert v-if="loadError" class="enroll-hint" type="error" :closable="false" :title="loadError" />
        <template v-if="secret">
          <p class="enroll-step">1. 在认证器（如 Google Authenticator、Microsoft Authenticator）中手动添加账户，输入以下密钥：</p>
          <div class="enroll-value">
            <code class="enroll-code">{{ secret }}</code>
            <el-button size="small" @click="copy(secret, '密钥')">复制密钥</el-button>
          </div>
          <p class="enroll-step">2. 也可以复制下面的 otpauth 链接，导入到支持该链接的认证器：</p>
          <div class="enroll-value">
            <el-input :model-value="otpauthUrl" readonly />
            <el-button size="small" @click="copy(otpauthUrl, 'otpauth 链接')">复制链接</el-button>
          </div>
          <p class="enroll-step">3. 输入认证器当前显示的六位动态码完成注册：</p>
          <el-form label-position="top" @submit.prevent="onSubmit">
            <el-form-item label="动态码">
              <el-input
                v-model="code"
                placeholder="六位动态码"
                autocomplete="one-time-code"
                @keyup.enter="onSubmit"
              />
            </el-form-item>
            <el-button type="primary" class="auth-submit" native-type="submit" :loading="submitting">
              完成注册
            </el-button>
          </el-form>
        </template>
        <div v-else-if="loadError" class="enroll-retry">
          <el-button @click="loadEnrollment">重新获取密钥</el-button>
        </div>
      </div>
      <div class="enroll-back">
        <el-link type="primary" :underline="false" @click="backToLogin">返回登录</el-link>
      </div>
    </el-card>

    <el-dialog
      v-model="backupDialogVisible"
      title="备用码（仅显示这一次）"
      width="420px"
      :close-on-click-modal="false"
      :close-on-press-escape="false"
      :show-close="false"
    >
      <el-alert
        class="enroll-hint"
        type="warning"
        :closable="false"
        title="请立即保存以下备用码。关闭后将无法再次查看；忘记动态码时可使用备用码登录。"
      />
      <ul class="backup-codes">
        <li v-for="backupCode in backupCodes" :key="backupCode">{{ backupCode }}</li>
      </ul>
      <template #footer>
        <el-button @click="copyBackupCodes">复制全部</el-button>
        <el-button type="primary" @click="onContinue">我已保存，继续</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.auth-card-wide {
  max-width: 520px;
}

.auth-title {
  font-size: 18px;
  font-weight: 600;
  text-align: center;
}

.enroll-hint {
  margin-bottom: 16px;
}

.enroll-step {
  margin: 12px 0 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.enroll-value {
  display: flex;
  gap: 8px;
  align-items: center;
}

.enroll-value .el-input {
  flex: 1;
}

.enroll-code {
  flex: 1;
  padding: 8px 12px;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  word-break: break-all;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}

.enroll-retry,
.enroll-back {
  margin-top: 16px;
}

.enroll-back {
  text-align: center;
}

.auth-submit {
  width: 100%;
}

.backup-codes {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.backup-codes li {
  padding: 6px 10px;
  font-family: 'Courier New', monospace;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}
</style>
