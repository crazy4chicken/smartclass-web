<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'

import type { EffectivePasswordPolicy, SessionInfo, User } from '@/api/types'
import { errorMessage } from '@/utils/error'
import {
  createUserCredential,
  getUser,
  getUserPasswordPolicy,
  listUserSessions,
  resetUserTotp,
  revokeAllUserSessions,
  revokeUserSession,
} from '@/features/users/api'
import type { CreateCredentialPayload, CredentialKind, CredentialResult } from '@/features/users/api'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ userId: string }>()

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

const activeTab = ref('credentials')
const loading = ref(false)
const user = ref<User | null>(null)
const sessions = ref<SessionInfo[]>([])
const policy = ref<EffectivePasswordPolicy | null>(null)

const CREDENTIAL_FIELD_LABELS: Record<string, string> = {
  kind: '凭据类型',
  user_id: '用户 ID',
  username: '用户名',
  secret: '密钥（Secret）',
}

const credentialResult = ref<CredentialResult | null>(null)
const credentialEntries = computed(() =>
  Object.entries(credentialResult.value ?? {}).map(([key, value]) => ({
    key: CREDENTIAL_FIELD_LABELS[key] ?? key,
    value: String(value),
  })),
)
const credentialHasSecret = computed(
  () => credentialResult.value !== null && 'secret' in credentialResult.value,
)

const credentialFormRef = ref<FormInstance>()
const credentialSubmitting = ref(false)
const credentialForm = ref<{ kind: CredentialKind; password: string }>({
  kind: 'password',
  password: '',
})

const credentialRules: FormRules = {
  password: [
    {
      validator: (_rule: unknown, value: unknown, callback: (error?: string | Error) => void) => {
        if (credentialForm.value.kind === 'password' && String(value ?? '').trim() === '') {
          callback(new Error('请输入密码'))
          return
        }
        callback()
      },
      trigger: 'blur',
    },
  ],
}

