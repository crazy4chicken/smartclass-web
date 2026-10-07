<script setup lang="ts">
import { onMounted } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'

import type { LoginActivity } from '@/api/types'
import { useCursorList } from '@/composables/useCursorList'
import { fetchLoginActivity } from '@/features/me/api'
import { errorMessage } from '@/utils/error'

const { items, loading, finished, loadMore } = useCursorList<LoginActivity>((cursor, limit) =>
  fetchLoginActivity(cursor, limit),
)

const METHOD_LABELS: Record<string, string> = {
  password: '密码',
  passkey: '通行密钥',
  otp: '动态码',
  totp: '动态码',
  backup_code: '备用码',
  oidc: 'OIDC',
}

const RESULT_TAGS: Record<string, { label: string; type: 'success' | 'danger' | 'warning' | 'info' }> = {
  success: { label: '成功', type: 'success' },
  failure: { label: '失败', type: 'danger' },
  invalid: { label: '失败', type: 'danger' },
  locked: { label: '已锁定', type: 'warning' },
}

async function loadPage(): Promise<void> {
  try {
    await loadMore()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(loadPage)
</script>

<template>
  <div>
    <el-table v-loading="loading" :data="items" empty-text="暂无登录活动">
      <el-table-column label="时间" min-width="180">
        <template #default="{ row }">{{ dayjs(row.at).format('YYYY-MM-DD HH:mm:ss') }}</template>
      </el-table-column>
      <el-table-column label="方式" width="120">
        <template #default="{ row }">{{ METHOD_LABELS[row.method] || row.method }}</template>
      </el-table-column>
      <el-table-column label="结果" width="100">
        <template #default="{ row }">
          <el-tag :type="RESULT_TAGS[row.result]?.type ?? 'info'">
            {{ RESULT_TAGS[row.result]?.label ?? row.result }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="IP 地址" prop="ip" min-width="140" show-overflow-tooltip />
      <el-table-column label="用户代理" prop="user_agent" min-width="260" show-overflow-tooltip />
    </el-table>
    <div class="activity-more">
      <el-button v-if="!finished" :loading="loading" @click="loadPage">加载更多</el-button>
      <span v-else class="activity-finished">已加载全部活动</span>
    </div>
  </div>
</template>

<style scoped>
.activity-more {
  display: flex;
  justify-content: center;
  margin-top: 16px;
}

.activity-finished {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
