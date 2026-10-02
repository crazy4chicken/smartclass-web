<script setup lang="ts">
import { ref } from 'vue'

import AccountTab from './tabs/AccountTab.vue'
import ActivityTab from './tabs/ActivityTab.vue'
import ProfileTab from './tabs/ProfileTab.vue'
import SecurityTab from './tabs/SecurityTab.vue'
import SessionsTab from './tabs/SessionsTab.vue'

const activeTab = ref('profile')
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span class="me-title">个人中心</span>
    </template>
    <el-tabs v-model="activeTab">
      <el-tab-pane label="资料" name="profile" lazy>
        <ProfileTab />
      </el-tab-pane>
      <el-tab-pane label="安全" name="security" lazy>
        <SecurityTab />
      </el-tab-pane>
      <el-tab-pane label="会话" name="sessions" lazy>
        <SessionsTab />
      </el-tab-pane>
      <el-tab-pane label="登录活动" name="activity" lazy>
        <ActivityTab />
      </el-tab-pane>
      <el-tab-pane label="账号" name="account" lazy>
        <AccountTab />
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>

<style scoped>
.me-title {
  font-size: 16px;
  font-weight: 600;
}
</style>