async function loadDetail(): Promise<void> {
  if (props.userId === '') {
    return
  }
  loading.value = true
  try {
    const [detail, sessionList, effectivePolicy] = await Promise.all([
      getUser(props.userId),
      listUserSessions(props.userId),
      getUserPasswordPolicy(props.userId),
    ])
    user.value = detail
    sessions.value = sessionList
    policy.value = effectivePolicy
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

watch(visible, (open) => {
  if (!open) {
    return
  }
  activeTab.value = 'credentials'
  credentialResult.value = null
  credentialForm.value = { kind: 'password', password: '' }
  user.value = null
  sessions.value = []
  policy.value = null
  void loadDetail()
})

async function submitCredential(): Promise<void> {
  if (!credentialFormRef.value) {
    return
  }
  const valid = await credentialFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  credentialSubmitting.value = true
  try {
    const payload: CreateCredentialPayload = { kind: credentialForm.value.kind }
    if (credentialForm.value.kind === 'password') {
      payload.password = credentialForm.value.password
    }
    credentialResult.value = await createUserCredential(props.userId, payload)
    credentialForm.value.password = ''
    credentialFormRef.value.clearValidate()
    ElMessage.success(credentialForm.value.kind === 'service' ? '服务凭据已创建' : '密码凭据已设置')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    credentialSubmitting.value = false
  }
}

async function onRevokeSession(session: SessionInfo): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定吊销会话「${session.id.slice(0, 12)}…」吗？该设备上的登录状态会立即失效。`,
      '吊销会话',
      { type: 'warning', confirmButtonText: '吊销', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await revokeUserSession(props.userId, session.id)
    ElMessage.success('会话已吊销')
    await loadDetail()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onRevokeAllSessions(): Promise<void> {
  try {
    await ElMessageBox.confirm('确定吊销该用户的全部会话吗？所有设备都需要重新登录。', '吊销全部会话', {
      type: 'warning',
      confirmButtonText: '全部吊销',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await revokeAllUserSessions(props.userId)
    ElMessage.success('全部会话已吊销')
    await loadDetail()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onResetTotp(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '确定重置该用户的 TOTP 吗？其 TOTP、待确认凭据与备用码都会被删除，用户需重新注册多因素认证。',
      '重置 TOTP',
      { type: 'warning', confirmButtonText: '重置', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await resetUserTotp(props.userId)
    ElMessage.success('TOTP 已重置')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <el-drawer v-model="visible" size="50%" :title="user ? `用户详情：${user.username}` : '用户详情'">
    <div v-loading="loading" class="drawer-body">
      <div class="drawer-toolbar">
        <el-button :icon="Refresh" :loading="loading" @click="loadDetail">刷新</el-button>
      </div>

      <el-descriptions v-if="user" :column="2" border class="block">
        <el-descriptions-item label="用户名">{{ user.username }}</el-descriptions-item>
        <el-descriptions-item label="显示名">{{ user.display_name }}</el-descriptions-item>
        <el-descriptions-item label="邮箱">{{ user.email ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ user.status }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(user.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="失败登录次数">{{ user.failed_logins }}</el-descriptions-item>
      </el-descriptions>

      <el-tabs v-model="activeTab" class="block">
        <el-tab-pane label="凭据管理" name="credentials">
          <el-alert
            type="info"
            :closable="false"
            show-icon
            title="password 用于设置/重置密码；service 会生成服务凭据，其密钥仅在创建时返回一次。"
            class="block"
          />
          <el-form
            ref="credentialFormRef"
            :model="credentialForm"
            :rules="credentialRules"
            label-width="100px"
          >
            <el-form-item label="凭据类型" prop="kind">
              <el-radio-group v-model="credentialForm.kind">
                <el-radio value="password">密码（password）</el-radio>
                <el-radio value="service">服务凭据（service）</el-radio>
              </el-radio-group>
            </el-form-item>
            <el-form-item v-if="credentialForm.kind === 'password'" label="新密码" prop="password">
              <el-input
                v-model="credentialForm.password"
                type="password"
                show-password
                placeholder="请输入新密码"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :loading="credentialSubmitting" @click="submitCredential">
                提交
              </el-button>
            </el-form-item>
          </el-form>

          <template v-if="credentialResult">
            <el-alert
              v-if="credentialHasSecret"
              type="warning"
              :closable="false"
              show-icon
              title="该密钥仅显示这一次，请立即复制并妥善保存。"
              class="block"
            />
            <el-descriptions :column="1" border>
              <el-descriptions-item v-for="entry in credentialEntries" :key="entry.key" :label="entry.key">
                <span class="secret-value">{{ entry.value }}</span>
              </el-descriptions-item>
            </el-descriptions>
          </template>
        </el-tab-pane>

        <el-tab-pane label="会话" name="sessions">
          <div class="tab-toolbar">
            <el-button type="danger" plain :disabled="sessions.length === 0" @click="onRevokeAllSessions">
              吊销全部会话
            </el-button>
          </div>
          <el-table :data="sessions" border stripe>
            <el-table-column label="会话 ID" min-width="180">
              <template #default="{ row }">
                <el-tooltip :content="row.id" placement="top">
                  <span>{{ row.id.slice(0, 16) }}…</span>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column label="创建时间" width="170">
              <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
            </el-table-column>
            <el-table-column label="最近活跃" width="170">
              <template #default="{ row }">{{ formatTime(row.last_active_at) }}</template>
            </el-table-column>
            <el-table-column label="过期时间" width="170">
              <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="90" fixed="right">
              <template #default="{ row }">
                <el-button link type="danger" @click="onRevokeSession(row)">吊销</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-empty v-if="!loading && sessions.length === 0" description="暂无活跃会话" />
        </el-tab-pane>

        <el-tab-pane label="TOTP" name="totp">
          <el-alert
            type="warning"
            :closable="false"
            show-icon
            title="重置 TOTP 会删除该用户已启用、待确认的 TOTP 凭据与全部备用码，用户需重新注册。"
            class="block"
          />
          <el-button type="danger" @click="onResetTotp">重置 TOTP</el-button>
        </el-tab-pane>

        <el-tab-pane label="有效密码策略" name="policy">
          <el-descriptions v-if="policy" :column="2" border>
            <el-descriptions-item label="最小长度">{{ policy.min_length }}</el-descriptions-item>
            <el-descriptions-item label="密码历史保留数">{{ policy.history_count }}</el-descriptions-item>
            <el-descriptions-item label="弱密码库检查">
              <el-tag :type="policy.breach_check ? 'success' : 'info'">
                {{ policy.breach_check ? '启用' : '未启用' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需包含字母">
              <el-tag :type="policy.require_letter ? 'success' : 'info'">
                {{ policy.require_letter ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需包含大写">
              <el-tag :type="policy.require_upper ? 'success' : 'info'">
                {{ policy.require_upper ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需包含小写">
              <el-tag :type="policy.require_lower ? 'success' : 'info'">
                {{ policy.require_lower ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需包含数字">
              <el-tag :type="policy.require_digit ? 'success' : 'info'">
                {{ policy.require_digit ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="需包含符号">
              <el-tag :type="policy.require_symbol ? 'success' : 'info'">
                {{ policy.require_symbol ? '是' : '否' }}
              </el-tag>
            </el-descriptions-item>
          </el-descriptions>
          <el-empty v-else-if="!loading" description="暂无法获取密码策略" />
        </el-tab-pane>
      </el-tabs>
    </div>
  </el-drawer>
</template>

<style scoped>
.drawer-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.drawer-toolbar {
  display: flex;
  justify-content: flex-end;
}

.block {
  margin-bottom: 12px;
}

.tab-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 8px;
}

.secret-value {
  font-family: monospace;
  word-break: break-all;
}
</style>
