<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import type { Permission, Role } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listAllPermissions } from '@/features/permissions/api'
import { setRolePermissions } from '../api'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ role: Role | null }>()

/** Per-permission choice: unset, allow, or deny (`!key`). */
type PermissionChoice = 'none' | 'allow' | 'deny'

const permissions = ref<Permission[]>([])
const choices = ref<Record<string, PermissionChoice>>({})
const keyword = ref('')
const loading = ref(false)
const saving = ref(false)

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) {
    return permissions.value
  }
  return permissions.value.filter(
    (item) => item.key.toLowerCase().includes(kw) || item.description.toLowerCase().includes(kw),
  )
})

const chosenCount = computed(
  () => Object.values(choices.value).filter((choice) => choice !== 'none').length,
)

async function load(): Promise<void> {
  loading.value = true
  try {
    const list = await listAllPermissions()
    permissions.value = list
    const next: Record<string, PermissionChoice> = {}
    for (const item of list) {
      next[item.key] = 'none'
    }
    choices.value = next
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

watch(visible, (open) => {
  if (!open) {
    return
  }
  keyword.value = ''
  permissions.value = []
  choices.value = {}
  void load()
})

async function save(): Promise<void> {
  if (!props.role) {
    return
  }
  const keys = Object.entries(choices.value)
    .filter(([, choice]) => choice !== 'none')
    .map(([key, choice]) => (choice === 'deny' ? `!${key}` : key))
  saving.value = true
  try {
    await setRolePermissions(props.role.id, keys)
    ElMessage.success('角色权限已保存')
    visible.value = false
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="role ? `权限配置 · ${role.name}` : '权限配置'"
    width="720px"
    :close-on-click-modal="false"
  >
    <el-alert
      type="warning"
      :closable="false"
      show-icon
      title="保存会整体替换该角色的权限集合"
      description="只提交勾选项；选择“拒绝”会以 ! 前缀提交（拒绝优先于允许）。"
    />
    <div class="perm-toolbar">
      <el-input v-model="keyword" placeholder="搜索权限 key 或描述" clearable />
      <span class="perm-count">已选择 {{ chosenCount }} 项</span>
    </div>
    <div v-loading="loading" class="perm-list">
      <el-empty v-if="!loading && filtered.length === 0" description="暂无已注册权限" />
      <div v-for="item in filtered" :key="item.key" class="perm-row">
        <div class="perm-info">
          <div class="perm-key">{{ item.key }}</div>
          <div class="perm-desc">{{ item.description || '—' }}</div>
        </div>
        <el-radio-group v-model="choices[item.key]" size="small">
          <el-radio-button value="none">不设置</el-radio-button>
          <el-radio-button value="allow">允许</el-radio-button>
          <el-radio-button value="deny">拒绝</el-radio-button>
        </el-radio-group>
      </div>
    </div>
    <template #footer>
      <el-button @click="visible = false">取消</el-button>
      <el-button type="primary" :loading="saving" :disabled="!role" @click="save">保存</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.perm-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 12px 0;
}

.perm-count {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.perm-list {
  max-height: 380px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  padding: 4px 12px;
}

.perm-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.perm-row:last-child {
  border-bottom: none;
}

.perm-info {
  flex: 1;
  min-width: 0;
}

.perm-key {
  font-family: var(--el-font-family-mono, monospace);
  font-size: 13px;
  word-break: break-all;
}

.perm-desc {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-top: 2px;
  word-break: break-all;
}
</style>
