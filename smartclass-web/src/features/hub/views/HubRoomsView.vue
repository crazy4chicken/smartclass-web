<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Camera, Plus, Refresh, Switch, VideoPause, VideoPlay } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import {
  bindRoom,
  captureRoomPhoto,
  getRoomLive,
  listRooms,
  startRoomRecording,
  stopRoomRecording,
  switchCamera,
  unbindRoom,
} from '@/features/hub/api'
import type { Room, RoomLive } from '@/features/hub/api'

const auth = useAuthStore()
const canManage = auth.hasGrant('dispatch', 'manage')
const canControl = auth.hasGrant('dispatch', 'control')

const rooms = ref<Room[]>([])
const loading = ref(false)

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

async function load(): Promise<void> {
  loading.value = true
  try {
    rooms.value = await listRooms()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

/** A fresh key per operator action: it only deduplicates retries of that same command. */
function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

// --- Bind dialog -----------------------------------------------------------

const bindVisible = ref(false)
const bindSubmitting = ref(false)
const bindEditing = ref(false)
const bindFormRef = ref<FormInstance>()
const bindForm = ref({ room_code: '', name: '', device_id: '', camera_enum: 0, enabled: true })

const bindRules: FormRules = {
  room_code: [{ required: true, message: '请输入教室编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入教室名称', trigger: 'blur' }],
  device_id: [{ required: true, message: '请输入 webcam-server 设备 ID', trigger: 'blur' }],
}

function openBindCreate(): void {
  bindEditing.value = false
  bindForm.value = { room_code: '', name: '', device_id: '', camera_enum: 0, enabled: true }
  bindVisible.value = true
}

function openBindEdit(row: Room): void {
  bindEditing.value = true
  bindForm.value = {
    room_code: row.room_code,
    name: row.name,
    device_id: row.device_id,
    camera_enum: row.camera_enum,
    enabled: row.enabled,
  }
  bindVisible.value = true
}

async function submitBind(): Promise<void> {
  if (!bindFormRef.value) {
    return
  }
  const valid = await bindFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  bindSubmitting.value = true
  try {
    await bindRoom(bindForm.value.room_code.trim(), {
      name: bindForm.value.name.trim(),
      device_id: bindForm.value.device_id.trim(),
      camera_enum: bindForm.value.camera_enum,
      enabled: bindForm.value.enabled,
    })
    ElMessage.success('教室绑定已保存')
    bindVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    bindSubmitting.value = false
  }
}

async function toggleEnabled(row: Room): Promise<void> {
  try {
    await bindRoom(row.room_code, {
      name: row.name,
      device_id: row.device_id,
      camera_enum: row.camera_enum,
      enabled: !row.enabled,
    })
    ElMessage.success(row.enabled ? '已停用，排课将跳过该教室' : '已启用')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onUnbind(row: Room): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定解绑教室「${row.room_code}」吗？有课表或场次历史时会被拒绝，可改为停用。`,
      '解绑教室',
      { type: 'warning', confirmButtonText: '解绑', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await unbindRoom(row.room_code)
    ElMessage.success('教室已解绑')
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

// --- Live panel ------------------------------------------------------------

const liveVisible = ref(false)
const liveLoading = ref(false)
const liveRoom = ref<Room | null>(null)
const live = ref<RoomLive | null>(null)
const controlBusy = ref('')

const liveCameras = computed(() => live.value?.cameras ?? [])

async function refreshLive(): Promise<void> {
  const room = liveRoom.value
  if (!room) {
    return
  }
  liveLoading.value = true
  try {
    live.value = await getRoomLive(room.room_code)
  } catch (error) {
    live.value = null
    ElMessage.error(errorMessage(error))
  } finally {
    liveLoading.value = false
  }
}

async function openLive(row: Room): Promise<void> {
  liveRoom.value = row
  live.value = null
  liveVisible.value = true
  await refreshLive()
}

async function onCameraSwitch(cameraEnum: number): Promise<void> {
  const room = liveRoom.value
  if (!room) {
    return
  }
  controlBusy.value = 'switch'
  try {
    const result = await switchCamera(room.room_code, cameraEnum, newIdempotencyKey())
    ElMessage.success(`已下发切换机位指令（命令 ${result.command_id}）`)
    await refreshLive()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    controlBusy.value = ''
  }
}

async function onStartRoom(): Promise<void> {
  const room = liveRoom.value
  if (!room) {
    return
  }
  controlBusy.value = 'start'
  try {
    const session = await startRoomRecording(room.room_code, newIdempotencyKey())
    ElMessage.success(`已开始临时录制（场次 ${session.id}）`)
    await refreshLive()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    controlBusy.value = ''
  }
}

async function onStopRoom(): Promise<void> {
  const room = liveRoom.value
  if (!room) {
    return
  }
  controlBusy.value = 'stop'
  try {
    const session = await stopRoomRecording(room.room_code, newIdempotencyKey())
    ElMessage.success(`已停止录制（场次 ${session.id}）`)
    await refreshLive()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    controlBusy.value = ''
  }
}

async function onCapture(): Promise<void> {
  const room = liveRoom.value
  if (!room) {
    return
  }
  controlBusy.value = 'photo'
  try {
    const result = await captureRoomPhoto(room.room_code, newIdempotencyKey())
    ElMessage.success(`抓拍已提交（照片 ${result.session_photo_id}，状态 ${result.status}）`)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    controlBusy.value = ''
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">教室与设备绑定</div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openBindCreate">绑定教室</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="rooms" border stripe>
      <el-table-column prop="room_code" label="教室编码" min-width="130" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column prop="device_id" label="设备 ID" min-width="240" show-overflow-tooltip />
      <el-table-column prop="camera_enum" label="默认机位" width="110" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="row.enabled ? 'success' : 'info'">{{ row.enabled ? '启用' : '停用' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openLive(row)">实时</el-button>
          <el-button v-if="canManage" link type="primary" @click="openBindEdit(row)">编辑</el-button>
          <el-button v-if="canManage" link type="warning" @click="toggleEnabled(row)">
            {{ row.enabled ? '停用' : '启用' }}
          </el-button>
          <el-button v-if="canManage" link type="danger" @click="onUnbind(row)">解绑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="bindVisible"
      :title="bindEditing ? `编辑绑定 · ${bindForm.room_code}` : '绑定教室'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        class="block"
        type="info"
        :closable="false"
        title="设备会在 webcam-server 上即时校验，其 team_id 与 owner_id 会被快照用于权限判定；停用可让教室退出排课但保留历史。"
      />
      <el-form ref="bindFormRef" :model="bindForm" :rules="bindRules" label-width="130px">
        <el-form-item label="教室编码" prop="room_code">
          <el-input v-model="bindForm.room_code" :disabled="bindEditing" placeholder="如：A301" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="bindForm.name" placeholder="如：教学楼 A / 301" />
        </el-form-item>
        <el-form-item label="设备 ID" prop="device_id">
          <el-input v-model="bindForm.device_id" placeholder="webcam-server 设备 ID" />
        </el-form-item>
        <el-form-item label="默认机位">
          <el-input-number v-model="bindForm.camera_enum" :min="0" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="bindForm.enabled" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindVisible = false">取消</el-button>
        <el-button type="primary" :loading="bindSubmitting" @click="submitBind">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="liveVisible" :title="`实时状态 · ${liveRoom?.room_code ?? ''}`" size="560px">
      <div v-loading="liveLoading" class="live-body">
        <div class="live-row">
          <span class="live-label">设备在线</span>
          <el-tag v-if="live" :type="live.online ? 'success' : 'danger'">{{ live.online ? '在线' : '离线' }}</el-tag>
          <span v-else class="live-muted">未知</span>
          <el-button class="live-refresh" link type="primary" @click="refreshLive">刷新</el-button>
        </div>

        <el-descriptions v-if="live?.active_session" :column="1" border class="live-block">
          <el-descriptions-item label="进行中的场次">{{ live.active_session.id }}</el-descriptions-item>
          <el-descriptions-item label="流 ID">{{ live.active_session.stream_id }}</el-descriptions-item>
          <el-descriptions-item label="开始时间">{{ formatTime(live.active_session.started_at) }}</el-descriptions-item>
        </el-descriptions>
        <el-alert v-else-if="live" class="live-block" type="info" :closable="false" title="当前没有进行中的录制" />

        <el-table v-if="live" :data="liveCameras" border size="small" class="live-block">
          <el-table-column prop="camera_enum" label="机位" width="80" />
          <el-table-column prop="resolution" label="分辨率" width="130" />
          <el-table-column prop="fps" label="帧率" width="90" />
          <el-table-column label="编码">
            <template #default="{ row }">{{ row.supported_codec.join('、') }}</template>
          </el-table-column>
          <el-table-column label="" width="90">
            <template #default="{ row }">
              <el-button
                v-if="canControl"
                link
                type="primary"
                :icon="Switch"
                :loading="controlBusy === 'switch'"
                @click="onCameraSwitch(row.camera_enum)"
              >
                切换
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div v-if="canControl" class="live-actions">
          <el-button type="danger" :icon="VideoPlay" :loading="controlBusy === 'start'" @click="onStartRoom">
            开始临时录制
          </el-button>
          <el-button type="warning" :icon="VideoPause" :loading="controlBusy === 'stop'" @click="onStopRoom">
            停止录制
          </el-button>
          <el-button :icon="Camera" :loading="controlBusy === 'photo'" @click="onCapture">抓拍</el-button>
        </div>
        <el-alert
          v-else
          class="live-block"
          type="info"
          :closable="false"
          title="当前账号没有 dispatch:control 授权，无法下发录制控制指令。"
        />
      </div>
    </el-drawer>
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

.block {
  margin-bottom: 12px;
}

.live-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.live-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-label {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.live-refresh {
  margin-left: auto;
}

.live-block {
  margin: 0;
}

.live-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
