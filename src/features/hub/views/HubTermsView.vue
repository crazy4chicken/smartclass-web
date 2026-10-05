<script setup lang="ts">
import { onMounted, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Delete, Plus, Refresh } from '@element-plus/icons-vue'

import { errorMessage } from '@/utils/error'
import { isApiError } from '@/api/http'
import { useAuthStore } from '@/stores/auth'
import { getPeriods, listTerms, replacePeriods, upsertTerm } from '@/features/hub/api'
import type { Period, Term } from '@/features/hub/api'

const auth = useAuthStore()
/** Writing terms and 节次 tables needs the any-scoped manage key. */
const canManage = auth.hasGrant('dispatch', 'manage')

const terms = ref<Term[]>([])
const loading = ref(false)

function formatTime(value: string): string {
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss')
}

async function load(): Promise<void> {
  loading.value = true
  try {
    terms.value = await listTerms()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    loading.value = false
  }
}

// --- Term dialog -----------------------------------------------------------

const termVisible = ref(false)
const termSubmitting = ref(false)
const termFormRef = ref<FormInstance>()
const termForm = ref({ term_code: '', name: '', week1_monday: '', weeks: 16 })

const termRules: FormRules = {
  term_code: [{ required: true, message: '请输入学期编码', trigger: 'blur' }],
  name: [{ required: true, message: '请输入学期名称', trigger: 'blur' }],
  week1_monday: [{ required: true, message: '请选择第 1 教学周的周一', trigger: 'change' }],
}

function openTermCreate(): void {
  termForm.value = { term_code: '', name: '', week1_monday: '', weeks: 16 }
  termVisible.value = true
}

function openTermEdit(row: Term): void {
  termForm.value = {
    term_code: row.term_code,
    name: row.name,
    // The API documents `YYYY-MM-DD` input; responses carry the RFC3339 form of the same day.
    week1_monday: dayjs(row.week1_monday).format('YYYY-MM-DD'),
    weeks: row.weeks,
  }
  termVisible.value = true
}

async function submitTerm(): Promise<void> {
  if (!termFormRef.value) {
    return
  }
  const valid = await termFormRef.value.validate().catch(() => false)
  if (!valid) {
    return
  }
  termSubmitting.value = true
  try {
    await upsertTerm({
      term_code: termForm.value.term_code.trim(),
      name: termForm.value.name.trim(),
      week1_monday: termForm.value.week1_monday,
      weeks: termForm.value.weeks,
    })
    ElMessage.success('学期已保存（同名学期会被覆盖）')
    termVisible.value = false
    await load()
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    termSubmitting.value = false
  }
}

// --- Periods dialog --------------------------------------------------------

const periodsVisible = ref(false)
const periodsLoading = ref(false)
const periodsSaving = ref(false)
const periodsTerm = ref('')
const periods = ref<Period[]>([])

async function openPeriods(row: Term): Promise<void> {
  periodsTerm.value = row.term_code
  periodsVisible.value = true
  periodsLoading.value = true
  try {
    periods.value = await getPeriods(row.term_code)
  } catch (error) {
    if (isApiError(error) && error.detail === 'periods_not_configured') {
      // A term without a table answers 404 instead of an empty list; start from scratch.
      periods.value = []
    } else {
      ElMessage.error(errorMessage(error))
      periodsVisible.value = false
      return
    }
  } finally {
    periodsLoading.value = false
  }
}

function addPeriod(): void {
  const next = periods.value.length === 0 ? 1 : Math.max(...periods.value.map((p) => p.period_no)) + 1
  periods.value.push({ period_no: next, start_time: '08:00', end_time: '08:45' })
}

function removePeriod(index: number): void {
  periods.value.splice(index, 1)
}

