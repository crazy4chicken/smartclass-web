<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Download, Link, Plus, Refresh } from '@element-plus/icons-vue'

import IamObjectSelect from '@/components/IamObjectSelect.vue'
import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import {
  capturePhoto,
  createDevice,
  deleteDevice,
  fetchLiveness,
  fetchReadiness,
  getDevice,
  getPhoto,
  getStream,
  listDevicePhotos,
  listDeviceStreams,
  listDevices,
  rotateDeviceToken,
  startRecording,
  stopRecording,
  switchCamera,
  updateDevice,
} from '@/features/webcam/api'
import type {
  Device,
  DeviceDetail,
  DeviceToken,
  Photo,
  PhotoDetail,
  Stream,
  StreamDetail,
} from '@/features/webcam/api'

/**
 * The device page of the 录播调度 console. It manages smartclass-webcam-server devices -
 * registration, control and the media they produced - and is therefore gated by the
 * service's own `cam:*` keys rather than the console's `dispatch:*` ones. Everything a
 * device owns stays on this page: the drawer holds its overview, control panel, streams
 * and photos, and the segments and photo preview open from there.
 */
const auth = useAuthStore()

const canManage = computed(() => auth.hasGrant('cam', 'manage'))
const canControl = computed(() => auth.hasGrant('cam', 'control'))
/** Ownership may only be assigned by a caller whose manage grant reaches every scope. */
const canAssignOwnership = computed(() => auth.coversGrant('cam', 'manage', 'any'))

const devices = ref<Device[]>([])
const loading = ref(false)
const limit = ref(100)

/** webcam-server probes, shown as a status strip so a broken dependency is visible here. */
const liveness = ref<string | null>(null)
const readiness = ref<string | null>(null)
const livenessError = ref('')
const readinessError = ref('')

function formatTime(value?: string | null): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

function formatDuration(ms?: number): string {
  if (!ms || ms <= 0) {
    return '—'
  }
  const seconds = ms / 1000
  return seconds < 60 ? `${seconds.toFixed(1)} 秒` : `${(seconds / 60).toFixed(1)} 分钟`
}

function statusLabel(status: Stream['status']): string {
  if (status === 'active') {
    return '录制中'
  }
  return status === 'completed' ? '已完成' : '失败'
}

async function probe(): Promise<void> {
  livenessError.value = ''
  readinessError.value = ''
  try {
    liveness.value = (await fetchLiveness()).status
  } catch (error) {
    liveness.value = null
    livenessError.value = errorMessage(error)
  }
  try {
    readiness.value = (await fetchReadiness()).status
  } catch (error) {
    readiness.value = null
    readinessError.value = errorMessage(error)
  }
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
  await probe()
}

// --- Create -----------------------------------------------------------------

const createVisible = ref(false)
const creating = ref(false)
const createForm = ref({ name: '', location: '', team_id: '', owner_id: '' })

/** Token of the last registration or rotation; the service returns it exactly once. */
const issued = ref<DeviceToken | null>(null)

function openCreate(): void {
  createForm.value = { name: '', location: '', team_id: '', owner_id: '' }
  createVisible.value = true
}

async function submitCreate(): Promise<void> {
  const name = createForm.value.name.trim()
  if (!name) {
    ElMessage.warning('请填写设备名称')
    return
  }
  creating.value = true
  try {
    issued.value = await createDevice({
      name,
      location: createForm.value.location.trim() || undefined,
      ...(canAssignOwnership.value
        ? {
            team_id: createForm.value.team_id.trim() || undefined,
            owner_id: createForm.value.owner_id.trim() || undefined,
          }
        : {}),
    })
    createVisible.value = false
    ElMessage.success('设备已创建，请立即保存设备令牌')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    creating.value = false
  }
}

