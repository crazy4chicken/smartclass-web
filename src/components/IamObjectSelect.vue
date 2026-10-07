<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'

import { errorMessage } from '@/utils/error'
import { IAM_OBJECT_KINDS, IAM_OBJECT_KIND_LABELS, useIamObjects } from '@/composables/useIamObjects'
import type { IamObjectKind } from '@/composables/useIamObjects'

/**
 * Picker for one IAM object: the type (user, team, group, role) plus the target, found by
 * search over incrementally loaded cursor pages of the teamusers admin API. A raw id can
 * still be typed or pasted, so ids copied from a log or another console keep working.
 *
 * The caller owns the pair: `v-model` carries the id and `v-model:kind` the type. Sites
 * that only ever reference one kind pass a single-entry `kinds` list and skip the type
 * selector.
 */
const props = withDefaults(
  defineProps<{
    modelValue?: string
    kind?: IamObjectKind
    /** Kinds the caller may pick; a single entry hides the type selector. */
    kinds?: readonly IamObjectKind[]
    placeholder?: string
    clearable?: boolean
    disabled?: boolean
  }>(),
  {
    modelValue: '',
    kind: 'user',
    kinds: () => IAM_OBJECT_KINDS,
    placeholder: '搜索并选择对象',
    clearable: true,
    disabled: false,
  },
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'update:kind', value: IamObjectKind): void
}>()

const objects = useIamObjects()

const query = ref('')
const opened = ref(false)

const activeKind = computed<IamObjectKind>(() => props.kind)
const visibleKinds = computed(() => (props.kinds.length > 0 ? props.kinds : IAM_OBJECT_KINDS))
const showKindSelector = computed(() => visibleKinds.value.length > 1)

const state = computed(() => objects.states[activeKind.value])
const options = computed(() => objects.options(activeKind.value, query.value))
const hasMore = computed(() => objects.hasMore(activeKind.value))

function onKindChange(kind: IamObjectKind): void {
  // The id belongs to the previous type, so the pair never mixes kinds.
  emit('update:kind', kind)
  emit('update:modelValue', '')
  query.value = ''
  objects.ensure(kind)
}

function onSelect(value: string): void {
  emit('update:modelValue', value)
}

function onDropdownVisible(visible: boolean): void {
  opened.value = visible
  if (visible) {
    objects.ensure(activeKind.value)
  } else {
    query.value = ''
  }
}

async function loadMore(): Promise<void> {
  try {
    await objects.load(activeKind.value)
  } catch (error) {
    ElMessage.error(errorMessage(error))
  }
}

/**
 * A query that matches nothing yet keeps pulling pages: the endpoints have no free-text
 * search, so the only way to find an object behind the loaded ones is to walk the cursor.
 * Bounded per query so a miss cannot walk the whole table.
 */
const AUTO_PAGE_LIMIT = 5
let autoPages = 0

watch(query, (value) => {
  autoPages = 0
  if (!value.trim()) {
    return
  }
  void continueSearch()
})

async function continueSearch(): Promise<void> {
  const kind = activeKind.value
  while (
    query.value.trim() &&
    options.value.length === 0 &&
    hasMore.value &&
    !state.value.loading &&
    autoPages < AUTO_PAGE_LIMIT
  ) {
    autoPages += 1
    try {
      await objects.load(kind)
    } catch (error) {
      ElMessage.error(errorMessage(error))
      return
    }
  }
}

watch(
  () => props.kind,
  (kind) => {
    query.value = ''
    if (opened.value) {
      objects.ensure(kind)
    }
  },
)
</script>

<template>
  <div class="iam-object-select">
    <el-select
      v-if="showKindSelector"
      class="kind-select"
      :model-value="activeKind"
      :disabled="disabled"
      @update:model-value="onKindChange"
    >
      <el-option
        v-for="kind in visibleKinds"
        :key="kind"
        :value="kind"
        :label="IAM_OBJECT_KIND_LABELS[kind]"
      />
    </el-select>

    <el-select
      class="object-select"
      :model-value="modelValue"
      :placeholder="placeholder"
      :clearable="clearable"
      :disabled="disabled"
      :loading="state.loading"
      filterable
      remote
      allow-create
      default-first-option
      :remote-method="(value: string) => (query = value)"
      :reserve-keyword="false"
      @update:model-value="onSelect"
      @visible-change="onDropdownVisible"
    >
      <el-option
        v-for="option in options"
        :key="`${option.kind}:${option.id}`"
        :value="option.id"
        :label="option.label"
      >
        <span class="option-label">{{ option.label }}</span>
        <span class="option-hint">{{ option.hint }}</span>
      </el-option>

      <!-- The footer keeps the dropdown open while the next page loads. -->
      <template v-if="hasMore" #footer>
        <div class="more">
          <el-button link type="primary" :loading="state.loading" @click="loadMore">
            加载更多…（已加载 {{ state.items.length }} 个）
          </el-button>
        </div>
      </template>

      <template #empty>
        <div class="empty">
          <span v-if="state.loading">加载中…</span>
          <span v-else-if="query">没有匹配的对象</span>
          <span v-else>没有可选项</span>
        </div>
      </template>
    </el-select>
  </div>
</template>

<style scoped>
.iam-object-select {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.kind-select {
  width: 120px;
  flex: none;
}

.object-select {
  flex: 1;
  min-width: 240px;
}

.option-label {
  margin-right: 8px;
}

.option-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.more {
  padding: 4px 12px;
  text-align: center;
}

.empty {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
</style>
