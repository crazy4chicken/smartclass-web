import type { Page } from '@/api/types'

/**
 * Cursor collections changed wire shape in teamusers v0.5.0: `next_cursor` is an
 * opaque string whose terminal value is `""`. The legacy numeric cursors
 * (terminal `0`) stay accepted here so a client can run against either release
 * during a rollout overlap.
 */
export function isTerminalCursor(next: string | number | null | undefined): boolean {
  return next === '' || next === null || next === undefined || next === 0 || Number(next) === 0
}

/**
 * Accepts both the paged envelope and the pre-v0.5.0 bare array that
 * `/me/sessions`, `/users/{id}/sessions` and `/me/passkeys` returned.
 */
export function toPage<T>(data: Page<T> | T[]): Page<T> {
  return Array.isArray(data) ? { items: data, next_cursor: '' } : data
}

/**
 * Walks every page of a cursor collection, passing each cursor back unchanged
 * (a cursor is an opaque key, never a page number). Only a terminal cursor ends
 * the loop, so a final page that is exactly full still triggers the empty
 * follow-up request the service documents.
 */
export async function collectPages<T>(
  fetchPage: (cursor: string) => Promise<Page<T>>,
  maxPages = 100,
): Promise<T[]> {
  const all: T[] = []
  let cursor = ''
  for (let page = 0; page < maxPages; page += 1) {
    const result = await fetchPage(cursor)
    all.push(...result.items)
    if (isTerminalCursor(result.next_cursor)) {
      return all
    }
    cursor = String(result.next_cursor)
  }
  return all
}
