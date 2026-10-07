<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'

import type { SessionInfo } from '@/api/types'
import { fetchSessions, revokeSession } from '@/features/me/api'
import { errorMessage } from '@/utils/error'

const sessions = ref<SessionInfo[]>([])
const loading = ref(false)

async function load(): Promise<void> {
  loading.value = true
  try {
    sessions.value = await fetchSessions()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function onRevoke(session: SessionInfo): Promise<void> {
  try {
    await ElMessageBox.confirm('吊销后该会话将立即退出登录，确定继续吗？', '吊销会话', {
      type: 'warning',
      confirmButtonText: '吊销',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await revokeSession(session.id)
    ElMessage.success('会话已吊销')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}
</script>

<template>
  <div>
    <div class="session-actions">
      <el-button :loading="loading" @click="load">刷新</el-button>
    </div>
    <el-table v-loading="loading" :data="sessions" empty-text="暂无活动会话">
      <el-table-column label="会话 ID" prop="id" min-width="240" show-overflow-tooltip />
      <el-table-column label="创建时间" min-width="180">
        <template #default="{ row }">{{ dayjs(row.created_at).format('YYYY-MM-DD HH:mm:ss') }}</template>
      </el-table-column>
      <el-table-column label="最近活动" min-width="180">
        <template #default="{ row }">
          {{ dayjs(row.last_active_at).format('YYYY-MM-DD HH:mm:ss') }}
        </template>
      </el-table-column>
      <el-table-column label="过期时间" min-width="180">
        <template #default="{ row }">{{ dayjs(row.expires_at).format('YYYY-MM-DD HH:mm:ss') }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="danger" @click="onRevoke(row)">吊销</el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.session-actions {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 12px;
}
</style>
