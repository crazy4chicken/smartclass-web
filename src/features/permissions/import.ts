import { permissionKeyError } from './grammar'

/**
 * Parser and validator for the permission-import document, run entirely in the browser.
 * The format is specified in `docs/permission-import.md`: either an object with a
 * `permissions` array, or that array on its own. Nothing here talks to the service; the
 * caller imports the returned entries and decides what to do with the issues.
 */

/** Highest `version` this parser understands. */
export const PERMISSION_IMPORT_VERSION = 1

/** Cap on entries per file; a bigger document is rejected instead of hammering the service. */
export const PERMISSION_IMPORT_MAX_ENTRIES = 1000

/** One entry that passed validation, ready to be registered. */
export interface PermissionImportEntry {
  key: string
  registeredBy: string
  description: string
  /** `new` when the registry does not hold the key yet, `existing` when the import updates it. */
  state: 'new' | 'existing'
}

/** One entry the service would reject, with the reason shown to the operator. */
export interface PermissionImportIssue {
  /** 1-based position of the entry in the file. */
  index: number
  key: string
  reason: string
}

export interface PermissionImportParseResult {
  entries: PermissionImportEntry[]
  issues: PermissionImportIssue[]
  /** Set when the whole document is unusable; `entries` and `issues` are then empty. */
  documentError?: string
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Parses the document and validates every entry: JSON shape, the permission-key grammar
 * (the same rules the service enforces), the registration source and duplicates inside
 * the file. `knownKeys` marks the entries the registry already holds.
 */
export function parsePermissionImport(text: string, knownKeys: ReadonlySet<string>): PermissionImportParseResult {
  let document: unknown
  try {
    document = JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { entries: [], issues: [], documentError: `不是合法的 JSON：${reason}` }
  }

  let defaultRegisteredBy = ''
  let rawPermissions: unknown
  if (Array.isArray(document)) {
    rawPermissions = document
  } else if (typeof document === 'object' && document !== null) {
    const record = document as Record<string, unknown>
    rawPermissions = record.permissions
    defaultRegisteredBy = asString(record.registered_by)
    if (record.version !== undefined && record.version !== PERMISSION_IMPORT_VERSION) {
      return {
        entries: [],
        issues: [],
        documentError: `不支持的 version：${String(record.version)}（本前端只认识 ${PERMISSION_IMPORT_VERSION}）`,
      }
    }
  } else {
    return { entries: [], issues: [], documentError: '顶层需为对象（含 permissions 数组）或直接为数组' }
  }

  if (!Array.isArray(rawPermissions)) {
    return { entries: [], issues: [], documentError: '缺少 permissions 数组' }
  }
  if (rawPermissions.length === 0) {
    return { entries: [], issues: [], documentError: 'permissions 为空，没有可导入的权限' }
  }
  if (rawPermissions.length > PERMISSION_IMPORT_MAX_ENTRIES) {
    return {
      entries: [],
      issues: [],
      documentError: `单次最多导入 ${PERMISSION_IMPORT_MAX_ENTRIES} 条，当前 ${rawPermissions.length} 条`,
    }
  }

  const entries: PermissionImportEntry[] = []
  const issues: PermissionImportIssue[] = []
  const seen = new Set<string>()

  rawPermissions.forEach((item, position) => {
    const index = position + 1
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push({ index, key: '', reason: '条目需为对象，如 {"key": "orders:read:any"}' })
      return
    }
    const record = item as Record<string, unknown>
    const key = asString(record.key)
    const registeredBy = asString(record.registered_by) || defaultRegisteredBy
    const description = asString(record.description)

    const keyError = permissionKeyError(key)
    if (keyError) {
      issues.push({ index, key, reason: keyError })
      return
    }
    if (!registeredBy) {
      issues.push({ index, key, reason: '缺少 registered_by，且文件未提供默认值' })
      return
    }
    if (seen.has(key)) {
      issues.push({ index, key, reason: '文件内重复' })
      return
    }
    seen.add(key)
    entries.push({ key, registeredBy, description, state: knownKeys.has(key) ? 'existing' : 'new' })
  })

  return { entries, issues }
}
