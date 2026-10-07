<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadFile, UploadInstance } from 'element-plus'
import { CopyDocument, Delete, Download, Link, Refresh, Upload } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { isApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { useCursorList } from '@/composables/useCursorList'
import {
  completeUpload,
  deleteObject,
  downloadObject,
  getBucket,
  initiateUpload,
  listObjects,
  mintPresign,
  sha256Hex,
  uploadObject,
  uploadPart,
} from '@/features/file/api'
import type { Bucket, FileObject, PresignedLink } from '@/features/file/api'

/** Files above this size go through the multipart endpoints instead of one PUT. */
const MULTIPART_THRESHOLD = 8 * 1024 * 1024
/** Part size used for multipart uploads; the service caps a part at 256 MiB. */
const PART_SIZE = 8 * 1024 * 1024

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canWrite = computed(() => auth.hasGrant('filehouse', 'write'))
const canDelete = computed(() => auth.hasGrant('filehouse', 'delete'))
const canShare = computed(() => auth.hasGrant('filehouse', 'share'))

const bucketName = computed(() => String(route.params.bucket ?? ''))
const bucket = ref<Bucket | null>(null)
const prefix = ref('')

const { items, loading, finished, loadMore, reload } = useCursorList<FileObject>((cursor, limit) =>
  listObjects(bucketName.value, { cursor, limit, prefix: prefix.value }),
)

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

function formatBytes(value: number): string {
  if (value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

async function loadBucket(): Promise<void> {
  try {
    bucket.value = await getBucket(bucketName.value)
  } catch (error) {
    ElMessage.error(errorMessage(error))
    // Only a bucket that really does not exist sends the operator back to the list;
    // a transient service failure keeps the page and its error visible.
    if (isApiError(error) && error.status === 404) {
      await router.push('/file/buckets')
    }
  }
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

// --- Download --------------------------------------------------------------

async function onDownload(row: FileObject): Promise<void> {
  try {
    const blob = await downloadObject(bucketName.value, row.key)
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = row.key.split('/').pop() || row.key
    anchor.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function onDeleteObject(row: FileObject): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除对象「${row.key}」吗？该操作不可恢复。`, '删除对象', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteObject(bucketName.value, row.key)
    ElMessage.success('对象已删除')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

// --- Upload ----------------------------------------------------------------

const uploadVisible = ref(false)
const uploadRef = ref<UploadInstance>()
const uploadFile = ref<File | null>(null)
const uploading = ref(false)
const uploadPercent = ref(0)
const uploadStage = ref('')

function openUpload(): void {
  uploadFile.value = null
  uploadPercent.value = 0
  uploadStage.value = ''
  uploadVisible.value = true
  uploadRef.value?.clearFiles()
}

function onUploadFileChange(file: UploadFile): void {
  uploadFile.value = file.raw ?? null
}

/** Multipart path: initiate, push every part with its sha256, then complete. */
async function uploadMultipart(file: File): Promise<void> {
  const init = await initiateUpload(
    bucketName.value,
    { key: file.name, size: file.size, content_type: file.type || 'application/octet-stream' },
    crypto.randomUUID(),
  )
  const parts: Array<{ part_no: number; sha256: string }> = []
  const total = Math.ceil(file.size / PART_SIZE)
  for (let index = 0; index < total; index += 1) {
    const chunk = file.slice(index * PART_SIZE, Math.min(file.size, (index + 1) * PART_SIZE))
    const partNo = index + 1
    uploadStage.value = `上传分片 ${partNo}/${total}`
    const uploaded = await uploadPart(bucketName.value, init.upload_id, partNo, chunk)
    parts.push({ part_no: uploaded.part_no, sha256: uploaded.sha256 })
    uploadPercent.value = Math.round((partNo / total) * 95)
  }
  uploadStage.value = '合并分片'
  await completeUpload(bucketName.value, init.upload_id, parts, crypto.randomUUID())
}

async function submitUpload(): Promise<void> {
  const file = uploadFile.value
  if (!file) {
    ElMessage.error('请选择文件')
    return
  }
  uploading.value = true
  uploadPercent.value = 0
  try {
    if (file.size > MULTIPART_THRESHOLD) {
      await uploadMultipart(file)
    } else {
      uploadStage.value = '直传对象'
      // The service verifies the SHA-256 it stores against the uploaded bytes.
      await sha256Hex(await file.arrayBuffer())
      await uploadObject(bucketName.value, file.name, file, file.type || 'application/octet-stream')
      uploadPercent.value = 100
    }
    ElMessage.success('上传完成')
    uploadVisible.value = false
    await Promise.all([reload(), loadBucket()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    uploading.value = false
    uploadStage.value = ''
  }
}

// --- Presign ---------------------------------------------------------------

const presignVisible = ref(false)
const presignForm = ref<{ key: string; method: 'GET' | 'HEAD' | 'PUT'; ttl_seconds: number }>({
  key: '',
  method: 'GET',
  ttl_seconds: 900,
})
const presignResult = ref<PresignedLink | null>(null)
const presignSubmitting = ref(false)

function openPresign(row?: FileObject): void {
  presignResult.value = null
  presignForm.value = { key: row?.key ?? '', method: 'GET', ttl_seconds: 900 }
  presignVisible.value = true
}

async function submitPresign(): Promise<void> {
  if (presignForm.value.key.trim() === '') {
    ElMessage.error('请输入对象键')
    return
  }
  presignSubmitting.value = true
  try {
    presignResult.value = await mintPresign(
      {
        bucket: bucketName.value,
        key: presignForm.value.key.trim(),
        method: presignForm.value.method,
        ttl_seconds: presignForm.value.ttl_seconds,
      },
      crypto.randomUUID(),
    )
    ElMessage.success('预签名链接已生成')
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    presignSubmitting.value = false
  }
}

watch(bucketName, () => {
  prefix.value = ''
  void loadBucket()
  void reload()
})

onMounted(() => {
  void loadBucket()
  void loadMore()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">
        <el-button link @click="router.push('/file/buckets')">← 桶列表</el-button>
        <span class="bucket-name">{{ bucketName }}</span>
        <el-tag v-if="bucket" size="small" type="info">
          {{ formatBytes(bucket.used_bytes) }} · {{ bucket.used_objects }} 个对象
        </el-tag>
      </div>
      <div class="toolbar-actions">
        <el-input v-model="prefix" class="prefix-input" placeholder="按 key 前缀过滤" clearable @change="reload" />
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button v-if="canShare" :icon="Link" @click="openPresign()">预签名链接</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Upload" @click="openUpload">上传对象</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column prop="key" label="对象键" min-width="280" show-overflow-tooltip />
      <el-table-column label="大小" width="110">
        <template #default="{ row }">{{ formatBytes(row.size) }}</template>
      </el-table-column>
      <el-table-column prop="content_type" label="类型" width="170" show-overflow-tooltip />
      <el-table-column label="ETag" width="150">
        <template #default="{ row }">
          <span class="mono">{{ String(row.etag).replace(/"/g, '').slice(0, 16) }}…</span>
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="230" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" :icon="Download" @click="onDownload(row)">下载</el-button>
          <el-button v-if="canShare" link type="primary" :icon="Link" @click="openPresign(row)">链接</el-button>
          <el-button v-if="canDelete" link type="danger" :icon="Delete" @click="onDeleteObject(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMore">加载更多</el-button>
      <span v-else class="footer-hint">已加载全部对象</span>
    </div>

    <el-dialog v-model="uploadVisible" title="上传对象" width="520px" :close-on-click-modal="false">
      <el-alert
        class="block"
        type="info"
        :closable="false"
        :title="`不超过 8 MiB 直传，更大的文件自动走分片上传（分片 ${formatBytes(PART_SIZE)}）；同名 key 会被覆盖。`"
      />
      <el-upload
        ref="uploadRef"
        :auto-upload="false"
        :limit="1"
        :show-file-list="true"
        :on-change="onUploadFileChange"
      >
        <el-button :icon="Upload">选择文件</el-button>
      </el-upload>
      <div v-if="uploading" class="upload-progress">
        <el-progress :percentage="uploadPercent" />
        <span class="field-hint">{{ uploadStage }}</span>
      </div>
      <template #footer>
        <el-button :disabled="uploading" @click="uploadVisible = false">取消</el-button>
        <el-button type="primary" :loading="uploading" @click="submitUpload">开始上传</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="presignVisible" title="预签名链接" width="620px" :close-on-click-modal="false">
      <el-alert
        class="block"
        type="info"
        :closable="false"
        title="兑换链接无需 Authorization；权限变更会让已签发的链接失效。PUT 链接用于免鉴权上传。"
      />
      <el-form label-width="110px">
        <el-form-item label="对象键">
          <el-input v-model="presignForm.key" placeholder="如：recordings/2026/lecture-01.mp4" />
        </el-form-item>
        <el-form-item label="方法">
          <el-radio-group v-model="presignForm.method">
            <el-radio value="GET">GET（下载）</el-radio>
            <el-radio value="HEAD">HEAD（元信息）</el-radio>
            <el-radio value="PUT">PUT（上传）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="有效期（秒）">
          <el-input-number v-model="presignForm.ttl_seconds" :min="60" :max="86400" :step="300" />
          <span class="field-hint">默认 900，上限 86400</span>
        </el-form-item>
      </el-form>
      <div v-if="presignResult" class="presign-result">
        <el-input :model-value="presignResult.url" readonly type="textarea" :rows="3" />
        <div class="presign-actions">
          <el-button :icon="CopyDocument" @click="copy(presignResult.url, '链接')">复制</el-button>
          <el-link type="primary" :href="presignResult.url" target="_blank">打开链接</el-link>
        </div>
      </div>
      <template #footer>
        <el-button @click="presignVisible = false">关闭</el-button>
        <el-button type="primary" :loading="presignSubmitting" @click="submitPresign">生成链接</el-button>
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
  flex-wrap: wrap;
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

.bucket-name {
  font-family: monospace;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.prefix-input {
  width: 220px;
}

.mono {
  font-family: monospace;
}

.table-footer {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.footer-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.block {
  margin-bottom: 12px;
}

.field-hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.upload-progress {
  margin-top: 12px;
}

.presign-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.presign-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
