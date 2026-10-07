<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Plus, Refresh, Search } from '@element-plus/icons-vue'

import { useCursorList } from '@/composables/useCursorList'
import type { Role } from '@/api/types'
import { errorMessage } from '@/utils/error'
import { createRole, deleteRole, listRoles, updateRole } from '../api'
import RolePermissionsDialog from './RolePermissionsDialog.vue'

const teamFilter = ref('')
const { items, loading, finished, loadMore, reload } = useCursorList<Role>((cursor, limit) =>
  listRoles(cursor, limit, teamFilter.value.trim()),
)

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

const dialogVisible = ref(false)
const editing = ref<Role | null>(null)
const saving = ref(false)
const formRef = ref<FormInstance>()
const form = reactive({ name: '', teamId: '' })
const rules: FormRules = {
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

function openCreate(): void {
  editing.value = null
  form.name = ''
  form.teamId = ''
  dialogVisible.value = true
}

function openEdit(row: Role): void {
  editing.value = row
  form.name = row.name
  form.teamId = row.team_id ?? ''
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
  const name = form.name.trim()
  const teamId = form.teamId.trim()
  saving.value = true
  try {
    if (editing.value) {
      // PATCH: an empty team id clears the team scope (platform role).
      await updateRole(editing.value.id, teamId ? { name, team_id: teamId } : { name, team_id: null })
      ElMessage.success('角色已更新')
    } else {
      await createRole(teamId ? { name, team_id: teamId } : { name })
      ElMessage.success('角色已创建')
    }
    dialogVisible.value = false
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    saving.value = false
  }
}

async function remove(row: Role): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除角色「${row.name}」？该角色的全部绑定会一并删除。`, '删除角色', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      confirmButtonClass: 'el-button--danger',
    })
  } catch {
    return
  }
  try {
    await deleteRole(row.id)
    ElMessage.success('角色已删除')
    await refresh()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

const permissionsVisible = ref(false)
const permissionsRole = ref<Role | null>(null)

function openPermissions(row: Role): void {
  permissionsRole.value = row
  permissionsVisible.value = true
}
</script>

<template>
  <el-card shadow="never">
    <div class="toolbar">
      <el-input
        v-model="teamFilter"
        class="filter-input"
        placeholder="按团队 ID 过滤（留空为全部角色）"
        clearable
        @keyup.enter="refresh"
      />
      <el-button type="primary" :icon="Search" @click="refresh">查询</el-button>
      <div class="toolbar-right">
        <el-button :icon="Refresh" @click="refresh">刷新</el-button>
        <el-button type="primary" :icon="Plus" @click="openCreate">新建角色</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="items" border empty-text="暂无角色">
      <el-table-column prop="id" label="角色 ID" min-width="220" show-overflow-tooltip />
      <el-table-column prop="name" label="名称" min-width="160" show-overflow-tooltip />
      <el-table-column label="团队范围" min-width="200">
        <template #default="{ row }">
          <span v-if="row.team_id">{{ row.team_id }}</span>
          <el-tag v-else type="info">平台角色</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
          <el-button link type="primary" @click="openPermissions(row)">权限配置</el-button>
          <el-button link type="danger" @click="remove(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="list-footer">
      <el-button v-if="!finished" :loading="loading" @click="loadMoreSafe">加载更多</el-button>
      <span v-else class="list-finished">已加载全部</span>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="editing ? '编辑角色' : '新建角色'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="90px" @submit.prevent>
        <el-form-item label="角色名称" prop="name">
          <el-input v-model="form.name" placeholder="例如 operator" />
        </el-form-item>
        <el-form-item label="团队 ID" prop="teamId">
          <el-input v-model="form.teamId" placeholder="留空为平台角色" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">保存</el-button>
      </template>
    </el-dialog>

    <RolePermissionsDialog v-model="permissionsVisible" :role="permissionsRole" />
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
