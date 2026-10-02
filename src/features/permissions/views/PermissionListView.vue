<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

import { useCursorList } from '@/composables/useCursorList'
import type { Permission } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { listPermissions, registerPermission } from '../api'

const keyword = ref('')
const { items, loading, finished, loadMore, reload } = useCursorList<Permission>(listPermissions)

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) {
    return items.value
  }
  return items.value.filter(
    (item) => item.key.toLowerCase().includes(kw) || item.description.toLowerCase().includes(kw),
  )
})

async function refresh(): Promise<void> {
  try {
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

async function loadMoreSafe(): Promise<void> {
  try {
    await loadMore()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(refresh)

function formatTime(value: string): string {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
}

const dialogVisible = ref(false)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ key: '', registeredBy: '', description: '' })
const rules: FormRules = {
  key: [
    { required: true, message: '请输入权限 key', trigger: 'blur' },
    {
      pattern: /^!?[^:\s]+:[^:\s]+:[^:\s]+$/,
      message: '需符合 resource:action:scope 格式，可用 ! 前缀表示拒绝',
      trigger: 'blur',
    },
  ],
  registeredBy: [{ required: true, message: '请输入注册方名称', trigger: 'blur' }],
}

function openRegister(item?: Permission): void {
  form.key = item?.key ?? ''
  form.registeredBy = item?.registered_by ?? ''
  form.description = item?.description ?? ''
  dialogVisible.value = true
}

async function submit(): Promise<void> {
  if (!formRef.value) {
    return
  }
  const valid = await formRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  saving.value = true
  try {
    await registerPermission({
      key: form.key.trim(),
      registered_by: form.registeredBy.trim(),
      description: form.description.trim(),
    })
    ElMessage.success('权限已保存')
    dialogVisible.value = false
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input v-model="keyword" class="filter-input" placeholder="按 key 过滤（仅过滤已加载数据）" clearable />
      <div class="toolbar-right">
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openRegister()">注册/更新权限</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="filteredItems" border empty-text="暂无已注册权限">
      <el-table-column label="权限 key" min-width="240" show-overflow-tooltip>
        <template #default="{ row }">
          <el-tag v-if="row.key.startsWith('!')" type="danger" size="small" class="deny-tag">拒绝</el-tag>
          <span>{{ row.key }}</span>
        </template>
      </el-table-column>
      <el-table-column prop="description" label="描述" min-width="220" show-overflow-tooltip />
      <el-table-column prop="registered_by" label="注册方" min-width="160" show-overflow-tooltip />
      <el-table-column label="注册时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openRegister(row)">更新</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="list-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMoreSafe">加载更多</el-button>
      <span v-else class="list-finished">已加载全部</span>
    </div>

    <el-dialog v-model="dialogVisible" title="注册/更新权限" width="560px" :close-on-click-modal="false">
      <el-form ref="formRef" :model="form" :rules="rules" label-width="100px" @submit.prevent>
        <el-form-item label="权限 key" prop="key">
          <el-input v-model="form.key" placeholder="resource:action:scope，如 iam:users:any" />
        </el-form-item>
        <el-form-item label="注册方" prop="registeredBy">
          <el-input v-model="form.registeredBy" placeholder="注册该权限的服务名，如 orders-service" />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input v-model="form.description" type="textarea" :rows="3" placeholder="权限用途说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-input {
  width: 320px;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  gap: 8px;
}

.deny-tag {
  margin-right: 6px;
}

.list-footer {
  display: flex;
  justify-content: center;
  padding: 12px 0 0;
}

.list-finished {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
