<script setup lang="ts">
import { ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'

import type { Impersonation } from '@/api/types'
import { errorMessage } from '@/utils/error'

import { startImpersonation } from '../api'

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = ref({ user_id: '', reason: '', ttl_seconds: 300 })
const result = ref<Impersonation | null>(null)
const tokenVisible = ref(false)

const rules: FormRules = {
  user_id: [{ required: true, message: '请输入目标用户 ID', trigger: 'blur' }],
  reason: [
    { required: true, message: '请输入假冒理由', trigger: 'blur' },
    { min: 3, message: '理由至少 3 个字符', trigger: 'blur' },
  ],
}

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

async function onStart(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  const userID = form.value.user_id.trim()
  const confirmed = await ElMessageBox.confirm(
    `将以用户 ${userID} 的身份签发一个受审计的假冒令牌。操作者、目标用户、理由与有效期都会写入审计日志，且不可撤销。确定继续？`,
    '发起假冒',
    { type: 'warning', confirmButtonText: '确认发起', cancelButtonText: '取消' },
  ).catch(() => false)
  if (!confirmed) {
    return
  }
  submitting.value = true
  try {
    result.value = await startImpersonation({
      user_id: userID,
      reason: form.value.reason.trim(),
      ttl_seconds: form.value.ttl_seconds,
    })
    tokenVisible.value = false
    ElMessage.success('假冒令牌已签发，请立即复制保存')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function copyToken(): Promise<void> {
  const token = result.value?.access_token ?? ''
  if (!token) {
    return
  }
  try {
    await navigator.clipboard.writeText(token)
    ElMessage.success('令牌已复制到剪贴板')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}
</script>

<template>
  <div class="impersonations-page">
    <el-card shadow="never" class="section">
      <template #header>发起用户假冒</template>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="假冒会被完整审计；需要 10 分钟内的重新认证，目标用户必须处于正常状态且不持有 IAM 权限。"
        class="notice"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" class="start-form">
        <el-form-item label="目标用户 ID" prop="user_id">
          <el-input v-model="form.user_id" placeholder="目标用户 ID" />
        </el-form-item>
        <el-form-item label="假冒理由" prop="reason">
          <el-input
            v-model="form.reason"
            type="textarea"
            :rows="3"
            maxlength="200"
            show-word-limit
            placeholder="例如：排查工单 #1234 的账号问题"
          />
        </el-form-item>
        <el-form-item label="有效期（秒）" prop="ttl_seconds">
          <el-input-number v-model="form.ttl_seconds" :min="1" :max="900" :step="60" />
          <span class="field-hint">1–900 秒，默认 300 秒，服务端最长 15 分钟</span>
        </el-form-item>
        <el-form-item>
          <el-button type="danger" :loading="submitting" @click="onStart">发起假冒</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card v-if="result" shadow="never" class="section">
      <template #header>假冒令牌（仅显示一次）</template>
      <el-alert
        type="error"
        :closable="false"
        show-icon
        title="请立即复制并妥善保管：关闭或刷新页面后无法再次查看。平台不会自动切换到目标用户。"
        class="notice"
      />
      <el-descriptions :column="1" border>
        <el-descriptions-item label="令牌">
          <div class="token-row">
            <el-input :type="tokenVisible ? 'text' : 'password'" readonly :model-value="result.access_token">
              <template #append>
                <el-button @click="tokenVisible = !tokenVisible">{{ tokenVisible ? '隐藏' : '显示' }}</el-button>
              </template>
            </el-input>
            <el-button type="primary" plain @click="copyToken">复制</el-button>
          </div>
        </el-descriptions-item>
        <el-descriptions-item label="令牌类型">{{ result.token_type }}</el-descriptions-item>
        <el-descriptions-item label="过期时间">{{ formatTime(result.expires_at) }}</el-descriptions-item>
      </el-descriptions>
      <p class="hint">
        该令牌不含刷新令牌与会话，过期后需重新发起假冒；使用方式：请求头
        <code>Authorization: {{ result.token_type }} &lt;token&gt;</code>。
      </p>
    </el-card>
  </div>
</template>

<style scoped>
.section + .section {
  margin-top: 16px;
}

.notice {
  margin-bottom: 12px;
}

.start-form {
  max-width: 620px;
}

.field-hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.token-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hint {
  margin: 12px 0 0;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

code {
  padding: 1px 4px;
  background: var(--el-fill-color-light);
  border-radius: 3px;
}
</style>
