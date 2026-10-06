/**
 * Mirrors the backend permission-key grammar (`internal/domain/permission.go`).
 * `resource` must start with a lowercase letter; `action` and `scope` accept the
 * `*` wildcard. `iam` keys are constrained to `:any`, plus `:team` for the four
 * team-scoped areas, so `iam:*:*` is rejected by the service.
 */

const RESOURCE_PATTERN = /^[a-z][a-z0-9_.-]*$/
const ACTION_PATTERN = /^[a-z][a-z0-9_-]*$/
const SCOPES = ['own', 'team', 'any', '*']
const TEAM_SCOPED_AREAS = ['teams', 'groups', 'roles', 'bindings']

/**
 * Validates a serialized permission key (`!` deny prefix allowed) and returns a
 * user-facing reason, or `null` when the service would accept it.
 */
export function permissionKeyError(key: string): string | null {
  const trimmed = key.trim()
  if (trimmed === '') {
    return '请输入权限 key'
  }
  let body = trimmed
  if (body.startsWith('!')) {
    body = body.slice(1)
    if (body === '') {
      return '! 后需要跟权限 key'
    }
  }
  const parts = body.split(':')
  if (parts.length !== 3) {
    return '需符合 resource:action:scope 三段格式'
  }
  const [resource, action, scope] = parts
  if (resource === '*') {
    return 'resource 段不支持通配符（服务端要求以小写字母开头）'
  }
  if (!RESOURCE_PATTERN.test(resource)) {
    return 'resource 段需以小写字母开头，仅含小写字母、数字、_ . -'
  }
  if (action !== '*' && !ACTION_PATTERN.test(action)) {
    return 'action 段需为 * 或小写字母开头的标识（小写字母、数字、_ -）'
  }
  if (!SCOPES.includes(scope)) {
    return 'scope 段需为 own、team、any 或 *'
  }
  if (resource === 'iam') {
    if (scope === 'any') {
      return null
    }
    if (TEAM_SCOPED_AREAS.includes(action) && scope === 'team') {
      return null
    }
    return 'iam 权限只支持 :any，或 teams/groups/roles/bindings 的 :team'
  }
  return null
}

/** Wildcard variants worth offering for a resource, in backend-accepted order. */
export function wildcardSuggestions(resource: string): string[] {
  const base = RESOURCE_PATTERN.test(resource) ? resource : ''
  if (base === '') {
    return []
  }
  if (base === 'iam') {
    return ['iam:*:any']
  }
  return [`${base}:*:any`, `${base}:*:team`, `${base}:*:*`, `${base}:*:own`]
}
