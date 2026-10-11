<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Edit, Refresh } from '@element-plus/icons-vue'

import IamObjectSelect from '@/components/IamObjectSelect.vue'
import { toIamObjectKind } from '@/composables/useIamObjects'
import type { IamObjectKind } from '@/composables/useIamObjects'
import { errorMessage } from '@/utils/error'
import { useAuthStore } from '@/stores/auth'
import { useCursorList } from '@/composables/useCursorList'
import { fetchAdminStats, listQuotas, runGc, upsertQuota } from '@/features/file/api'
import type { AdminStats, GcResult, QuotaOverride } from '@/features/file/api'

const auth = useAuthStore()
/** A quota override targets a user or a team; the service stores the pair as the subject. */
const QUOTA_SUBJECT_KINDS: readonly IamObjectKind[] = ['user', 'team']

/** The admin plane (`/api/v1/admin/*`, quota overrides) is `filehouse:manage:any` only. */
const canManage = computed(() => auth.coversGrant('filehouse', 'manage', 'any'))

const stats = ref<AdminStats | null>(null)
const statsLoading = ref(false)
const gcRunning = ref(false)
const gcResult = ref<GcResult | null>(null)

const { items: quotas, loading: quotasLoading, finished, loadMore, reload } = useCursorList<QuotaOverride>(
  (cursor, limit) => listQuotas({ cursor, limit }),
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

async function loadStats(): Promise<void> {
  statsLoading.value = true
  try {
    stats.value = await fetchAdminStats()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    statsLoading.value = false
  }
}

// --- Quota override dialog -------------------------------------------------

const quotaVisible = ref(false)
const quotaSubmitting = ref(false)
const quotaFormRef = ref<FormInstance>()
const quotaForm = ref({ kind: 'user' as IamObjectKind, id: '', max_bytes: 0, max_objects: 0 })

const quotaRules: FormRules = {
  id: { required: true, message: '请输入主体 ID', trigger: 'blur' },
}

/** filehouse stores a capacity quota in bytes; the console edits it in MiB. */
const BYTES_PER_MB = 1024 * 1024

/**
 * The capacity cap as the operator types it, in MiB with two decimals. Reading converts the
 * stored bytes and writing converts back to whole bytes, so any MiB value the operator types
 * survives the round trip, and a cap that is never touched keeps the exact byte count it was
 * loaded with.
 */
const maxMb = computed({
  get: () => Math.round((quotaForm.value.max_bytes / BYTES_PER_MB) * 100) / 100,
  set: (value: number) => {
    quotaForm.value.max_bytes = Math.round(value * BYTES_PER_MB)
  },
})

function openQuota(row?: QuotaOverride): void {
  quotaForm.value = row
    ? {
        kind: toIamObjectKind(row.subject_kind),
        id: row.subject_id,
        max_bytes: row.max_bytes,
        max_objects: row.max_objects,
      }
    : { kind: 'user', id: '', max_bytes: 0, max_objects: 0 }
  quotaVisible.value = true
}

async function submitQuota(): Promise<void> {
  if (!quotaFormRef.value) {
    return
  }
  const valid = await quotaFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  quotaSubmitting.value = true
  try {
    await upsertQuota(quotaForm.value.kind, quotaForm.value.id.trim(), {
      max_bytes: quotaForm.value.max_bytes,
      max_objects: quotaForm.value.max_objects,
    })
    ElMessage.success('配额已保存')
    quotaVisible.value = false
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    quotaSubmitting.value = false
  }
}

async function onRunGc(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '垃圾回收会删除零引用的 blob、孤儿文件与过期上传，过程不可中断，确定继续吗？',
      '执行垃圾回收',
      { type: 'warning', confirmButtonText: '执行', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  gcRunning.value = true
  gcResult.value = null
  try {
    gcResult.value = await runGc(crypto.randomUUID())
    ElMessage.success('垃圾回收完成')
    await Promise.all([loadStats(), reload()])
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    gcRunning.value = false
  }
}

onMounted(() => {
  if (canManage) {
    void loadStats()
    void loadMore()
  }
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">平台管理</div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="statsLoading" @click="loadStats">刷新统计</el-button>
        <el-button type="danger" :icon="Delete" :loading="gcRunning" @click="onRunGc">执行垃圾回收</el-button>
      </div>
    </div>

    <el-alert
      v-if="!canManage"
      class="block"
      type="warning"
      :closable="false"
      title="该页面需要 filehouse:manage:any（平台级），当前账号没有此授权。"
    />

    <template v-else>
      <div class="cards">
        <el-card shadow="never">
          <template #header>桶 / 对象</template>
          <div class="metric">{{ stats?.buckets ?? '—' }} / {{ stats?.objects ?? '—' }}</div>
          <div class="metric-hint">逻辑容量 {{ stats ? formatBytes(stats.logical_bytes) : '—' }}</div>
        </el-card>
        <el-card shadow="never">
          <template #header>物理 blob</template>
          <div class="metric">{{ stats?.physical_blobs ?? '—' }}</div>
          <div class="metric-hint">
            {{ stats ? formatBytes(stats.physical_bytes) : '—' }}（零引用 {{ stats?.zero_ref_blobs ?? '—' }}）
          </div>
        </el-card>
        <el-card shadow="never">
          <template #header>进行中 / 过期上传</template>
          <div class="metric">{{ stats?.uploads ?? '—' }} / {{ stats?.expired_uploads ?? '—' }}</div>
          <div class="metric-hint">配额覆盖 {{ stats?.quotas ?? '—' }} 条</div>
        </el-card>
      </div>

      <el-card v-if="gcResult" shadow="never" class="block">
        <template #header>上次垃圾回收结果</template>
        <el-descriptions :column="3" border size="small">
          <el-descriptions-item label="删除 blob">{{ gcResult.blobs_deleted }}</el-descriptions-item>
          <el-descriptions-item label="释放容量">{{ formatBytes(gcResult.bytes_deleted) }}</el-descriptions-item>
          <el-descriptions-item label="孤儿文件">{{ gcResult.orphan_files_deleted }}</el-descriptions-item>
          <el-descriptions-item label="过期上传">{{ gcResult.uploads_deleted }}</el-descriptions-item>
          <el-descriptions-item label="幂等记录">{{ gcResult.idempotency_deleted }}</el-descriptions-item>
          <el-descriptions-item label="错误">{{ gcResult.errors }}</el-descriptions-item>
        </el-descriptions>
      </el-card>

      <div class="toolbar">
        <div class="toolbar-title">配额覆盖</div>
        <el-button type="primary" :icon="Edit" @click="openQuota()">新增 / 覆盖</el-button>
      </div>

      <el-table v-loading="quotasLoading" :data="quotas" border stripe>
        <el-table-column prop="subject_kind" label="主体类型" width="130" />
        <el-table-column prop="subject_id" label="主体 ID" min-width="240" show-overflow-tooltip />
        <el-table-column label="容量上限" width="150">
          <template #default="{ row }">{{ row.max_bytes === 0 ? '不限' : formatBytes(row.max_bytes) }}</template>
        </el-table-column>
        <el-table-column label="对象数上限" width="140">
          <template #default="{ row }">{{ row.max_objects === 0 ? '不限' : row.max_objects }}</template>
        </el-table-column>
        <el-table-column label="更新时间" width="180">
          <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openQuota(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <el-button v-if="!finished" :loading="quotasLoading" @click="loadMore">加载更多</el-button>
        <span v-else class="footer-hint">已加载全部配额覆盖</span>
      </div>
    </template>

    <el-dialog v-model="quotaVisible" title="配额覆盖" width="520px" :close-on-click-modal="false">
      <el-alert class="block" type="info" :closable="false" title="0 表示该维度不限；覆盖优先于默认配额。" />
      <el-form ref="quotaFormRef" :model="quotaForm" :rules="quotaRules" label-width="110px">
        <el-form-item label="主体" prop="id">
          <IamObjectSelect
            v-model="quotaForm.id"
            v-model:kind="quotaForm.kind"
            :kinds="QUOTA_SUBJECT_KINDS"
            placeholder="搜索并选择用户或团队"
          />
        </el-form-item>
        <el-form-item label="容量上限">
          <el-input-number v-model="maxMb" :min="0" :step="1" :precision="2" />
          <span class="field-hint">MB，可填小数</span>
        </el-form-item>
        <el-form-item label="对象数上限">
          <el-input-number v-model="quotaForm.max_objects" :min="0" :step="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="quotaVisible = false">取消</el-button>
        <el-button type="primary" :loading="quotaSubmitting" @click="submitQuota">保存</el-button>
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

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.metric {
  font-size: 22px;
  font-weight: 600;
}

.metric-hint {
  margin-top: 4px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.block {
  margin-bottom: 12px;
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

.field-hint {
  margin-left: 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>
