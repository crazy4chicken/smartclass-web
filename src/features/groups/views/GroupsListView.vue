<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'

import type { Group, Team } from '@/api/types'
import { useCursorList } from '@/composables/useCursorList'
import { errorMessage } from '@/utils/error'
import { createGroup, deleteGroup, getGroup, listGroups, updateGroup } from '@/features/groups/api'
import type { CreateGroupPayload, UpdateGroupPayload } from '@/features/groups/api'
import { listTeams } from '@/features/teams/api'
import GroupMembersDialog from '@/features/groups/views/GroupMembersDialog.vue'

/** Safety bound for the team selector: 50 pages × 100 teams is far beyond any real console. */
const MAX_TEAM_PAGES = 50

const teams = ref<Team[]>([])
const teamsLoading = ref(false)
const selectedTeamId = ref('')

const { items, loading, finished, loadMore, reload } = useCursorList<Group>((cursor, limit) =>
  listGroups(selectedTeamId.value, cursor, limit),
)

const teamNames = computed(() => new Map(teams.value.map((team) => [team.id, team.name])))

async function loadAllTeams(): Promise<void> {
  teamsLoading.value = true
  try {
    const collected: Team[] = []
    let cursor = ''
    for (let page = 0; page < MAX_TEAM_PAGES; page += 1) {
      const response = await listTeams(cursor, 100)
      collected.push(...response.items)
      const next = response.next_cursor
      if (next === '' || next === null || next === undefined || Number(next) === 0) {
        break
      }
      cursor = String(next)
    }
    teams.value = collected
    if (selectedTeamId.value === '' && collected.length > 0) {
      selectedTeamId.value = collected[0].id
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    teamsLoading.value = false
  }
}

watch(selectedTeamId, () => {
  if (selectedTeamId.value !== '') {
    void reload()
  }
})

const dialogVisible = ref(false)
const dialogMode = ref<'create' | 'edit'>('create')
const editingId = ref('')
const original = ref<Group | null>(null)
const submitting = ref(false)
const formRef = ref<FormInstance>()
const form = ref({ name: '', teamId: '' })

const rules: FormRules = {
  name: [{ required: true, message: '请输入用户组名称', trigger: 'blur' }],
  teamId: [{ required: true, message: '请选择所属团队', trigger: 'change' }],
}

const membersVisible = ref(false)
const membersGroup = ref<Group | null>(null)

function openMembers(row: Group): void {
  membersGroup.value = row
  membersVisible.value = true
}

function openCreate(): void {
  dialogMode.value = 'create'
  editingId.value = ''
  original.value = null
  form.value = { name: '', teamId: selectedTeamId.value }
  dialogVisible.value = true
}

async function openEdit(row: Group): Promise<void> {
  try {
    const fresh = await getGroup(row.id)
    dialogMode.value = 'edit'
    editingId.value = fresh.id
    original.value = fresh
    form.value = { name: fresh.name, teamId: fresh.team_id }
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
    const targetTeam = form.value.teamId
    if (dialogMode.value === 'create') {
      const payload: CreateGroupPayload = { name, team_id: targetTeam }
      await createGroup(payload)
      ElMessage.success('用户组已创建')
    } else {
      const current = original.value
      if (!current) {
        return
      }
      const payload: UpdateGroupPayload = {}
      if (name !== current.name) {
        payload.name = name
      }
      if (targetTeam !== current.team_id) {
        payload.team_id = targetTeam
      }
      if (Object.keys(payload).length === 0) {
        ElMessage.info('没有需要提交的修改')
        return
      }
      await updateGroup(editingId.value, payload)
      ElMessage.success('用户组已更新')
    }
    dialogVisible.value = false
    if (targetTeam !== selectedTeamId.value) {
      // Switching the selected team triggers the watcher, which reloads the list.
      selectedTeamId.value = targetTeam
    } else {
      await reload()
    }
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    submitting.value = false
  }
}

async function onDelete(row: Group): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确定删除用户组「${row.name}」吗？其成员关系会被一并删除，相关用户的权限版本将失效。`,
      '删除用户组',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' },
    )
  } catch {
    return
  }
  try {
    await deleteGroup(row.id)
    ElMessage.success('用户组已删除')
    await reload()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

onMounted(async () => {
  await loadAllTeams()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">用户组</div>
      <el-select
        v-model="selectedTeamId"
        placeholder="请选择团队"
        class="team-select"
        :loading="teamsLoading"
        filterable
      >
        <el-option v-for="team in teams" :key="team.id" :label="`${team.name}（${team.slug}）`" :value="team.id" />
      </el-select>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" :disabled="selectedTeamId === ''" @click="reload">
          刷新
        </el-button>
        <el-button type="primary" :icon="Plus" :disabled="selectedTeamId === ''" @click="openCreate">
          新建用户组
        </el-button>
      </div>
    </div>

    <el-empty v-if="selectedTeamId === ''" description="用户组按团队隔离，请先选择团队" />

    <template v-else>
      <el-table v-loading="loading" :data="items" border stripe>
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="所属团队" min-width="200">
          <template #default="{ row }">
            {{ teamNames.get(row.team_id) ?? row.team_id }}
          </template>
        </el-table-column>
        <el-table-column label="用户组 ID" min-width="230">
          <template #default="{ row }">
            <span class="mono">{{ row.id }}</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
            <el-button link type="primary" @click="openMembers(row)">成员管理</el-button>
            <el-button link type="danger" @click="onDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="table-footer">
        <el-button v-if="!finished" :loading="loading" @click="loadMore">加载更多</el-button>
        <span v-else class="footer-hint">已加载该团队的全部用户组</span>
      </div>
    </template>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogMode === 'create' ? '新建用户组' : '编辑用户组'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item label="名称" prop="name">
          <el-input v-model="form.name" placeholder="如：backend" />
        </el-form-item>
        <el-form-item label="所属团队" prop="teamId">
          <el-select v-model="form.teamId" class="full-width" filterable>
            <el-option
              v-for="team in teams"
              :key="team.id"
              :label="`${team.name}（${team.slug}）`"
              :value="team.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitForm">确定</el-button>
      </template>
    </el-dialog>

    <GroupMembersDialog v-model="membersVisible" :group="membersGroup" />
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
  gap: 12px;
  flex-wrap: wrap;
}

.toolbar-title {
  font-size: 16px;
  font-weight: 600;
}

.team-select {
  width: 260px;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
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

.full-width {
  width: 100%;
}
</style>
