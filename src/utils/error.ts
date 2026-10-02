import { isApiError } from '@/api/http'

/**
 * Stable `detail` codes (and the fallback titles) returned as problem+json,
 * mapped to user-facing Simplified Chinese messages.
 */
const ERROR_MESSAGES: Record<string, string> = {
  invalid_token: '凭证无效或已过期',
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
