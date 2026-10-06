<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

import type { Permission, Role } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listAllPermissions, registerPermission } from '@/features/permissions/api'
import { permissionKeyError } from '@/features/permissions/grammar'
import { useAuthStore } from '@/stores/auth'
import { listAllRolePermissions, setRolePermissions } from '../api'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ role: Role | null }>()

const auth = useAuthStore()

/** Per-permission choice: unset, allow, or deny (`!key`). */
type PermissionChoice = 'none' | 'allow' | 'deny'

const permissions = ref<Permission[]>([])
const choices = ref<Record<string, PermissionChoice>>({})
const keyword = ref('')
const onlyWildcard = ref(false)
/** Keys added by hand in this dialog; they may not exist in the registry yet. */
const manualKeys = ref<string[]>([])
const manualInput = ref('')
/** How many keys the role already carries; shown so the operator sees the baseline. */
const preselectedCount = ref(0)
const loading = ref(false)
const saving = ref(false)

/** A key carries a wildcard when its action or scope segment is `*`. */
function isWildcardKey(key: string): boolean {
  return key.replace(/^!/, '').split(':').includes('*')
}

/** Registry keys in their allow form, plus the `!` forms that exist. */
const registeredAllow = ref<Set<string>>(new Set())
const registeredDeny = ref<Set<string>>(new Set())

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

/** Adds a hand-written key (wildcards welcome) as a row of its own. */
function addManualKey(): void {
  const key = manualInput.value.trim().replace(/^!/, '')
  const reason = permissionKeyError(key)
  if (reason) {
    ElMessage.error(reason)
    return
  }
  if (permissions.value.some((item) => item.key === key)) {
    ElMessage.info('该 key 已在列表中')
    manualInput.value = ''
    return
  }
  permissions.value = [...permissions.value, { key, description: '手动添加', registered_by: '', created_at: '' }]
  manualKeys.value = [...manualKeys.value, key]
  choices.value = { ...choices.value, [key]: 'allow' }
  manualInput.value = ''
}

async function load(): Promise<void> {
  const role = props.role
  if (!role) {
    return
  }
  loading.value = true
  try {
    const [registry, assigned] = await Promise.all([listAllPermissions(), listAllRolePermissions(role.id)])
    registeredAllow.value = new Set(registry.filter((item) => !item.key.startsWith('!')).map((item) => item.key))
    registeredDeny.value = new Set(registry.filter((item) => item.key.startsWith('!')).map((item) => item.key.slice(1)))
    // A role can only carry registered keys, but keep anything unexpected visible
    // so saving never drops a key the operator cannot see.
    const extra: Permission[] = assigned
      .map((key) => key.replace(/^!/, ''))
      .filter((key) => !registeredAllow.value.has(key))
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
  manualKeys.value = []
  manualInput.value = ''
  permissions.value = []
  choices.value = {}
  void load()
})

/**
 * Registers every key the service has not seen yet. The registry is an upsert
 * keyed by the literal key, and the service rejects assignments of keys that
 * were never registered — including the `!key` deny form.
 */
async function registerMissing(keys: string[]): Promise<string[]> {
  const registeredBy = auth.profile?.username || 'smartclass-web'
  const missing = keys.filter((key) =>
    key.startsWith('!') ? !registeredDeny.value.has(key.slice(1)) : !registeredAllow.value.has(key),
  )
  for (const key of missing) {
    await registerPermission({
      key,
      registered_by: registeredBy,
      description: key.startsWith('!') ? `由前端界面注册的拒绝项` : `由前端界面注册的权限`,
    })
    if (key.startsWith('!')) {
      registeredDeny.value = new Set([...registeredDeny.value, key.slice(1)])
    } else {
      registeredAllow.value = new Set([...registeredAllow.value, key])
    }
  }
  return missing
}

async function save(): Promise<void> {
  const role = props.role
  if (!role) {
    return
  }
  const keys = Object.entries(choices.value)
    .filter(([, choice]) => choice !== 'none')
    .map(([key, choice]) => (choice === 'deny' ? `!${key}` : key))
  const pending = keys.filter((key) =>
    key.startsWith('!') ? !registeredDeny.value.has(key.slice(1)) : !registeredAllow.value.has(key),
  )
  try {
    await ElMessageBox.confirm(
      `将以 ${keys.length} 条权限整体替换角色「${role.name}」的权限集合（当前 ${preselectedCount.value} 条）。未勾选的权限会被移除。` +
        (pending.length > 0 ? `\n其中 ${pending.length} 个 key 尚未注册，会先注册再提交：${pending.join('、')}` : ''),
      '确认替换角色权限',
      { type: 'warning', confirmButtonText: '替换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  saving.value = true
  try {
    const created = await registerMissing(keys)
    await setRolePermissions(role.id, keys)
    ElMessage.success(created.length > 0 ? `已注册 ${created.length} 个新 key，角色权限已保存` : '角色权限已保存')
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
      description="列表来自权限注册表（含通配符写法），并已按该角色当前权限预选：允许=已授予，拒绝=以 ! 前缀存储的拒绝项。未注册的 key（含 ! 拒绝项）会在保存前自动注册。只提交勾选项，未勾选的权限会被移除。"
    />
    <div class="perm-add">
      <el-input
        v-model="manualInput"
        placeholder="手动添加 key，支持通配符，如 orders:*:any"
        clearable
        @keyup.enter="addManualKey"
      />
      <el-button :icon="Plus" @click="addManualKey">添加</el-button>
      <span class="perm-add-hint">resource 不支持 *；action/scope 可用 *（iam 仅 :any）</span>
    </div>
    <div class="perm-toolbar">
      <el-input v-model="keyword" placeholder="搜索权限 key 或描述" clearable />
      <el-checkbox v-model="onlyWildcard">仅看通配符（{{ wildcardCount }}）</el-checkbox>
      <span class="perm-count">当前 {{ preselectedCount }} 项 · 已选择 {{ chosenCount }} 项</span>
    </div>
    <div v-loading="loading" class="perm-list">
      <el-empty v-if="!loading && filtered.length === 0" description="暂无匹配的权限，可在上方手动添加" />
      <div v-for="item in filtered" :key="item.key" class="perm-row">
        <div class="perm-info">
          <div class="perm-key">
            <el-tag v-if="isWildcardKey(item.key)" type="warning" size="small" class="wildcard-tag">通配符</el-tag>
            <el-tag v-if="manualKeys.includes(item.key)" type="info" size="small" class="wildcard-tag">手动</el-tag>
            <el-tag v-if="!registeredAllow.has(item.key)" type="danger" size="small" class="wildcard-tag">未注册</el-tag>
            {{ item.key }}
          </div>
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
.perm-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
}

.perm-add-hint {
  flex: none;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

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
