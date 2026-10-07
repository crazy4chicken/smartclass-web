<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import { isApiError } from '@/api/http'
import type { EffectivePasswordPolicy, Passkey } from '@/api/types'
import {
  serializeAttestation,
  toCreationOptions,
  WEBAUTHN_SUPPORTED,
  webAuthnErrorMessage,
} from '@/features/auth/webauthn'
import {
  beginPasskeyRegistration,
  changePassword,
  confirmTotpEnrollment,
  deletePasskey,
  disableTotp,
  fetchPasskeys,
  fetchPasswordPolicy,
  finishPasskeyRegistration,
  regenerateBackupCodes,
  startTotpEnrollment,
} from '@/features/me/api'
import { useAuthStore } from '@/stores/auth'
import { errorMessage } from '@/utils/error'

const router = useRouter()
const auth = useAuthStore()

const policy = ref<EffectivePasswordPolicy | null>(null)
const passwordFormRef = ref<FormInstance>()
const passwordSaving = ref(false)
const passwordForm = ref({ current_password: '', new_password: '', confirm_password: '' })

const policyText = computed(() => {
  const current = policy.value
  if (!current) {
    return ''
  }
  const parts = [`长度至少 ${current.min_length} 位`]
  const classes: string[] = []
  if (current.require_upper) classes.push('大写字母')
  if (current.require_lower) classes.push('小写字母')
  if (current.require_letter) classes.push('字母')
  if (current.require_digit) classes.push('数字')
  if (current.require_symbol) classes.push('符号')
  if (classes.length > 0) parts.push(`需包含${classes.join('、')}`)
  if (current.history_count > 0) parts.push(`不能与最近 ${current.history_count} 次使用过的密码相同`)
  if (current.breach_check) parts.push('会进行弱口令校验')
  return parts.join('；')
})

