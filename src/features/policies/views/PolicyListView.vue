<script setup lang="ts">
import { ref } from 'vue'

import MfaPolicyPanel from './MfaPolicyPanel.vue'
import PasswordPolicyPanel from './PasswordPolicyPanel.vue'

const activeTab = ref('mfa')
</script>

<template>
  <el-card shadow="never">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="MFA 策略" name="mfa">
        <MfaPolicyPanel />
      </el-tab-pane>
      <el-tab-pane label="密码策略" name="password">
        <PasswordPolicyPanel />
      </el-tab-pane>
    </el-tabs>
  </el-card>
</template>
