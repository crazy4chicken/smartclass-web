<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { CopyDocument, Plus, Refresh } from '@element-plus/icons-vue'

import type { Team } from '@/api/types'
import { useCursorList } from '@/composables/useCursorList'
import { errorMessage } from '@/utils/error'
import { createTeam, deleteTeam, getTeam, listTeams, updateTeam } from '@/features/teams/api'
import type { CreateTeamPayload, UpdateTeamPayload } from '@/features/teams/api'

type TagType = 'success' | 'info' | 'warning' | 'danger'

const STATUS_META: Record<string, { label: string; type: TagType }> = {
  active: { label: '正常', type: 'success' },
  disabled: { label: '已禁用', type: 'info' },
}

function statusMeta(status: string): { label: string; type: TagType } {
  return STATUS_META[status] ?? { label: status, type: 'info' }
}

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value)
    ElMessage.success(`${label}已复制`)
  } catch {
    ElMessage.error('复制失败，请手动选择文本复制')
  }
}

const { items, loading, finished, loadMore, reload } = useCursorList<Team>(listTeams)

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const original = ref<Team | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ name: '', slug: '', status: 'active' })

const rules: FormRules = {
  name: [{ required: true, message: '请输入团队名称', trigger: 'blur' }],
  slug: [{ required: true, message: '请输入团队标识（slug）', trigger: 'blur' }],
}

function openCreate(): void {
  dialogMode.value = 'create'
  editingId.value = ''
  original.value = null
  form.value = { name: '', slug: '', status: 'active' }
  dialogVisible.value = true
}

async function openEdit(row: Team): Promise<void> {
  try {
    const fresh = await getTeam(row.id)
    dialogMode.value = 'edit'
    editingId.value = fresh.id
    original.value = fresh
    form.value = { name: fresh.name, slug: fresh.slug, status: fresh.status }
    dialogVisible.value = true
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
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
    const name = form.value.name.trim()
    const slug = form.value.slug.trim()
    if (dialogMode.value === 'create') {
      const payload: CreateTeamPayload = { name, slug, status: form.value.status }
      await createTeam(payload)
      ElMessage.success('团队已创建')
    } else {
      const payload: UpdateTeamPayload = {}
      const current = original.value
      if (!current) {
        return
      }
      if (name !== current.name) {
        payload.name = name
      }
      if (slug !== current.slug) {
        payload.slug = slug
      }
      if (form.value.status !== current.status) {
        payload.status = form.value.status
      }
      if (Object.keys(payload).length === 0) {
        ElMessage.info('没有需要提交的修改')
        return
      }
      await updateTeam(editingId.value, payload)
      ElMessage.success('团队已更新')
    }
    dialogVisible.value = false
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function onDelete(row: Team): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除团队「${row.name}」吗？其用户组、绑定等从属记录会被一并删除且不可恢复。`,
      '删除团队',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteTeam(row.id)
    ElMessage.success('团队已删除')
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
      <div class="toolbar-title">团队</div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="reload">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建团队</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border stripe>
      <el-table-column label="ID" min-width="330">
        <template #default="{ row }">
          <div class="id-cell">
            <span class="mono">{{ row.id }}</span>
            <el-button link type="primary" :icon="CopyDocument" title="复制 ID" @click="copy(row.id, 'ID')" />
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="名称" min-width="160" />
      <el-table-column prop="slug" label="标识（slug）" min-width="180" />
      <el-table-column label="状态" width="110">
        <template #default="{ row }">
          <el-tag :type="statusMeta(row.status).type">{{ statusMeta(row.status).label }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="创建时间" width="180">
        <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="150" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="danger" @click="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="table-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMore">加载更多</el-button>
      <span v-else class="footer-hint">已加载全部团队</span>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建团队' : '编辑团队'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：Acme" />
        </el-form-item>
        <el-form-item label="标识（slug）" prop="slug">
          <el-input v-model="form.slug" placeholder="如：acme" />
        </el-form-item>
        <el-form-item label="状态" prop="status">
          <el-select v-model="form.status" class="full-width">
            <el-option label="正常" value="active" />
            <el-option label="已禁用" value="disabled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
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

.mono {
  font-family: monospace;
}

.id-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.full-width {
  width: 100%;
}
</style>