async function copyText(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
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
    if (selected.value?.id === row.id) {
      drawerVisible.value = false
    }
    ElMessage.success('设备已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

// --- Drawer (one device, four tabs) -----------------------------------------

const drawerVisible = ref(false)
const selected = ref<DeviceDetail | null>(null)
const detailLoading = ref(false)
const activeTab = ref('overview')
const streams = ref<Stream[]>([])
const photos = ref<Photo[]>([])
const recordsLoading = ref(false)
const cameraEnum = ref<number | null>(null)
const commandRunning = ref(false)

/**
 * Parameters of the next camera switch and recording start. A device captures from one
 * camera at one resolution and frame rate at a time, so these must be values the selected
 * camera declared during registration; an empty resolution/fps keeps the current one, and
 * an empty codec records with the device's preferred one.
 */
const switchResolution = ref('')
const switchFps = ref<number | null>(null)
const recordCodec = ref('')

/** The capability row of the selected camera, or undefined while none is selected. */
const activeCamera = computed(() =>
  (selected.value?.cameras ?? []).find((camera) => camera.camera_enum === cameraEnum.value),
)

watch(cameraEnum, () => {
  // The lists below belong to one camera, so a selection that the new camera does not
  // declare would be rejected; reset to its current parameters instead.
  switchResolution.value = activeCamera.value?.resolution ?? ''
  switchFps.value = activeCamera.value?.fps ?? null
  recordCodec.value = ''
})

const editForm = ref({ name: '', location: '', team_id: '', owner_id: '' })
const saving = ref(false)

async function openDevice(row: Device, tab: string): Promise<void> {
  activeTab.value = tab
  drawerVisible.value = true
  selected.value = null
  streams.value = []
  photos.value = []
  cameraEnum.value = null
  await loadDetail(row.id)
}

async function loadDetail(deviceId: string): Promise<void> {
  detailLoading.value = true
  try {
    const detail = await getDevice(deviceId)
    selected.value = detail
    editForm.value = {
      name: detail.name,
      location: detail.location ?? '',
      team_id: detail.team_id ?? '',
      owner_id: detail.owner_id ?? '',
    }
    if (cameraEnum.value === null && detail.cameras.length > 0) {
      cameraEnum.value = detail.cameras[0].camera_enum
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    detailLoading.value = false
  }
}

async function loadRecords(): Promise<void> {
  if (!selected.value) {
    return
  }
  recordsLoading.value = true
  try {
    const [streamRows, photoRows] = await Promise.all([
      listDeviceStreams(selected.value.id, 100),
      listDevicePhotos(selected.value.id, 100),
    ])
    streams.value = streamRows
    photos.value = photoRows
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    recordsLoading.value = false
  }
}

function onTabChange(tab: string | number): void {
  if ((tab === 'streams' || tab === 'photos') && streams.value.length === 0 && photos.value.length === 0) {
    void loadRecords()
  }
}

async function submitEdit(): Promise<void> {
  if (!selected.value) {
    return
  }
  const name = editForm.value.name.trim()
  if (!name) {
    ElMessage.warning('请填写设备名称')
    return
  }
  saving.value = true
  try {
    await updateDevice(selected.value.id, {
      name,
      location: editForm.value.location.trim(),
      ...(canAssignOwnership.value
        ? { team_id: editForm.value.team_id.trim(), owner_id: editForm.value.owner_id.trim() }
        : {}),
    })
    ElMessage.success('设备已更新')
    await Promise.all([loadDetail(selected.value.id), refresh()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function onRotateToken(): Promise<void> {
  if (!selected.value) {
    return
  }
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
    issued.value = await rotateDeviceToken(selected.value.id)
    ElMessage.success('令牌已轮换，请立即保存')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

/** Runs one camera command, then reloads the records it may have created. */
async function runCommand(action: 'switch' | 'start' | 'stop' | 'photo'): Promise<void> {
  if (!selected.value) {
    return
  }
  if (cameraEnum.value === null) {
    ElMessage.warning('请选择摄像头')
    return
  }
  commandRunning.value = true
  try {
    const deviceId = selected.value.id
    const camera = cameraEnum.value
    if (action === 'switch') {
      // Absent parameters keep the camera where it is, so send only what was chosen.
      const resolution = switchResolution.value.trim()
      const accepted = await switchCamera(deviceId, {
        camera_enum: camera,
        ...(resolution ? { resolution } : {}),
        ...(switchFps.value !== null ? { fps: switchFps.value } : {}),
      })
      ElMessage.success(`切换指令已下发（command ${accepted.command_id}）`)
      await loadDetail(deviceId)
    } else if (action === 'start') {
      const codec = recordCodec.value.trim()
      const stream = await startRecording(deviceId, {
        camera_enum: camera,
        ...(codec ? { codec } : {}),
      })
      ElMessage.success(`已开始录制（stream ${stream.id}）`)
      await loadRecords()
    } else if (action === 'stop') {
      const stream = await stopRecording(deviceId, camera)
      ElMessage.success(`已停止录制（stream ${stream.id}）`)
      await loadRecords()
    } else {
      const accepted = await capturePhoto(deviceId, camera)
      ElMessage.success(`拍照指令已下发（request ${accepted.request_id}），稍后在照片标签页查看`)
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    commandRunning.value = false
  }
}

// --- Segments and photo preview ---------------------------------------------

const segmentVisible = ref(false)
const segmentLoading = ref(false)
const streamDetail = ref<StreamDetail | null>(null)

async function openSegments(row: Stream): Promise<void> {
  segmentVisible.value = true
  segmentLoading.value = true
  streamDetail.value = null
  try {
    streamDetail.value = await getStream(row.id, 500)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    segmentLoading.value = false
  }
}

const photoVisible = ref(false)
const photoLoading = ref(false)
const photoDetail = ref<PhotoDetail | null>(null)

async function openPhoto(row: Photo): Promise<void> {
  photoVisible.value = true
  photoLoading.value = true
  photoDetail.value = null
  try {
    photoDetail.value = await getPhoto(row.id)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    photoLoading.value = false
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">
        设备
        <el-tag v-if="liveness" size="small" type="success">webcam-server {{ liveness }}</el-tag>
        <el-tag v-else size="small" type="danger">webcam-server 不可用：{{ livenessError }}</el-tag>
        <el-tag v-if="readiness" size="small" :type="readiness === 'ready' ? 'success' : 'warning'">
          就绪 {{ readiness }}
        </el-tag>
        <el-tag v-else-if="readinessError" size="small" type="warning">未就绪：{{ readinessError }}</el-tag>
      </div>
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
      <el-table-column prop="location" label="位置" min-width="140" show-overflow-tooltip />
      <el-table-column label="连接" width="100">
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
      <el-table-column label="操作" width="300" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openDevice(row, 'overview')">详情</el-button>
          <el-button link type="primary" @click="openDevice(row, 'control')">控制</el-button>
          <el-button link type="primary" @click="openDevice(row, 'streams')">场次</el-button>
          <el-button link type="primary" @click="openDevice(row, 'photos')">照片</el-button>
          <el-button v-if="canManage" link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty description="没有可见的设备" />
      </template>
    </el-table>

    <el-drawer v-model="drawerVisible" :title="selected?.name ?? '设备'" size="62%">
      <div v-loading="detailLoading" class="drawer-body">
        <el-tabs v-model="activeTab" @tab-change="onTabChange">
          <el-tab-pane label="概览" name="overview">
            <el-descriptions :column="2" border>
              <el-descriptions-item label="设备 ID">
                <span class="mono">{{ selected?.id ?? '—' }}</span>
              </el-descriptions-item>
              <el-descriptions-item label="连接状态">
                <el-tag size="small" :type="selected?.online ? 'success' : 'info'">
                  {{ selected?.online ? '在线' : '离线' }}
                </el-tag>
              </el-descriptions-item>
              <el-descriptions-item label="位置">{{ selected?.location || '—' }}</el-descriptions-item>
              <el-descriptions-item label="最后注册">{{ formatTime(selected?.last_seen) }}</el-descriptions-item>
              <el-descriptions-item label="团队 ID"><span class="mono">{{ selected?.team_id || '—' }}</span></el-descriptions-item>
              <el-descriptions-item label="所有者 ID"><span class="mono">{{ selected?.owner_id || '—' }}</span></el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ formatTime(selected?.created_at) }}</el-descriptions-item>
              <el-descriptions-item label="更新时间">{{ formatTime(selected?.updated_at) }}</el-descriptions-item>
            </el-descriptions>

            <el-table :data="selected?.cameras ?? []" border size="small" class="block">
              <el-table-column prop="camera_enum" label="摄像头编号" width="110" />
              <el-table-column label="当前参数" width="150">
                <template #default="{ row }">{{ row.resolution }} @ {{ row.fps }}fps</template>
              </el-table-column>
              <el-table-column label="可选分辨率" min-width="180">
                <template #default="{ row }">{{ (row.supported_resolutions ?? []).join(' / ') || '—' }}</template>
              </el-table-column>
              <el-table-column label="可选帧率" min-width="140">
                <template #default="{ row }">{{ (row.supported_framerates ?? []).join(' / ') || '—' }}</template>
              </el-table-column>
              <el-table-column label="支持的编码" min-width="160">
                <template #default="{ row }">{{ (row.supported_codec ?? []).join(' / ') || '—' }}</template>
              </el-table-column>
              <template #empty>
                <el-empty description="设备离线或尚未上报摄像头" />
              </template>
            </el-table>

            <template v-if="canManage">
              <el-divider content-position="left">编辑</el-divider>
              <el-form label-width="90px">
                <el-form-item label="名称" required>
                  <el-input v-model="editForm.name" maxlength="120" />
                </el-form-item>
                <el-form-item label="位置">
                  <el-input v-model="editForm.location" maxlength="120" />
                </el-form-item>
                <template v-if="canAssignOwnership">
                  <el-form-item label="团队">
                    <IamObjectSelect v-model="editForm.team_id" :kinds="['team']" placeholder="留空则保持当前归属" />
                  </el-form-item>
                  <el-form-item label="所有者">
                    <IamObjectSelect v-model="editForm.owner_id" :kinds="['user']" placeholder="留空则保持当前归属" />
                  </el-form-item>
                </template>
              </el-form>
              <div class="drawer-actions">
                <el-button type="primary" :loading="saving" @click="submitEdit">保存</el-button>
                <el-button @click="onRotateToken">轮换设备令牌</el-button>
              </div>
            </template>
          </el-tab-pane>

          <el-tab-pane label="控制" name="control">
            <div class="control-row">
              <el-select v-model="cameraEnum" class="camera-select" placeholder="选择摄像头" :disabled="!canControl">
                <el-option
                  v-for="camera in selected?.cameras ?? []"
                  :key="camera.camera_enum"
                  :value="camera.camera_enum"
                  :label="`摄像头 ${camera.camera_enum}（${camera.resolution} @ ${camera.fps}fps）`"
                />
              </el-select>
              <el-button :disabled="!canControl || !selected?.online" :loading="commandRunning" @click="runCommand('switch')">
                切换摄像头
              </el-button>
              <el-button
                type="primary"
                :disabled="!canControl || !selected?.online"
                :loading="commandRunning"
                @click="runCommand('start')"
              >
                开始录制
              </el-button>
              <el-button
                type="warning"
                :disabled="!canControl || !selected?.online"
                :loading="commandRunning"
                @click="runCommand('stop')"
              >
                停止录制
              </el-button>
              <el-button :disabled="!canControl || !selected?.online" :loading="commandRunning" @click="runCommand('photo')">
                拍照
              </el-button>
            </div>

            <!-- A switch may move the camera to another resolution or frame rate and a
                 recording may pick a codec, but only from what the camera declared. -->
            <el-form v-if="activeCamera" label-width="90px" class="param-form">
              <el-form-item label="切换分辨率">
                <el-select v-model="switchResolution" class="param-select" placeholder="保持当前分辨率" :disabled="!canControl">
                  <el-option
                    v-for="resolution in activeCamera.supported_resolutions"
                    :key="resolution"
                    :value="resolution"
                    :label="resolution"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="切换帧率">
                <el-select v-model="switchFps" class="param-select" placeholder="保持当前帧率" :disabled="!canControl">
                  <el-option
                    v-for="rate in activeCamera.supported_framerates"
                    :key="rate"
                    :value="rate"
                    :label="`${rate} fps`"
                  />
                </el-select>
              </el-form-item>
              <el-form-item label="录制编码">
                <el-select v-model="recordCodec" class="param-select" placeholder="设备首选编码" :disabled="!canControl">
                  <el-option
                    v-for="codec in activeCamera.supported_codec"
                    :key="codec"
                    :value="codec"
                    :label="codec"
                  />
                </el-select>
              </el-form-item>
            </el-form>
            <div v-else class="field-hint">设备离线或尚未上报摄像头，无法选择分辨率、帧率与编码。</div>

            <div v-if="!canControl" class="field-hint">当前账号没有 cam:control 授权，无法下发控制指令。</div>
            <div v-else-if="selected && !selected.online" class="field-hint">
              设备未建立 WebSocket 连接，控制指令会被拒绝（409）。
            </div>
          </el-tab-pane>

          <el-tab-pane label="场次" name="streams">
            <el-table v-loading="recordsLoading" :data="streams" border size="small">
              <el-table-column prop="id" label="场次 ID" min-width="240" show-overflow-tooltip />
              <el-table-column prop="camera_enum" label="摄像头" width="90" />
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.status === 'active' ? 'success' : row.status === 'failed' ? 'danger' : 'info'">
                    {{ statusLabel(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="开始" width="170">
                <template #default="{ row }">{{ formatTime(row.started_at) }}</template>
              </el-table-column>
              <el-table-column label="结束" width="170">
                <template #default="{ row }">{{ formatTime(row.ended_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openSegments(row)">分段</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无录制场次" />
              </template>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="照片" name="photos">
            <el-table v-loading="recordsLoading" :data="photos" border size="small">
              <el-table-column prop="id" label="照片 ID" min-width="240" show-overflow-tooltip />
              <el-table-column prop="camera_enum" label="摄像头" width="90" />
              <el-table-column prop="content_type" label="类型" width="130" />
              <el-table-column label="大小" width="110">
                <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
              </el-table-column>
              <el-table-column label="拍摄时间" width="170">
                <template #default="{ row }">{{ formatTime(row.taken_at) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="100" fixed="right">
                <template #default="{ row }">
                  <el-button link type="primary" @click="openPhoto(row)">查看</el-button>
                </template>
              </el-table-column>
              <template #empty>
                <el-empty description="暂无照片" />
              </template>
            </el-table>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <el-dialog v-model="createVisible" title="新建设备" width="520px">
      <el-form label-width="90px">
        <el-form-item label="名称" required>
          <el-input v-model="createForm.name" placeholder="例如：高一(3)班 教室" maxlength="120" />
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="createForm.location" placeholder="例如：教学楼 A-301" maxlength="120" />
        </el-form-item>
        <template v-if="canAssignOwnership">
          <el-form-item label="团队">
            <IamObjectSelect v-model="createForm.team_id" :kinds="['team']" placeholder="留空则归属当前账号" />
          </el-form-item>
          <el-form-item label="所有者">
            <IamObjectSelect v-model="createForm.owner_id" :kinds="['user']" placeholder="留空则归属当前账号" />
          </el-form-item>
        </template>
      </el-form>
      <div class="field-hint">
        设备令牌只会在创建后显示一次；设备端用它完成注册并建立 WebSocket 连接。
      </div>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog :model-value="!!issued" title="设备令牌（仅显示一次）" width="560px" @close="issued = null">
      <el-alert type="warning" :closable="false" show-icon title="请立即复制并妥善保存，关闭后无法再次查看。" />
      <div class="token-row">
        <el-input :model-value="issued?.token ?? ''" readonly class="token-input" />
        <el-button :icon="CopyDocument" @click="issued && copyText(issued.token, '设备令牌')">复制</el-button>
      </div>
      <div class="field-hint">设备 ID：<span class="mono">{{ issued?.device.id }}</span></div>
      <template #footer>
        <el-button type="primary" @click="issued = null">我已保存</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="segmentVisible" title="录制分段" width="820px">
      <div v-loading="segmentLoading">
        <el-descriptions v-if="streamDetail" :column="2" border size="small">
          <el-descriptions-item label="场次 ID"><span class="mono">{{ streamDetail.id }}</span></el-descriptions-item>
          <el-descriptions-item label="状态">{{ statusLabel(streamDetail.status) }}</el-descriptions-item>
          <el-descriptions-item label="开始">{{ formatTime(streamDetail.started_at) }}</el-descriptions-item>
          <el-descriptions-item label="结束">{{ formatTime(streamDetail.ended_at) }}</el-descriptions-item>
          <el-descriptions-item label="分辨率">{{ streamDetail.metadata?.resolution || '—' }}</el-descriptions-item>
          <el-descriptions-item label="帧率">
            {{ streamDetail.metadata?.fps ? `${streamDetail.metadata.fps} fps` : '—' }}
          </el-descriptions-item>
        </el-descriptions>
        <el-table :data="streamDetail?.segments ?? []" border size="small" class="block">
          <el-table-column prop="segment_seq" label="序号" width="80" />
          <el-table-column prop="id" label="分段 ID" min-width="220" show-overflow-tooltip />
          <el-table-column label="大小" width="110">
            <template #default="{ row }">{{ formatBytes(row.size_bytes) }}</template>
          </el-table-column>
          <el-table-column label="时长" width="110">
            <template #default="{ row }">{{ formatDuration(row.duration_ms) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="170" fixed="right">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :icon="Download"
                :disabled="!row.download_url"
                tag="a"
                :href="row.download_url"
                target="_blank"
                rel="noopener"
              >
                下载
              </el-button>
              <el-button
                link
                type="primary"
                :icon="Link"
                @click="row.download_url ? copyText(row.download_url, '下载链接') : ElMessage.warning('该分段没有可用的下载链接')"
              >
                复制链接
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty description="该场次还没有分段" />
          </template>
        </el-table>
      </div>
    </el-dialog>

    <el-dialog v-model="photoVisible" title="照片" width="720px">
      <div v-loading="photoLoading">
        <el-descriptions v-if="photoDetail" :column="2" border size="small">
          <el-descriptions-item label="照片 ID"><span class="mono">{{ photoDetail.id }}</span></el-descriptions-item>
          <el-descriptions-item label="摄像头编号">{{ photoDetail.camera_enum }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{ photoDetail.content_type }}</el-descriptions-item>
          <el-descriptions-item label="大小">{{ formatBytes(photoDetail.size_bytes) }}</el-descriptions-item>
          <el-descriptions-item label="拍摄时间">{{ formatTime(photoDetail.taken_at) }}</el-descriptions-item>
          <el-descriptions-item label="拍照请求 ID">
            <span class="mono">{{ photoDetail.request_id || '—' }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <div class="preview">
          <el-image
            v-if="photoDetail?.download_url"
            :src="photoDetail.download_url"
            fit="contain"
            class="preview-image"
            :preview-src-list="[photoDetail.download_url]"
            preview-teleported
          />
          <el-empty v-else description="没有可用的预览链接（对象可能已被回收）" />
        </div>
      </div>
      <template #footer>
        <el-button
          v-if="photoDetail?.download_url"
          :icon="Link"
          @click="copyText(photoDetail.download_url, '下载链接')"
        >
          复制链接
        </el-button>
        <el-button
          v-if="photoDetail?.download_url"
          type="primary"
          :icon="Download"
          tag="a"
          :href="photoDetail.download_url"
          target="_blank"
          rel="noopener"
        >
          下载
        </el-button>
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

.limit-select {
  width: 110px;
}

.mono {
  font-family: monospace;
}

.drawer-body {
  min-height: 200px;
}

.drawer-actions {
  display: flex;
  gap: 8px;
}

.block {
  margin-top: 12px;
}

.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.camera-select {
  width: 300px;
}

.param-form {
  margin-top: 12px;
  max-width: 420px;
}

.param-select {
  width: 100%;
}

.field-hint {
  margin-top: 12px;
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

.preview {
  display: flex;
  justify-content: center;
  margin-top: 12px;
}

.preview-image {
  max-width: 100%;
  max-height: 55vh;
}
</style>