const passwordRules = computed<FormRules>(() => ({
  current_password: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  new_password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    {
      min: policy.value?.min_length ?? 8,
      message: `新密码至少 ${policy.value?.min_length ?? 8} 位`,
      trigger: 'blur',
    },
  ],
  confirm_password: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (_rule, value, callback) => {
        if (value !== passwordForm.value.new_password) {
          callback(new Error('两次输入的新密码不一致'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}))

const totpEnrollVisible = ref(false)
const totpEnrollLoading = ref(false)
const totpSecret = ref('')
const totpOtpauthUrl = ref('')
const totpCode = ref('')
const totpConfirming = ref(false)

const totpDisableVisible = ref(false)
const totpDisableCode = ref('')
const totpDisabling = ref(false)

const backupCodesVisible = ref(false)
const backupCodes = ref<string[]>([])
const backupPasswordVisible = ref(false)
const backupPassword = ref('')
const backupGenerating = ref(false)

const passkeys = ref<Passkey[]>([])
const passkeysLoading = ref(false)
const passkeyRegistering = ref(false)

onMounted(async () => {
  try {
    policy.value = await fetchPasswordPolicy()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
  await loadPasskeys()
})

async function onChangePassword(): Promise<void> {
  if (!passwordFormRef.value) {
    return
  }
  const valid = await passwordFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  if (passwordForm.value.new_password === passwordForm.value.current_password) {
    ElMessage.warning('新密码不能与当前密码相同')
    return
  }
  passwordSaving.value = true
  try {
    await changePassword({
      current_password: passwordForm.value.current_password,
      new_password: passwordForm.value.new_password,
    })
    ElMessage.success('密码修改成功，所有登录会话已注销，请重新登录')
    auth.clear()
    await router.push('/iam/login')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    passwordSaving.value = false
  }
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

async function openTotpEnroll(): Promise<void> {
  totpEnrollVisible.value = true
  totpEnrollLoading.value = true
  totpSecret.value = ''
  totpOtpauthUrl.value = ''
  totpCode.value = ''
  try {
    const enrollment = await startTotpEnrollment()
    totpSecret.value = enrollment.secret
    totpOtpauthUrl.value = enrollment.otpauth_url
  } catch (error) {
    totpEnrollVisible.value = false
    ElMessage.error(errorMessage(error))
  } finally {
    totpEnrollLoading.value = false
  }
}

async function onConfirmTotp(): Promise<void> {
  const code = totpCode.value.trim()
  if (!code) {
    ElMessage.warning('请输入认证器显示的六位动态码')
    return
  }
  totpConfirming.value = true
  try {
    backupCodes.value = await confirmTotpEnrollment(code)
    totpEnrollVisible.value = false
    backupCodesVisible.value = true
    ElMessage.success('两步验证已启用')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    totpConfirming.value = false
  }
}

async function onDisableTotp(): Promise<void> {
  const code = totpDisableCode.value.trim()
  if (!code) {
    ElMessage.warning('请输入动态码或备用码')
    return
  }
  totpDisabling.value = true
  try {
    await disableTotp(code)
    totpDisableVisible.value = false
    totpDisableCode.value = ''
    ElMessage.success('两步验证已关闭')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    totpDisabling.value = false
  }
}

async function onRegenerateBackupCodes(): Promise<void> {
  if (!backupPassword.value) {
    ElMessage.warning('请输入当前密码')
    return
  }
  backupGenerating.value = true
  try {
    backupCodes.value = await regenerateBackupCodes(backupPassword.value)
    backupPasswordVisible.value = false
    backupPassword.value = ''
    backupCodesVisible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    backupGenerating.value = false
  }
}

async function onRegisterPasskey(): Promise<void> {
  if (!WEBAUTHN_SUPPORTED) {
    ElMessage.warning('当前浏览器不支持通行密钥')
    return
  }
  passkeyRegistering.value = true
  try {
    const publicKey = await beginPasskeyRegistration()
    const credential = (await navigator.credentials.create({
      publicKey: toCreationOptions(publicKey),
    })) as PublicKeyCredential | null
    if (!credential) {
      ElMessage.warning('未获取到通行密钥凭证，请重试')
      return
    }
    await finishPasskeyRegistration(serializeAttestation(credential))
    ElMessage.success('通行密钥注册成功')
    await loadPasskeys()
  } catch (error) {
    ElMessage.error(isApiError(error) ? errorMessage(error) : webAuthnErrorMessage(error))
  } finally {
    passkeyRegistering.value = false
  }
}

async function loadPasskeys(): Promise<void> {
  passkeysLoading.value = true
  try {
    passkeys.value = await fetchPasskeys()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    passkeysLoading.value = false
  }
}

async function onDeletePasskey(passkey: Passkey): Promise<void> {
  try {
    await ElMessageBox.confirm('删除后该通行密钥将无法用于登录，确定继续吗？', '删除通行密钥', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deletePasskey(passkey.id)
    ElMessage.success('通行密钥已删除')
    await loadPasskeys()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <div>
    <el-divider content-position="left">修改密码</el-divider>
    <el-alert
      v-if="policyText"
      class="section-alert"
      type="info"
      :closable="false"
      :title="`密码要求：${policyText}`"
    />
    <el-form
      ref="passwordFormRef"
      :model="passwordForm"
      :rules="passwordRules"
      label-width="100px"
      class="section-form"
      @submit.prevent="onChangePassword"
    >
      <el-form-item label="当前密码" prop="current_password">
        <el-input
          v-model="passwordForm.current_password"
          type="password"
          show-password
          placeholder="请输入当前密码"
          autocomplete="current-password"
        />
      </el-form-item>
      <el-form-item label="新密码" prop="new_password">
        <el-input
          v-model="passwordForm.new_password"
          type="password"
          show-password
          placeholder="请输入新密码"
          autocomplete="new-password"
        />
      </el-form-item>
      <el-form-item label="确认新密码" prop="confirm_password">
        <el-input
          v-model="passwordForm.confirm_password"
          type="password"
          show-password
          placeholder="请再次输入新密码"
          autocomplete="new-password"
          @keyup.enter="onChangePassword"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" native-type="submit" :loading="passwordSaving">修改密码</el-button>
      </el-form-item>
    </el-form>

    <el-divider content-position="left">两步验证（TOTP）</el-divider>
    <p class="section-desc">
      启用后登录需要输入认证器生成的动态码；备用码可在动态码不可用时一次性使用。
    </p>
    <div class="section-actions">
      <el-button type="primary" @click="openTotpEnroll">启用 / 重新绑定</el-button>
      <el-button @click="totpDisableVisible = true">关闭两步验证</el-button>
      <el-button @click="backupPasswordVisible = true">重新生成备用码</el-button>
    </div>

    <el-divider content-position="left">通行密钥（Passkey）</el-divider>
    <div class="section-actions">
      <el-button type="primary" :loading="passkeyRegistering" @click="onRegisterPasskey">
        注册新通行密钥
      </el-button>
    </div>
    <el-table
      v-loading="passkeysLoading"
      :data="passkeys"
      class="section-table"
      empty-text="尚未注册通行密钥"
    >
      <el-table-column label="凭证 ID" prop="id" min-width="260" show-overflow-tooltip />
      <el-table-column label="注册时间" min-width="180">
        <template #default="{ row }">
          {{ dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') }}
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="onDeletePasskey(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="totpEnrollVisible" title="启用两步验证" width="480px">
      <div v-loading="totpEnrollLoading">
        <template v-if="totpSecret">
          <p class="dialog-step">1. 在认证器中手动添加账户，输入以下密钥：</p>
          <div class="dialog-value">
            <code class="dialog-code">{{ totpSecret }}</code>
            <el-button size="small" @click="copy(totpSecret, '密钥')">复制密钥</el-button>
          </div>
          <p class="dialog-step">2. 也可复制 otpauth 链接导入认证器：</p>
          <div class="dialog-value">
            <el-input :model-value="totpOtpauthUrl" readonly />
            <el-button size="small" @click="copy(totpOtpauthUrl, 'otpauth 链接')">复制链接</el-button>
          </div>
          <p class="dialog-step">3. 输入认证器显示的六位动态码完成启用：</p>
          <el-form label-position="top" @submit.prevent="onConfirmTotp">
            <el-form-item label="动态码">
              <el-input
                v-model="totpCode"
                placeholder="六位动态码"
                autocomplete="one-time-code"
                @keyup.enter="onConfirmTotp"
              />
            </el-form-item>
          </el-form>
        </template>
      </div>
      <template #footer>
        <el-button @click="totpEnrollVisible = false">取消</el-button>
        <el-button type="primary" :loading="totpConfirming" :disabled="!totpSecret" @click="onConfirmTotp">
          完成启用
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="totpDisableVisible" title="关闭两步验证" width="420px">
      <el-alert
        class="section-alert"
        type="warning"
        :closable="false"
        title="关闭后登录将不再要求动态码，账号安全性会降低。"
      />
      <el-form label-position="top" @submit.prevent="onDisableTotp">
        <el-form-item label="动态码或备用码">
          <el-input
            v-model="totpDisableCode"
            placeholder="请输入当前动态码或一个未使用的备用码"
            @keyup.enter="onDisableTotp"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="totpDisableVisible = false">取消</el-button>
        <el-button type="danger" :loading="totpDisabling" @click="onDisableTotp">确认关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="backupPasswordVisible" title="重新生成备用码" width="420px">
      <el-alert
        class="section-alert"
        type="warning"
        :closable="false"
        title="重新生成后，旧备用码将全部失效。"
      />
      <el-form label-position="top" @submit.prevent="onRegenerateBackupCodes">
        <el-form-item label="当前密码">
          <el-input
            v-model="backupPassword"
            type="password"
            show-password
            placeholder="请输入当前密码"
            autocomplete="current-password"
            @keyup.enter="onRegenerateBackupCodes"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="backupPasswordVisible = false">取消</el-button>
        <el-button type="primary" :loading="backupGenerating" @click="onRegenerateBackupCodes">
          重新生成
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="backupCodesVisible"
      title="备用码（仅显示这一次）"
      width="420px"
      :close-on-click-modal="false"
    >
      <el-alert
        class="section-alert"
        type="warning"
        :closable="false"
        title="请立即保存以下备用码，关闭后将无法再次查看。"
      />
      <ul class="backup-codes">
        <li v-for="code in backupCodes" :key="code">{{ code }}</li>
      </ul>
      <template #footer>
        <el-button @click="copy(backupCodes.join('\n'), '全部备用码')">复制全部</el-button>
        <el-button type="primary" @click="backupCodesVisible = false">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.section-alert {
  margin-bottom: 16px;
}

.section-form {
  max-width: 480px;
}

.section-desc {
  margin: 0 0 12px;
  color: var(--el-text-color-regular);
  font-size: 14px;
}

.section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}

.section-actions .el-button + .el-button {
  margin-left: 0;
}

.section-table {
  width: 100%;
}

.dialog-step {
  margin: 12px 0 8px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.dialog-value {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dialog-value .el-input {
  flex: 1;
}

.dialog-code {
  flex: 1;
  padding: 8px 12px;
  font-family: 'Courier New', monospace;
  font-size: 16px;
  word-break: break-all;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
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
