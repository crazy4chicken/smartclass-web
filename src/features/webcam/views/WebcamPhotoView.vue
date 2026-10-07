<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Download, Link, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { getPhoto } from '@/features/webcam/api'
import type { PhotoDetail } from '@/features/webcam/api'

const route = useRoute()
const router = useRouter()

const photoId = computed(() => String(route.params.photoId ?? ''))
const photo = ref<PhotoDetail | null>(null)
const loading = ref(false)

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

async function refresh(): Promise<void> {
  loading.value = true
  try {
    photo.value = await getPhoto(photoId.value)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

async function copyLink(): Promise<void> {
  if (!photo.value?.download_url) {
    ElMessage.warning('该照片没有可用的下载链接（对象可能已被回收）')
    return
  }
  try {
    await navigator.clipboard.writeText(photo.value.download_url)
    ElMessage.success('下载链接已复制')
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <div class="toolbar-title">
        <el-button link @click="router.push(`/webcam/devices/${encodeURIComponent(photo?.device_id ?? '')}`)">
          ← 设备详情
        </el-button>
        <span>照片</span>
        <span class="mono">{{ photoId }}</span>
      </div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="refresh">刷新</el-button>
        <el-button :icon="Link" :disabled="!photo?.download_url" @click="copyLink">复制链接</el-button>
        <el-button
          type="primary"
          :icon="Download"
          :disabled="!photo?.download_url"
          tag="a"
          :href="photo?.download_url"
          target="_blank"
          rel="noopener"
        >
          下载
        </el-button>
      </div>
    </div>

    <el-card shadow="never">
      <template #header>照片信息</template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="设备 ID"><span class="mono">{{ photo?.device_id ?? '—' }}</span></el-descriptions-item>
        <el-descriptions-item label="摄像头编号">{{ photo?.camera_enum ?? '—' }}</el-descriptions-item>
        <el-descriptions-item label="类型">{{ photo?.content_type || '—' }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{ photo ? formatBytes(photo.size_bytes) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="拍摄时间">{{ formatTime(photo?.taken_at) }}</el-descriptions-item>
        <el-descriptions-item label="入库时间">{{ formatTime(photo?.created_at) }}</el-descriptions-item>
        <el-descriptions-item label="拍照请求 ID">
          <span class="mono">{{ photo?.request_id || '—' }}</span>
        </el-descriptions-item>
        <el-descriptions-item label="下载链接有效期">预签名链接，过期后重新打开本页即可刷新</el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card shadow="never">
      <template #header>预览</template>
      <div class="preview">
        <el-image
          v-if="photo?.download_url"
          :src="photo.download_url"
          fit="contain"
          class="preview-image"
          :preview-src-list="[photo.download_url]"
          preview-teleported
        />
        <el-empty v-else description="没有可用的预览链接（对象可能已被回收）" />
      </div>
    </el-card>
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

.mono {
  font-family: monospace;
}

.preview {
  display: flex;
  justify-content: center;
}

.preview-image {
  max-width: 100%;
  max-height: 60vh;
}
</style>
