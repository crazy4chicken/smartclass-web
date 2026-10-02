<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { verifyEmail } from '@/features/auth/api'
import { errorMessage } from '@/utils/error'

const route = useRoute()
const router = useRouter()

const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))
const status = ref<'verifying' | 'success' | 'error'>('verifying')
const failure = ref('')

onMounted(async () => {
  if (!token.value) {
    status.value = 'error'
    failure.value = '验证链接缺少令牌，请使用邮件中的完整链接'
    return
  }
  try {
    await verifyEmail(token.value)
    status.value = 'success'
  } catch (error) {
    status.value = 'error'
    failure.value = errorMessage(error)
  }
})
</script>

<template>
  <div class="auth-page">
    <el-card class="auth-card">
      <template #header>
        <div class="auth-title">邮箱验证</div>
      </template>
      <div v-if="status === 'verifying'" v-loading="true" class="verify-loading">
        <p>正在验证邮箱，请稍候…</p>
      </div>
      <el-result
        v-else-if="status === 'success'"
        icon="success"
        title="邮箱验证成功"
        sub-title="你的邮箱已完成验证；若站点开启了审核模式，账号将在管理员审批后激活。"
      >
        <template #extra>
          <el-button type="primary" @click="router.push('/iam/login')">前往登录</el-button>
        </template>
      </el-result>
      <el-result v-else icon="error" title="邮箱验证失败" :sub-title="failure">
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

.verify-loading {
  min-height: 120px;
  text-align: center;
  color: var(--el-text-color-secondary);
}
</style>
