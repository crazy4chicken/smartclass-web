# 录播调度导航修复（hub nav denied fix）实施规划

> **实施结果（2026-10-07，已落地）：** 根因分析与 Task 1/4/5 的思路已采纳，但**拒绝方式改为「完全不跳转」**——
> 守卫对任何授权失败都不再导航：已在页面上时弹明确错误并原地停留，硬加载被拒 URL 时在同一 URL 渲染
> 拒绝页（`src/components/RouteDenied.vue` + `src/composables/useRouteDenial.ts`，由 `App.vue` 挂载）。
> 因此 **Task 2/3 的 `/hub/denied` 路由方案作废**（它仍是一次跳转，已明令禁止）；`permissionsError` 标志
> 也不再需要：权限集未知（读取中或失败）时一律不过滤导航（`AppLayout.visibleSections`），失败另弹
> 明确告警。Task 5 的 15s 默认超时按原样落地。本文件保留为根因记录，请勿按 Task 2/3 实施。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复"点击录播调度无反应 / 被弹回身份与访问管理"的导航缺陷，并补齐同类隐患（侧栏过滤偏差、axios 无超时）。

**Architecture:** 路由守卫对 `/hub` 的权限判定失败时，不再把用户弹回 IAM 区域，而是留在区域内渲染一个"无权限"说明页（与 23acc27 "页面可达、就地报错"的既有哲学一致）；侧栏在权限集读取失败时保持全部可见（兑现注释已承诺的行为）；所有 HTTP 客户端补默认超时，消除守卫被挂起请求卡死的可能。

**Tech Stack:** Vue 3 + vue-router 4 + Pinia + Element Plus + axios + Vite 7。

---

## 根因分析（调查结论，2026-10-07）

### 症状与代码路径的对应

点击顶栏"录播调度" → `router.push('/hub')`（`src/layouts/AppLayout.vue` L181）→ 守卫 hub 分支
（`src/router/index.ts` L250-267）→ `firstAllowedHubPath(auth)` 基于 `/me/permissions` 返回的
`dispatch:*` 键求首个可用页 → **返回 `null` 时整条链路退化为 `return { path: firstAllowedIamPath(auth) }`**（L259-261）：

| 出发页面 | 表现 | 对应报告症状 |
| --- | --- | --- |
| `/iam/users`（首个有权 IAM 页） | 重定向回当前页，URL 不变 | "在身份与访问管理页面点击无反应" |
| `/file/*` 等其它区域 | 重定向到 `/iam/users` | "在其余页面点击跳转到身份与访问管理" |

两个症状是**同一个根因的两种视角**：`firstAllowedHubPath()` 返回 null。

### 为什么 Windows 正常、macOS 出事（三个候选，均产生同样症状）

| # | 场景 | 当前代码状态 |
| --- | --- | --- |
| a | macOS 部署上 `GET /iam-api/me/permissions` **快速失败**（反向代理未配 `/iam-api` 前缀 / CORS / IAM 未启动） | **已被 23acc27 修复**：守卫留在 `/hub`，页面就地报错 |
| b | 权限读取**成功**但该账号没有任何 `dispatch:*` 键（macOS 环境 IAM 库的绑定/策略与本地 Windows 不同） | **未修复**：守卫仍弹回 IAM——这是当时有意保留的行为，但 UX 上就是报告的 bug |
| c | `/iam-api` 请求**挂起**（防火墙丢包等）：三个 axios client 均无 timeout，守卫 `await fetchPermissions()` 永不返回 | **未修复**：点击后无限期"无反应"，23acc27 管不到 |

**现场判别（用户在 macOS 上执行一次即可）**：浏览器 DevTools → Network → 点"录播调度" → 看
`/iam-api/me/permissions`：请求失败/长期 pending → 场景 a/c；成功但响应 `permissions` 数组里没有
`dispatch:` 开头的键 → 场景 b。

### 顺带发现的其他问题

1. **文档-代码偏差**：`AppLayout.vue` L147-149 注释称 "Sidebar stays unfiltered on failure"，实际
   `visibleSections` 在权限集为空时把所有受控 section 全部隐藏（`hasGrant` 全 false）→ 守卫放进
   `/hub` 后侧栏却是空栏。
2. **axios 无超时**：`http.ts` 三个 client 与 `performRefresh` 的裸 `axios.post` 都没配 timeout。
3. **CRLF 噪音**：仓库无 `.gitattributes`，Windows 检出使 104 个文件相对 HEAD 全量 diff
   （已核实 `git diff --ignore-cr-at-eol` 为空，工作区与 HEAD 内容一致）。

---

## Task 1: 权限读取失败标志（store）

**Files:**
- Modify: `src/stores/auth.ts`

**Step 1: 增加 `permissionsError` 状态**

```ts
const permissionsLoaded = ref(false)
const permissionsError = ref(false)
```

`fetchPermissions` 改为：

```ts
async function fetchPermissions(): Promise<string[]> {
  permissionsError.value = false
  try {
    const { data } = await http.get<MePermissionsResponse>('/me/permissions')
    permissions.value = data.permissions
    permissionsLoaded.value = true
    return data.permissions
  } catch (error) {
    permissionsError.value = true
    throw error
  }
}
```

`clear()` 中追加 `permissionsError.value = false`。return 对象追加 `permissionsError`。

**Step 2: 验证** `pnpm build`（vue-tsc）通过。

