<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'

import type { JwksKey, SigningKey } from '@/api/types'
import { errorMessage } from '@/utils/error'

import { fetchJwks, rotateSigningKey } from '../api'

const jwksKeys = ref<JwksKey[]>([])
const jwksRaw = ref('')
const jwksLoading = ref(false)

const rotating = ref(false)
const rotationResult = ref<SigningKey | null>(null)

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

async function loadJwks(): Promise<void> {
  jwksLoading.value = true
  try {
    const data = await fetchJwks()
    jwksKeys.value = Array.isArray(data.keys) ? data.keys : []
    jwksRaw.value = JSON.stringify(data, null, 2)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    jwksLoading.value = false
  }
}

async function onRotate(): Promise<void> {
  const confirmed = await ElMessageBox.confirm(
    '轮换后新签名密钥立即生效；旧公钥会在 JWKS 中保留一段重叠期（访问令牌 TTL 的两倍），重叠期结束后由旧密钥签发的 access token 将无法通过校验而失效。该操作会写入审计日志且不可撤销，确定轮换？',
    '轮换签名密钥',
    {
      type: 'warning',
      confirmButtonText: '确认轮换',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    },
  ).catch(() => false)
  if (!confirmed) {
    return
  }
  rotating.value = true
  try {
    rotationResult.value = await rotateSigningKey()
    ElMessage.success('签名密钥已轮换')
    await loadJwks()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    rotating.value = false
  }
}

onMounted(loadJwks)
</script>

<template>
  <div class="keys-page">
    <el-card shadow="never" class="section">
      <template #header>
        <div class="card-header">
          <span>当前签名密钥（JWKS）</span>
          <el-button text type="primary" :loading="jwksLoading" @click="loadJwks">刷新</el-button>
        </div>
      </template>
      <el-table v-loading="jwksLoading" :data="jwksKeys" border stripe empty-text="暂未获取到签名密钥">
        <el-table-column prop="kid" label="kid" min-width="220" show-overflow-tooltip />
        <el-table-column prop="alg" label="算法" width="100" />
        <el-table-column prop="kty" label="类型" width="90" />
        <el-table-column prop="crv" label="曲线" width="110" />
        <el-table-column prop="use" label="用途" width="90" />
        <el-table-column prop="x" label="公钥（x）" min-width="280">
          <template #default="{ row }">
            <span class="mono">{{ row.x }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-collapse class="raw-collapse">
        <el-collapse-item title="查看原始 JSON" name="raw">
          <pre class="raw-json">{{ jwksRaw || '（暂无数据）' }}</pre>
        </el-collapse-item>
      </el-collapse>
    </el-card>

    <el-card shadow="never" class="section">
      <template #header>轮换签名密钥</template>
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="轮换会让由旧密钥签发的 access token 在重叠期结束后失效；需要 10 分钟内的重新认证。操作前请确认处于维护窗口。"
        class="notice"
      />
      <el-button type="danger" :loading="rotating" @click="onRotate">轮换签名密钥</el-button>

      <el-descriptions v-if="rotationResult" :column="1" border class="result">
        <el-descriptions-item label="新密钥 kid">
          <span class="mono">{{ rotationResult.kid }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="旧密钥移除时间">
          {{ formatTime(rotationResult.retire_at) }}
        </el-descriptions-item>
        <el-descriptions-item v-if="rotationResult.warning" label="提示">
          {{ rotationResult.warning }}
        </el-descriptions-item>
      </el-descriptions>
    </el-card>
  </div>
</template>

<style scoped>
.section + .section {
  margin-top: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.notice {
  margin-bottom: 12px;
}

.raw-collapse {
  margin-top: 12px;
}

.raw-json {
  margin: 0;
  max-height: 320px;
  overflow: auto;
  padding: 8px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
}

.result {
  margin-top: 16px;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  word-break: break-all;
}
</style>
