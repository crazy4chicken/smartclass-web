<script setup lang="ts">
import RouteDenied from '@/components/RouteDenied.vue'
import { routeDenial } from '@/composables/useRouteDenial'
import StepUpDialog from '@/features/auth/views/StepUpDialog.vue'
</script>

<template>
  <!-- A refused hard load renders its reason here instead of being redirected somewhere else. -->
  <RouteDenied v-if="routeDenial" :denial="routeDenial" />
  <router-view v-else />
  <StepUpDialog />
</template>
