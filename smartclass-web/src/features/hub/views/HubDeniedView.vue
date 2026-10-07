<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()

/** Back to the IAM area, the one console every signed-in operator can always reach. */
function backToIam(): void {
  router.push('/iam')
}
</script>

<template>
  <el-result
    class="hub-denied"
    icon="warning"
    title="无录播调度权限"
    sub-title="当前账号没有任何 dispatch 授权。如需访问录播调度控制台，请联系管理员在身份与访问管理中为该账号绑定相应的 dispatch 角色。"
  >
    <template #extra>
      <el-button type="primary" @click="backToIam">返回身份与访问管理</el-button>
    </template>
  </el-result>
</template>

<style scoped>
.hub-denied {
  padding-top: 10vh;
}
</style>
