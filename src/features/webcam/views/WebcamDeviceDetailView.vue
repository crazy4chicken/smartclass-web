<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import {
  capturePhoto,
  deleteDevice,
  getDevice,
  listDevicePhotos,
  listDeviceStreams,
  rotateDeviceToken,
  startRecording,
  stopRecording,
  switchCamera,
  updateDevice,
} from '@/features/webcam/api'
import type { DeviceDetail, DeviceToken, Photo, Stream } from '@/features/webcam/api'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const canManage = computed(() => auth.hasGrant('cam', 'manage'))
const canControl = computed(() => auth.hasGrant('cam', 'control'))
/** Ownership may only be reassigned by a caller whose manage grant reaches every scope. */
const canAssignOwnership = computed(() => auth.permissions.includes('cam:manage:any'))

const deviceId = computed(() => String(route.params.deviceId ?? ''))
const device = ref<DeviceDetail | null>(null)
const streams = ref<Stream[]>([])
const photos = ref<Photo[]>([])
const loading = ref(false)
const recordsLoading = ref(false)
const cameraEnum = ref<number | null>(null)
const commandRunning = ref(false)

const editVisible = ref(false)
const saving = ref(false)
const editForm = ref({ name: '', location: '', team_id: '', owner_id: '' })

/** Token returned by the last rotation; the service shows it exactly once. */
const issued = ref<DeviceToken | null>(null)

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

function statusTag(status: Stream['status']): 'success' | 'info' | 'danger' {
  if (status === 'active') {
    return 'success'
  }
  return status === 'failed' ? 'danger' : 'info'
}

function statusLabel(status: Stream['status']): string {
  if (status === 'active') {
    return '录制中'
  }
  return status === 'completed' ? '已完成' : '失败'
}