async function savePeriods(): Promise<void> {
  for (const period of periods.value) {
    if (!/^\d{2}:\d{2}$/.test(period.start_time) || !/^\d{2}:\d{2}$/.test(period.end_time)) {
      ElMessage.error(`第 ${period.period_no} 节的开始/结束时间需为 HH:MM`)
      return
    }
    if (period.end_time <= period.start_time) {
      ElMessage.error(`第 ${period.period_no} 节的结束时间必须晚于开始时间`)
      return
    }
  }
  const numbers = periods.value.map((p) => p.period_no)
  if (new Set(numbers).size !== numbers.length) {
    ElMessage.error('节次序号不能重复')
    return
  }
  periodsSaving.value = true
  try {
    periods.value = await replacePeriods(periodsTerm.value, periods.value)
    ElMessage.success('节次表已替换')
    periodsVisible.value = false
  } catch (error) {
    ElMessage.error(errorMessage(error))
  } finally {
    periodsSaving.value = false
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <div class="toolbar-title">学期与节次</div>
      <div class="toolbar-actions">
        <el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button>
        <el-button v-if="canManage" type="primary" :icon="Plus" @click="openTermCreate">新建学期</el-button>
      </div>
    </div>

    <el-table v-loading="loading" :data="terms" border stripe>
      <el-table-column prop="term_code" label="学期编码" min-width="140" />
      <el-table-column prop="name" label="名称" min-width="180" />
      <el-table-column label="第 1 教学周周一" width="170">
        <template #default="{ row }">{{ dayjs(row.week1_monday).format('YYYY-MM-DD') }}</template>
      </el-table-column>
      <el-table-column prop="weeks" label="教学周数" width="110" />
      <el-table-column label="更新时间" width="180">
        <template #default="{ row }">{{ formatTime(row.updated_at) }}</template>
      </el-table-column>
      <el-table-column label="操作" width="160" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="openPeriods(row)">节次</el-button>
          <el-button v-if="canManage" link type="primary" @click="openTermEdit(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="termVisible"
      title="学期"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-alert
        class="block"
        type="info"
        :closable="false"
        title="term_code 是学期标识；保存已存在的编码会覆盖其名称、第 1 教学周周一与周数。"
      />
      <el-form ref="termFormRef" :model="termForm" :rules="termRules" label-width="140px">
        <el-form-item label="学期编码" prop="term_code">
          <el-input v-model="termForm.term_code" placeholder="如：2026-FALL" />
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input v-model="termForm.name" placeholder="如：2026 秋季学期" />
        </el-form-item>
        <el-form-item label="第 1 教学周周一" prop="week1_monday">
          <el-date-picker
            v-model="termForm.week1_monday"
            type="date"
            value-format="YYYY-MM-DD"
            placeholder="选择日期"
            class="full-width"
          />
        </el-form-item>
        <el-form-item label="教学周数">
          <el-input-number v-model="termForm.weeks" :min="1" :max="30" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="termVisible = false">取消</el-button>
        <el-button type="primary" :loading="termSubmitting" @click="submitTerm">保存</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="periodsVisible"
      :title="`节次表 · ${periodsTerm}`"
      width="640px"
      :close-on-click-modal="false"
    >
      <el-alert
        class="block"
        type="warning"
        :closable="false"
        title="替换整张节次表；导入课表按此校验节次范围，已有场次的节次不会重新校验，改表后请重新导入课表。"
      />
      <el-table v-loading="periodsLoading" :data="periods" border size="small">
        <el-table-column label="节次" width="110">
          <template #default="{ row }">
            <el-input-number v-model="row.period_no" :min="1" :max="20" size="small" controls-position="right" />
          </template>
        </el-table-column>
        <el-table-column label="开始">
          <template #default="{ row }">
            <el-time-select v-model="row.start_time" start="06:00" step="00:05" end="23:00" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="结束">
          <template #default="{ row }">
            <el-time-select v-model="row.end_time" start="06:00" step="00:05" end="23:30" size="small" />
          </template>
        </el-table-column>
        <el-table-column label="" width="70">
          <template #default="{ $index }">
            <el-button link type="danger" :icon="Delete" @click="removePeriod($index)" />
          </template>
        </el-table-column>
      </el-table>
      <el-button class="add-period" :icon="Plus" @click="addPeriod">添加节次</el-button>
      <template #footer>
        <el-button @click="periodsVisible = false">取消</el-button>
        <el-button type="primary" :loading="periodsSaving" @click="savePeriods">替换节次表</el-button>
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

.block {
  margin-bottom: 12px;
}

.add-period {
  margin-top: 12px;
  width: 100%;
}

.full-width {
  width: 100%;
}
</style>
