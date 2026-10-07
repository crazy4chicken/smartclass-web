import { reactive } from 'vue'

import { isTerminalCursor } from '@/api/cursor'
import { listGroups } from '@/features/groups/api'
import { listRoles } from '@/features/roles/api'
import { listTeams } from '@/features/teams/api'
import { listUsers } from '@/features/users/api'

/**
 * IAM objects are the typed targets teamusers addresses by a `(kind, id)` pair - the
 * subjects its own APIs take. Every console input that used to ask for a bare ULID uses
 * this loader instead, so the operator picks a real object and the caller still receives
 * the pair.
 *
 * The list endpoints are cursor paginated and carry no free-text search, so loading is
 * incremental: each kind keeps its own cursor and the picker filters what is loaded,
 * offering the next page when the current one does not answer the query.
 */

export type IamObjectKind = 'user' | 'team' | 'group' | 'role'

export const IAM_OBJECT_KINDS: readonly IamObjectKind[] = ['user', 'team', 'group', 'role']

export const IAM_OBJECT_KIND_LABELS: Record<IamObjectKind, string> = {
  user: '用户',
  team: '团队',
  group: '用户组',
  role: '角色',
}

/** One selectable object: the pair plus the text the picker shows. */
export interface IamObjectOption {
  kind: IamObjectKind
  id: string
  /** Primary text: a name, a username or a role name. */
  label: string
  /** Secondary text under the label: the raw id and, where it matters, the owning team. */
  hint: string
}

/** Page size of one incremental load; the endpoints cap `limit` at 1000. */
const PAGE_SIZE = 50

interface KindState {
  items: IamObjectOption[]
  cursor: string
  finished: boolean
  loading: boolean
}

/** Per-kind caches: switching kinds back and forth keeps what was already loaded. */
const states = reactive<Record<IamObjectKind, KindState>>({
  user: { items: [], cursor: '', finished: false, loading: false },
  team: { items: [], cursor: '', finished: false, loading: false },
  group: { items: [], cursor: '', finished: false, loading: false },
  role: { items: [], cursor: '', finished: false, loading: false },
})

/** Fetches one cursor page of the given kind, mapped into selectable options. */
async function fetchPage(kind: IamObjectKind, cursor: string): Promise<{ items: IamObjectOption[]; nextCursor: string }> {
  if (kind === 'user') {
    const page = await listUsers(cursor, PAGE_SIZE)
    return {
      nextCursor: String(page.next_cursor ?? ''),
      items: page.items.map((user) => ({
        kind,
        id: user.id,
        label: user.display_name || user.username,
        hint: user.username === (user.display_name || user.username) ? user.id : `${user.username} · ${user.id}`,
      })),
    }
  }
  if (kind === 'team') {
    const page = await listTeams(cursor, PAGE_SIZE)
    return {
      nextCursor: String(page.next_cursor ?? ''),
      items: page.items.map((team) => ({ kind, id: team.id, label: team.name, hint: team.id })),
    }
  }
  if (kind === 'group') {
    const page = await listGroups('', cursor, PAGE_SIZE)
    return {
      nextCursor: String(page.next_cursor ?? ''),
      items: page.items.map((group) => ({
        kind,
        id: group.id,
        label: group.name,
        hint: group.team_id ? `${group.team_id} · ${group.id}` : group.id,
      })),
    }
  }
  const page = await listRoles(cursor, PAGE_SIZE)
  return {
    nextCursor: String(page.next_cursor ?? ''),
    items: page.items.map((role) => ({
      kind,
      id: role.id,
      label: role.team_id ? `${role.name}（团队 ${role.team_id}）` : role.name,
      hint: role.id,
    })),
  }
}

/** Narrows a `subject_kind`-style string from an API payload to a known kind. */
export function toIamObjectKind(value: string | null | undefined, fallback: IamObjectKind = 'user'): IamObjectKind {
  return IAM_OBJECT_KINDS.includes(value as IamObjectKind) ? (value as IamObjectKind) : fallback
}

/** Whether the option matches the picker's query (id, label and hint all count). */
export function matchesIamObject(option: IamObjectOption, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return true
  }
  return (
    option.label.toLowerCase().includes(needle) ||
    option.hint.toLowerCase().includes(needle) ||
    option.id.toLowerCase().includes(needle)
  )
}

export function useIamObjects() {
  /** Loads the next page of `kind`; the first call (or `reset`) starts from the beginning. */
  async function load(kind: IamObjectKind, reset = false): Promise<void> {
    const state = states[kind]
    if (state.loading || (state.finished && !reset)) {
      return
    }
    state.loading = true
    try {
      const page = await fetchPage(kind, reset ? '' : state.cursor)
      state.items = reset ? page.items : [...state.items, ...page.items]
      state.cursor = page.nextCursor
      state.finished = isTerminalCursor(page.nextCursor)
    } finally {
      state.loading = false
    }
  }

  /** Ensures at least one page of `kind` is available; used when the dropdown opens. */
  function ensure(kind: IamObjectKind): void {
    if (states[kind].items.length === 0 && !states[kind].finished) {
      void load(kind)
    }
  }

  return {
    states,
    load,
    ensure,
    /** Options of `kind` matching `query`, in load order. */
    options(kind: IamObjectKind, query: string): IamObjectOption[] {
      return states[kind].items.filter((option) => matchesIamObject(option, query))
    },
    /** Whether `kind` still has pages behind the loaded ones. */
    hasMore(kind: IamObjectKind): boolean {
      return !states[kind].finished
    },
    /** The loaded option for an id, if any - lets a picker show a name instead of a raw id. */
    find(kind: IamObjectKind, id: string): IamObjectOption | undefined {
      return states[kind].items.find((option) => option.id === id)
    },
  }
}
