import { isApiError } from '@/api/http'

/**
 * Stable `detail` codes (and the fallback titles) returned as problem+json,
 * mapped to user-facing Simplified Chinese messages.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: '凭证无效或已过期',
  // nsc-filehouse classifies why it rejected a bearer token (`invalid_token*`).
  invalid_token_missing: '请求未携带访问令牌',
  invalid_token_malformed: '访问令牌格式不正确',
  invalid_token_expired: '访问令牌已过期',
  invalid_token_audience: '访问令牌不适用于该服务',
  invalid_token_issuer: '访问令牌的签发方不被该服务信任',
  invalid_token_signature: '访问令牌签名校验失败',
  invalid_token_claims: '访问令牌的声明不合法',
  invalid_token_jwks: '鉴权服务不可用（服务无法获取 JWKS）',
  weak_password: '密码强度不足',
  account_locked: '账号已锁定',
  account_pending: '账号待审核',
  insufficient_permissions: '权限不足',
  'authentication failed': '认证失败',
  'authentication temporarily busy': '服务繁忙请稍后重试',
  password_change_required: '需要修改密码',
  mfa_not_enrolled: '未注册 MFA',
  idempotency_conflict: '请求冲突',
  invalid_credentials: '用户名或密码错误',
  email_not_verified: '邮箱未验证',
  email_taken: '邮箱已被使用',
  invalid_email: '邮箱格式不正确',
  mfa_enrollment_denied: 'MFA 注册被拒绝',
  step_up_required: '需要重新验证身份',
  registration_closed: '注册功能已关闭',
  totp_already_enabled: '已启用 TOTP',
  oidc_not_configured: '未配置 OIDC 登录',
  oidc_link_refused: 'OIDC 账号绑定被拒绝',
  idempotency_in_progress: '请求正在处理中',
  unsupported_field: '不支持的字段',
  not_ready: '服务未就绪',
  'authentication service unavailable': '认证服务不可用',
  'authorization service unavailable': '授权服务不可用',
  'the requested resource was not found': '请求的资源不存在',
  'the requested user was not found': '请求的用户不存在',
  'the requested passkey was not found': '请求的通行密钥不存在',
  'the resource already exists': '资源已存在',
  'username or email already exists': '用户名或邮箱已存在',
  'email is already in use': '邮箱已被使用',
  'account is not invited': '账号未被邀请',
  'condition could not be compiled': '条件表达式无法编译',
  'invalid WebAuthn response': 'WebAuthn 响应无效',
  'email change is not supported': '不支持修改邮箱',
  'the target user is not eligible for impersonation': '目标用户不可被假冒',
  'the target user must be active': '目标用户必须处于正常状态',
  'service accounts cannot be impersonated': '服务账号不可被假冒',
  'authentication is required': '登录状态已失效，请重新登录',
  'permission denied': '权限不足',
  invalid_request: '请求参数不合法',
  internal_error: '服务内部错误',
  term_not_found: '学期不存在',
  periods_not_configured: '该学期未配置节次表',
  room_not_bound: '教室未绑定设备',
  room_has_history: '教室已有课表或场次历史，无法解绑，请改为停用',
  device_not_found: '设备不存在',
  session_not_found: '场次不存在',
  session_not_planned: '当前状态不支持开始录制',
  already_streaming: '该设备已在推流',
  device_offline: '设备离线',
  no_active_stream: '没有正在进行的录制',
  upstream_unavailable: '上游服务不可用（webcam-server 或数据库）',
  duplicate_idempotency_key: '重复的幂等键',
  duplicate_import: '同一文件已导入过，确认无误可勾选强制提交',
  import_validation_failed: '课表校验失败',
  session_collision: '与既有录制场次冲突（同机位时间段重叠）',
  invalid_bucket_name: '桶名不合法',
  invalid_key: '对象键不合法',
  bucket_not_found: '桶不存在',
  bucket_exists: '桶已存在',
  bucket_not_empty: '桶非空，请先删除其中的对象',
  object_not_found: '对象不存在',
  upload_not_found: '分片上传不存在',
  upload_expired: '分片上传已过期',
  payload_too_large: '请求体过大',
  checksum_mismatch: '校验和不匹配',
  quota_exceeded: '配额不足',
  part_mismatch: '分片数据不一致',
  presign_invalid: '预签名链接无效',
  presign_expired: '预签名链接已过期',
  iam_unavailable: '鉴权服务不可用',
  service_unavailable: '服务不可用',
}

/** Maps any thrown value to a Simplified Chinese message for `ElMessage.error`. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) {
    return '网络错误'
  }
  if (error.status === 0) {
    return '网络错误'
  }
  const detail = error.detail.trim()
  const title = error.title.trim()
  return ERROR_MESSAGES[detail] || ERROR_MESSAGES[title] || title || detail || `请求失败（HTTP ${error.status}）`
}