async function loadDevice(): Promise<void> {
  try {
    device.value = await getDevice(deviceId.value)
    if (cameraEnum.value === null && device.value.cameras.length > 0) {
      cameraEnum.value = device.value.cameras[0].camera_enum
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function loadRecords(): Promise<void> {
  recordsLoading.value = true
  try {
    const [streamRows, photoRows] = await Promise.all([
      listDeviceStreams(deviceId.value, 100),
      listDevicePhotos(deviceId.value, 100),
    ])
    streams.value = streamRows
    photos.value = photoRows
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    recordsLoading.value = false
  }
}

async function refresh(): Promise<void> {
  loading.value = true
  try {
    await loadDevice()
    await loadRecords()
  } finally {
    loading.value = false
  }
}

/** Runs one camera command, then reloads the records it may have created. */
async function runCommand(action: 'switch' | 'start' | 'stop' | 'photo'): Promise<void> {
  if (cameraEnum.value === null) {
    ElMessage.warning('请选择摄像头')
    return
  }
  commandRunning.value = true
  try {
    const camera = cameraEnum.value
    if (action === 'switch') {
      const accepted = await switchCamera(deviceId.value, camera)
      ElMessage.success(`切换指令已下发（command ${accepted.command_id}）`)
    } else if (action === 'start') {
      const stream = await startRecording(deviceId.value, camera)
      ElMessage.success(`已开始录制（stream ${stream.id}）`)
      await loadRecords()
    } else if (action === 'stop') {
      const stream = await stopRecording(deviceId.value, camera)
      ElMessage.success(`已停止录制（stream ${stream.id}）`)
      await loadRecords()
    } else {
      const accepted = await capturePhoto(deviceId.value, camera)
      ElMessage.success(`拍照指令已下发（request ${accepted.request_id}），稍后在照片列表查看`)
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    commandRunning.value = false
  }
}

function openEdit(): void {
  if (!device.value) {
    return
  }
  editForm.value = {
    name: device.value.name,
    location: device.value.location ?? '',
    team_id: device.value.team_id ?? '',
    owner_id: device.value.owner_id ?? '',
  }
  editVisible.value = true
}

async function submitEdit(): Promise<void> {
  const name = editForm.value.name.trim()
  if (!name) {
    ElMessage.warning('请填写设备名称')
    return
  }
  saving.value = true
  try {
    await updateDevice(deviceId.value, {
      name,
      location: editForm.value.location.trim(),
      ...(canAssignOwnership.value
        ? { team_id: editForm.value.team_id.trim(), owner_id: editForm.value.owner_id.trim() }
        : {}),
    })
    editVisible.value = false
    ElMessage.success('设备已更新')
    await loadDevice()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function onRotateToken(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '轮换后旧令牌立即失效，设备必须使用新令牌重新注册。',
      '轮换设备令牌',
      { type: 'warning', confirmButtonText: '轮换', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    issued.value = await rotateDeviceToken(deviceId.value)
    ElMessage.success('令牌已轮换，请立即保存')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onDelete(): Promise<void> {
  if (!device.value) {
    return
  }
  try {
    await ElMessageBox.confirm(
      `删除设备「${device.value.name}」会同时删除它的录制场次、分段与照片，且无法恢复。`,
      '删除设备',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteDevice(deviceId.value)
    ElMessage.success('设备已删除')
    await router.push('/webcam/devices')
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

watch(deviceId, () => {
  cameraEnum.value = null
  void refresh()
})

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <div class="toolbar-title">
        <el-button link @click="router.push('/webcam/devices')">← 设备列表</el-button>
        <span>{{ device?.name ?? deviceId }}</span>
        <el-tag v-if="device" size="small" :type="device.online ? 'success' : 'info'">
          {{ device.online ? '在线' : '离线' }}
        </el-tag>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button v-if="canManage" @click="openEdit">编辑</el-button>
        <el-button v-if="canManage" @click="onRotateToken">轮换令牌</el-button>
        <el-button v-if="canManage" type="danger" @click="onDelete">删除</el-button>
      </div>
    </div>

    <el-card shadow="never">
      <template #header>设备信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="设备 ID"><span class="mono">{{ deviceId }}</span></el-descriptions-item>
        <el-descriptions-item label="位置">{{ device?.location || '—' }}</el-descriptions-item>
        <el-descriptions-item label="团队 ID"><span class="mono">{{ device?.team_id || '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="所有者 ID"><span class="mono">{{ device?.owner_id || '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="最后注册">{{ formatTime(device?.last_seen) }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ formatTime(device?.created_at) }}</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <template #header>
        摄像头
        <span class="field-hint">设备注册后上报的能力</span>
      </template>
      <el-table :data="device?.cameras ?? []" border size="small">
        <el-table-column prop="camera_enum" label="摄像头编号" width="120" />
        <el-table-column prop="resolution" label="分辨率" width="140" />
        <el-table-column prop="fps" label="帧率" width="90" />
        <el-table-column label="支持的编码" min-width="180">
          <template #default="{ row }">{{ (row.supported_codec ?? []).join(' / ') || '—' }}</template>
        </el-table-column>
        <template #empty>
          <el-empty description="设备离线或尚未上报摄像头" />
        </template>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        控制
        <span class="field-hint">需要 cam:control 授权，且设备在线</span>
      </template>
      <div class="control-row">
        <el-select v-model="cameraEnum" class="camera-select" placeholder="选择摄像头" :disabled="!canControl">
          <el-option
            v-for="camera in device?.cameras ?? []"
            :key="camera.camera_enum"
            :value="camera.camera_enum"
            :label="`摄像头 ${camera.camera_enum}（${camera.resolution} @ ${camera.fps}fps）`"
          />
        </el-select>
        <el-button :disabled="!canControl || !device?.online" :loading="commandRunning" @click="runCommand('switch')">
          切换摄像头
        </el-button>
        <el-button
          type="primary"
          :disabled="!canControl || !device?.online"
          :loading="commandRunning"
          @click="runCommand('start')"
        >
          开始录制
        </el-button>
        <el-button
          type="warning"
          :disabled="!canControl || !device?.online"
          :loading="commandRunning"
          @click="runCommand('stop')"
        >
          停止录制
        </el-button>
        <el-button :disabled="!canControl || !device?.online" :loading="commandRunning" @click="runCommand('photo')">
          拍照
        </el-button>
      </div>
      <div v-if="!canControl" class="field-hint">当前账号没有 cam:control 授权，无法下发控制指令。</div>
      <div v-else-if="device && !device.online" class="field-hint">
        设备未建立 WebSocket 连接，控制指令会被拒绝（409）。
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        录制场次
        <span class="field-hint">最近 100 条</span>
      </template>
      <el-table v-loading="recordsLoading" :data="streams" border size="small">
        <el-table-column prop="id" label="场次 ID" min-width="240" show-overflow-tooltip />
        <el-table-column prop="camera_enum" label="摄像头" width="90" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="statusTag(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="开始" width="170">
          <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
        </el-table-column>
        <el-table-column label="结束" width="170">
          <template #default="{ row }">{{ formatTime(row.ended_at) }}</template>
        </el-table-column>
        <el-table-column label="参数" min-width="180">
          <template #default="{ row }">
            {{ row.metadata?.resolution || '—' }} · {{ row.metadata?.fps ? `${row.metadata.fps}fps` : '—' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/webcam/streams/${encodeURIComponent(row.id)}`)">
              分段
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无录制场次" />
        </template>
      </el-table>
    </el-card>

    <el-card shadow="never">
      <template #header>
        照片
        <span class="field-hint">最近 100 条</span>
      </template>
      <el-table v-loading="recordsLoading" :data="photos" border size="small">
        <el-table-column prop="id" label="照片 ID" min-width="240" show-overflow-tooltip />
        <el-table-column prop="camera_enum" label="摄像头" width="90" />
        <el-table-column prop="content_type" label="类型" width="130" />
        <el-table-column label="大小" width="110">
          <template #default="{ row }">{{ row.size_bytes }} B</template>
        </el-table-column>
        <el-table-column label="拍摄时间" width="170">
          <template #default="{ row }">{{ formatTime(row.taken_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="router.push(`/webcam/photos/${encodeURIComponent(row.id)}`)">
              查看
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无照片" />
        </template>
      </el-table>
    </el-card>

    <el-dialog v-model="editVisible" title="编辑设备" width="520px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="editForm.name" maxlength="120" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="editForm.location" maxlength="120" />
        </el-form-item>
        <template v-if="canAssignOwnership">
          <el-form-item label="团队 ID">
            <el-input v-model="editForm.team_id" />
          </el-form-item>
          <el-form-item label="所有者 ID">
            <el-input v-model="editForm.owner_id" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="editVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="!!issued" title="设备令牌（仅显示一次）" width="560px" @close="issued = null">
      <el-alert type="warning" :closable="false" show-icon title="请立即复制并妥善保存，关闭后无法再次查看。" />
      <div class="token-row">
        <el-input :model-value="issued?.token ?? ''" readonly class="token-input" />
        <el-button :icon="CopyDocument" @click="copyToken">复制</el-button>
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
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.camera-select {
  width: 300px;
}

.mono {
  font-family: monospace;
}

.field-hint {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.token-row {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.token-input :deep(input) {
  font-family: monospace;
}
</style>
