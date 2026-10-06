<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import type { Permission, Role } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listAllPermissions } from '@/features/permissions/api'
import { listAllRolePermissions, setRolePermissions } from '../api'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ role: Role | null }>()

/** Per-permission choice: unset, allow, or deny (`!key`). */
type PermissionChoice = 'none' | 'allow' | 'deny'

const permissions = ref<Permission[]>([])
const choices = ref<Record<string, PermissionChoice>>({})
const keyword = ref('')
const onlyWildcard = ref(false)
/** How many keys the role already carries; shown so the operator sees the baseline. */
const preselectedCount = ref(0)
const loading = ref(false)
const saving = ref(false)

/** A key carries a wildcard when its action or scope segment is `*`. */
function isWildcardKey(key: string): boolean {
  return key.replace(/^!/, '').split(':').includes('*')
}

/**
 * Base keys (`!` stripped) that the registry also carries in their deny form.
 * The service rejects a `!key` that was never registered on its own, so the
 * deny choice is only offered for those.
 */
const denyCapable = computed(() => {
  const denyKeys = new Set(
    permissions.value.filter((item) => item.key.startsWith('!')).map((item) => item.key.slice(1)),
  )
  return denyKeys
})

const filtered = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return permissions.value.filter((item) => {
    if (item.key.startsWith('!')) {
      // Deny entries are folded into the row of their base key.
      return false
    }
    if (onlyWildcard.value && !isWildcardKey(item.key)) {
      return false
    }
    if (!kw) {
      return true
    }
    return item.key.toLowerCase().includes(kw) || item.description.toLowerCase().includes(kw)
  })
})

const wildcardCount = computed(() => permissions.value.filter((item) => isWildcardKey(item.key)).length)

const chosenCount = computed(
  () => Object.values(choices.value).filter((choice) => choice !== 'none').length,
)

async function load(): Promise<void> {
  const role = props.role
  if (!role) {
    return
  }
  loading.value = true
  try {
    const [registry, assigned] = await Promise.all([listAllPermissions(), listAllRolePermissions(role.id)])
    // A role can only carry registered keys, but keep anything unexpected visible
    // so saving never drops a key the operator cannot see.
    const known = new Set(registry.filter((item) => !item.key.startsWith('!')).map((item) => item.key))
    const extra: Permission[] = assigned
      .map((key) => key.replace(/^!/, ''))
      .filter((key) => !known.has(key))
      .map((key) => ({ key, description: '', registered_by: '', created_at: '' }))
    permissions.value = [...registry, ...extra]

    const assignedAllow = new Set(assigned.filter((key) => !key.startsWith('!')).map((key) => key.replace(/^!/, '')))
    const assignedDeny = new Set(assigned.filter((key) => key.startsWith('!')).map((key) => key.slice(1)))
    const next: Record<string, PermissionChoice> = {}
    for (const item of permissions.value) {
      next[item.key] = assignedDeny.has(item.key) ? 'deny' : assignedAllow.has(item.key) ? 'allow' : 'none'
    }
    choices.value = next
    preselectedCount.value = assigned.length
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
  onlyWildcard.value = false
  permissions.value = []
  choices.value = {}
  void load()
})

async function save(): Promise<void> {
  const role = props.role
  if (!role) {
    return
  }
  const keys = Object.entries(choices.value)
    .filter(([, choice]) => choice !== 'none')
    .map(([key, choice]) => (choice === 'deny' ? `!${key}` : key))
  const unregisteredDenies = keys.filter((key) => key.startsWith('!') && !denyCapable.value.has(key.slice(1)))
  if (unregisteredDenies.length > 0) {
    ElMessage.error(`拒绝项需先单独注册：${unregisteredDenies.join('、')}`)
    return
  }
  try {
    await ElMessageBox.confirm(
      `将以 ${keys.length} 条权限整体替换角色「${role.name}」的权限集合（当前 ${preselectedCount.value} 条）。未勾选的权限会被移除。`,
      '确认替换角色权限',
      { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    await setRolePermissions(role.id, keys)
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
      description="列表来自权限注册表（含通配符写法），并已按该角色当前权限预选：允许=已授予，拒绝=以 ! 前缀存储的拒绝项。只提交勾选项，未勾选的权限会被移除。"
    />
    <div class="perm-toolbar">
      <el-input v-model="keyword" placeholder="搜索权限 key 或描述" clearable />
      <el-checkbox v-model="onlyWildcard">仅看通配符（{{ wildcardCount }}）</el-checkbox>
      <span class="perm-count">当前 {{ preselectedCount }} 项 · 已选择 {{ chosenCount }} 项</span>
    </div>
    <div v-loading="loading" class="perm-list">
      <el-empty v-if="!loading && filtered.length === 0" description="暂无匹配的已注册权限" />
      <div v-for="item in filtered" :key="item.key" class="perm-row">
        <div class="perm-info">
          <div class="perm-key">
            <el-tag v-if="isWildcardKey(item.key)" type="warning" size="small" class="wildcard-tag">通配符</el-tag>
            {{ item.key }}
          </div>
          <div class="perm-desc">{{ item.description || '—' }}</div>
        </div>
        <el-radio-group v-model="choices[item.key]" size="small">
          <el-radio-button value="none">不设置</el-radio-button>
          <el-radio-button value="allow">允许</el-radio-button>
          <el-radio-button value="deny" :disabled="!denyCapable.has(item.key)">
            <span :title="denyCapable.has(item.key) ? '' : `需先注册 !${item.key}`">拒绝</span>
          </el-radio-button>
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

.wildcard-tag {
  margin-right: 6px;
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
