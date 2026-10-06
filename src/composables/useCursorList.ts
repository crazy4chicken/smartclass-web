import { ref, type Ref } from 'vue'

import { isTerminalCursor } from '@/api/cursor'
import type { Page } from '@/api/types'

export interface CursorList<T> {
  items: Ref<T[]>
  loading: Ref<boolean>
  finished: Ref<boolean>
  loadMore: () => Promise<void>
  reload: () => Promise<void>
}

export interface CursorListOptions {
  /** Page size sent to the endpoint; defaults to 100. */
  limit?: number
}

/**
 * Cursor pagination helper: fetches one page at a time with an opaque cursor.
 * `finished` turns true when the endpoint returns an empty `next_cursor`
 * (or a numeric `0`, as used by the audit endpoint).
 */
export function useCursorList<T>(
  fetcher: (cursor: string, limit: number) => Promise<Page<T>>,
  opts: CursorListOptions = {},
): CursorList<T> {
  const limit = opts.limit ?? 100
  const items = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const finished = ref(false)
  const cursor = ref('')

  async function loadMore(): Promise<void> {
    if (loading.value || finished.value) {
      return
    }
    loading.value = true
    try {
      const page = await fetcher(cursor.value, limit)
      items.value.push(...page.items)
      if (isTerminalCursor(page.next_cursor)) {
        finished.value = true
      } else {
        cursor.value = String(page.next_cursor)
      }
    } finally {
      loading.value = false
    }
  }

  async function reload(): Promise<void> {
    items.value = []
    cursor.value = ''
    finished.value = false
    await loadMore()
  }

  return { items, loading, finished, loadMore, reload }
}
