<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { clearRouteDenial, type RouteDenial } from '@/composables/useRouteDenial'

const props = defineProps<{ denial: RouteDenial }>()
const router = useRouter()

const requirement = computed(() => props.denial.required.join(' 或 '))

/**
 * Leaving the refused URL is the operator's explicit choice here - the guard
 * deliberately refused to redirect them anywhere on its own.
 */
async function goToProfile(): Promise<void> {
  clearRouteDenial()
  await router.replace('/iam/me')
}
</script>

<template>
  <div class="denied-page">
    <el-result
      class="denied-result"
      icon="warning"
      title="没有访问该页面的权限"
      :sub-title="`${denial.path} 需要 ${requirement} 权限，当前账号未被授予。`"
    >
      <template #extra>
        <el-button type="primary" @click="goToProfile">前往个人中心</el-button>
      </template>
    </el-result>
  </div>
</template>

<style scoped>
.denied-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 24px;
}

.denied-result {
  max-width: 640px;
}
</style>
