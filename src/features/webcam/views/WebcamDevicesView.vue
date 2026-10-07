<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Plus, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import { createDevice, deleteDevice, listDevices } from '@/features/webcam/api'
import type { Device, DeviceToken } from '@/features/webcam/api'

const router = useRouter()
const auth = useAuthStore()

const canManage = computed(() => auth.hasGrant('cam', 'manage'))
/** Ownership may only be assigned by a caller whose manage grant reaches every scope. */
const canAssignOwnership = computed(() => auth.permissions.includes('cam:manage:any'))

const devices = ref<Device[]>([])
const loading = ref(false)
const limit = ref(100)

const dialogVisible = ref(false)
const creating = ref(false)
const form = ref({ name: '', location: '', team_id: '', owner_id: '' })

/** Device token of the last registration or rotation; the service returns it exactly once. */
const issued = ref<DeviceToken | null>(null)

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    devices.value = await listDevices(limit.value)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

function openCreate(): void {
  form.value = { name: '', location: '', team_id: '', owner_id: '' }
  dialogVisible.value = true
}

async function submitCreate(): Promise<void> {
  const name = form.value.name.trim()
  if (!name) {
    ElMessage.warning('请填写设备名称')
    return
  }
  creating.value = true
  try {
    const payload = {
      name,
      location: form.value.location.trim() || undefined,
      ...(canAssignOwnership.value
        ? {
            team_id: form.value.team_id.trim() || undefined,
            owner_id: form.value.owner_id.trim() || undefined,
          }
        : {}),
    }
    issued.value = await createDevice(payload)
    dialogVisible.value = false
    ElMessage.success('设备已创建，请立即保存设备令牌')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    creating.value = false
  }
}

async function onDelete(row: Device): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `删除设备「${row.name}」会同时删除它的录制场次、分段与照片，且无法恢复。`,
      '删除设备',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteDevice(row.id)
    ElMessage.success('设备已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function copyToken(): Promise<void> {
  if (!issued.value) {
    return
  }
  try {
    await navigator.clipboard.writeText(issued.value.token)
    ElMessage.success('设备令牌已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">设备</div>
      <div class="toolbar-actions">
        <el-select v-model="limit" class="limit-select" @change="refresh">
          <el-option :value="50" label="50 条" />
          <el-option :value="100" label="100 条" />
          <el-option :value="500" label="500 条" />
        </el-select>
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openCreate">新建设备</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="devices" border stripe>
      <el-table-column prop="name" label="名称" min-width="180" show-overflow-tooltip />
      <el-table-column prop="location" label="位置" min-width="150" show-overflow-tooltip />
      <el-table-column label="在线" width="90">
        <template #default="{ row }">
          <el-tag size="small" :type="row.last_seen ? 'success' : 'info'">
            {{ row.last_seen ? '已连接' : '未连接' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最后注册" width="170">
        <template #default="{ row }">{{ formatTime(row.last_seen) }}</template>
      </el-table-column>
      <el-table-column label="归属" min-width="200">
        <template #default="{ row }">
          <span class="mono">{{ row.team_id || '—' }}</span> · <span class="mono">{{ row.owner_id || '—' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="170">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="router.push(`/webcam/devices/${encodeURIComponent(row.id)}`)">
            详情
          </el-button>
          <el-button v-if="canManage" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="没有可见的设备" />
      </template>
    </el-table>

    <el-dialog v-model="dialogVisible" title="新建设备" width="520px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="例如：高一(3)班 教室" maxlength="120" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="form.location" placeholder="例如：教学楼 A-301" maxlength="120" />
        </el-form-item>
        <template v-if="canAssignOwnership">
          <el-form-item label="团队 ID">
            <el-input v-model="form.team_id" placeholder="留空则归属当前账号" />
          </el-form-item>
          <el-form-item label="所有者 ID">
            <el-input v-model="form.owner_id" placeholder="留空则归属当前账号" />
          </el-form-item>
        </template>
      </el-form>
      <div class="field-hint">
        设备令牌只会在创建后显示一次；设备端用它完成注册并建立 WebSocket 连接。
      </div>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="!!issued" title="设备令牌（仅显示一次）" width="560px" @close="issued = null">
      <el-alert type="warning" :closable="false" show-icon title="请立即复制并妥善保存，关闭后无法再次查看。" />
      <div class="token-row">
        <el-input :model-value="issued?.token ?? ''" readonly class="token-input" />
        <el-button :icon="CopyDocument" @click="copyToken">复制</el-button>
      </div>
      <div class="field-hint">
        设备 ID：<span class="mono">{{ issued?.device.id }}</span>
      </div>
      <template #footer>
        <el-button type="primary" @click="issued = null">我已保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.limit-select {
  width: 110px;
}

.mono {
  font-family: monospace;
}

.token-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.token-input :deep(input) {
  font-family: monospace;
}

.field-hint {
  margin-top: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
