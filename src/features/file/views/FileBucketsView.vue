<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Edit, Plus, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import { useCursorList } from '@/composables/useCursorList'
import { createBucket, deleteBucket, listBuckets, patchBucket } from '@/features/file/api'
import type { Bucket } from '@/features/file/api'

const auth = useAuthStore()
const canWrite = computed(() => auth.hasGrant('filehouse', 'write'))
const canDelete = computed(() => auth.hasGrant('filehouse', 'delete'))
/** Quota fields on PATCH are administrative. */
const canManage = computed(() => auth.hasGrant('filehouse', 'manage'))

const { items, loading, finished, loadMore, reload } = useCursorList<Bucket>((cursor, limit) =>
  listBuckets({ cursor, limit }),
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

/** 0 means unlimited on every quota field. */
function formatQuota(value: number, unit: 'bytes' | 'objects'): string {
  if (value === 0) {
    return '不限'
  }
  return unit === 'bytes' ? formatBytes(value) : `${value} 个`
}

// --- Create / edit ---------------------------------------------------------

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingName = ref('')
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ name: '', description: '', quota_bytes: 0, quota_objects: 0 })

const rules: FormRules = {
  name: [{ required: true, message: '请输入桶名', trigger: 'blur' }],
}

function openCreate(): void {
  dialogMode.value = 'create'
  editingName.value = ''
  form.value = { name: '', description: '', quota_bytes: 0, quota_objects: 0 }
  dialogVisible.value = true
}

function openEdit(row: Bucket): void {
  dialogMode.value = 'edit'
  editingName.value = row.name
  form.value = {
    name: row.name,
    description: row.description ?? '',
    quota_bytes: row.quota_bytes,
    quota_objects: row.quota_objects,
  }
  dialogVisible.value = true
}

async function submitForm(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  submitting.value = true
  try {
    if (dialogMode.value === 'create') {
      const payload = {
        name: form.value.name.trim(),
        description: form.value.description.trim(),
        ...(canManage.value ? { quota_bytes: form.value.quota_bytes, quota_objects: form.value.quota_objects } : {}),
      }
      await createBucket(payload, crypto.randomUUID())
      ElMessage.success('桶已创建')
    } else {
      await patchBucket(editingName.value, {
        description: form.value.description.trim(),
        ...(canManage.value ? { quota_bytes: form.value.quota_bytes, quota_objects: form.value.quota_objects } : {}),
      })
      ElMessage.success('桶已更新')
    }
    dialogVisible.value = false
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function onDelete(row: Bucket): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除桶「${row.name}」吗？只有空桶可以删除。`, '删除桶', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }
  try {
    await deleteBucket(row.name)
    ElMessage.success('桶已删除')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(() => {
  void loadMore()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">文件桶</div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button v-if="canWrite" type="primary" :icon="Plus" @click="openCreate">新建桶</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column label="名称" min-width="180">
        <template #default="{ row }">
          <el-link type="primary" :underline="false" :href="`/file/buckets/${encodeURIComponent(row.name)}`">
            {{ row.name }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="说明" min-width="200" show-overflow-tooltip />
      <el-table-column label="归属" width="150">
        <template #default="{ row }">
          <el-tag size="small" type="info">{{ row.owner_kind }}</el-tag>
          <span class="owner-id">{{ row.team_id || row.owner_id }}</span>
        </template>
      </el-table-column>
      <el-table-column label="用量 / 配额" min-width="220">
        <template #default="{ row }">
          {{ formatBytes(row.used_bytes) }} · {{ row.used_objects }} 个 /
          {{ formatQuota(row.quota_bytes, 'bytes') }} · {{ formatQuota(row.quota_objects, 'objects') }}
        </template>
      </el-table-column>
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="$router.push(`/file/buckets/${encodeURIComponent(row.name)}`)">
            对象
          </el-button>
          <el-button v-if="canWrite" link type="primary" :icon="Edit" @click="openEdit(row)">编辑</el-button>
          <el-button v-if="canDelete" link type="danger" :icon="Delete" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMore">加载更多</el-button>
      <span v-else class="footer-hint">已加载全部桶</span>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建桶' : `编辑桶 · ${editingName}`"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-alert
        v-if="!canManage"
        class="block"
        type="info"
        :closable="false"
        title="配额字段需要 filehouse:manage:any，当前账号只能修改说明。"
      />
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="桶名" prop="name">
          <el-input v-model="form.name" :disabled="dialogMode === 'edit'" placeholder="如：media-assets" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.description" type="textarea" :rows="2" placeholder="用途说明（可选）" />
        </el-form-item>
        <el-form-item label="容量配额">
          <el-input-number v-model="form.quota_bytes" :min="0" :step="1073741824" :disabled="!canManage" />
          <span class="field-hint">字节，0 = 不限</span>
        </el-form-item>
        <el-form-item label="对象数配额">
          <el-input-number v-model="form.quota_objects" :min="0" :step="1000" :disabled="!canManage" />
          <span class="field-hint">0 = 不限</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">保存</el-button>
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

.table-footer {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.footer-hint {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.owner-id {
  margin-left: 8px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.block {
  margin-bottom: 12px;
}

.field-hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