## Task 2: 无权限说明页（HubDeniedView）

**Files:**
- Create: `src/features/hub/views/HubDeniedView.vue`
- Modify: `src/features/hub/routes.ts`（追加 denied 路由，无 `actions` meta，不进侧栏表）

```ts
{
  path: 'denied',
  name: 'hub-denied',
  component: () => import('@/features/hub/views/HubDeniedView.vue'),
  meta: { title: '无权限' },
},
```

组件（Element Plus `el-result`，与 ServicePlaceholder 的空态风格同级）：

```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'

const router = useRouter()
</script>

<template>
  <el-result
    class="hub-denied"
    icon="warning"
    title="没有录播调度权限"
    sub-title="当前账号未获得任何 dispatch:* 授权，无法进入录播调度控制台。如需开通，请联系管理员在身份与访问管理中为该账号绑定包含 dispatch 权限的角色。"
  >
    <template #extra>
      <el-button type="primary" @click="router.push('/iam')">返回身份与访问管理</el-button>
    </template>
  </el-result>
</template>

<style scoped>
.hub-denied {
  padding-top: 8vh;
}
</style>
```

**Step: 验证** build 通过。

## Task 3: 守卫 hub 分支改为"区域内拒绝"

**Files:**
- Modify: `src/router/index.ts` L250-267

```ts
if (to.path === '/hub' || to.path.startsWith('/hub/')) {
  // The in-area "no permission" page is reachable by design, even while the
  // grant set is still unknown - otherwise it could never explain anything.
  if (to.path === '/hub/denied') {
    return true
  }
  if (!auth.permissionsLoaded) {
    await auth.fetchPermissions().catch(() => undefined)
  }
  if (!auth.permissionsLoaded) {
    // The grant set could not be read (service unreachable). Keep the page and let it
    // surface the API error instead of bouncing the user into another area.
    return true
  }
  const allowed = firstAllowedHubPath(auth)
  if (!allowed) {
    // No dispatch grant at all: stay inside the area and explain why instead of
    // silently bouncing the operator back into the IAM console.
    return { path: '/hub/denied' }
  }
  // ...（后续不变）
}
```

注：`firstAllowedIamPath` 仍被 `/iam` 索引与 IAM 区域检查使用，保留。

**Step: 验证** build 通过。

## Task 4: 侧栏过滤兑现"失败不过滤"

**Files:**
- Modify: `src/layouts/AppLayout.vue` `visibleSections`（L117-128）

```ts
const visibleSections = computed(() =>
  activeSections.value.filter((section) => {
    if (auth.permissionsError && !auth.permissionsLoaded) {
      // Unreadable grant set: keep navigation usable; pages surface their own errors.
      return true
    }
    if (section.areas) {
      return section.areas.some((area) => auth.hasIamArea(area))
    }
    const { system, actions } = section
    if (system !== undefined && actions !== undefined) {
      return actions.some((action) => auth.hasGrant(system, action))
    }
    return true
  }),
)
```

未加载完成（无错误）时维持隐藏，避免首屏闪烁；仅"已尝试且失败"时放开。

**Step: 验证** build 通过。

## Task 5: axios 默认超时

**Files:**
- Modify: `src/api/http.ts`

```ts
/** Default request timeout; a black-holed proxy must not freeze the router guard. */
const DEFAULT_TIMEOUT_MS = 15_000

function createClient(baseURL: string): AxiosInstance {
  const instance = axios.create({ baseURL, timeout: DEFAULT_TIMEOUT_MS })
  // ...
}
```

`performRefresh` 的裸 post 同样加 `{ timeout: DEFAULT_TIMEOUT_MS }`。

**Step: 验证** build 通过。

## Task 6: 端到端验证（mock 后端 + 无头浏览器）

无测试基建（无 vitest），以浏览器级实测替代：

1. `corepack enable && pnpm install && pnpm build`。
2. 起 mock IAM（node:http）：`/auth/login` 发 token、`/me` 发 profile、
   `/me/permissions` 按 env 剧本返回：`NONE`（无 dispatch 键）/ `FAIL`（500）/ `OK`（`dispatch:read`）。
3. `vite preview`（preview 继承 `server.proxy`）+ agent-browser 无头实测：

| 剧本 | 操作 | 期望 |
| --- | --- | --- |
| NONE | 在 `/iam/users` 点"录播调度" | URL=`/hub/denied`，显示无权限说明（不再"无反应"） |
| NONE | 在 `/file/usage` 点"录播调度" | URL=`/hub/denied`（不再弹回 IAM） |
| FAIL | 点"录播调度" | 落在 `/hub/sessions`，页面报 API 错误，侧栏显示全部 hub section |
| OK | 点"录播调度" | 落在 `/hub/sessions`（dispatchub 缺席时页面报上游错误，URL 不变） |

4. 记录实测截图/URL 证据，随交付物给出。

## 待用户拍板（不阻塞 Task 1-5）

- **Q1（推荐：做）**：顶栏"录播调度"按钮在"权限已加载且无任何 dispatch 授权"时是否隐藏？
  推荐隐藏（从源头消除无效点击；直接输入 URL 仍会落到 denied 页）。
- **Q2（推荐：加）**：是否补 `.gitattributes`（`* text=auto`）统一 LF，消除 Windows 检出的 104 文件假 diff？
- **Q3（默认 15s）**：axios 默认超时取值是否接受？dispatchub 大列表（limit=500）也在该阈值内。
