# 权限批量导入 JSON 规范

「身份与访问管理 → 权限」页面右上角的**批量导入 JSON**按钮接受本文档描述的 JSON 文件。
文件**只在前端解析与校验**（不上传），校验通过的条目再由前端逐条调用
`POST /permissions/`（`teamusers` 的注册/更新接口）写入。

- 解析与校验实现：`src/features/permissions/import.ts`
- key 语法校验：`src/features/permissions/grammar.ts`（与后端 `internal/domain/permission.go` 一致）

## 一、文件结构

顶层为**对象**（推荐）或直接为该对象里的 `permissions` **数组**：

```json
{
  "version": 1,
  "registered_by": "orders-service",
  "permissions": [
    { "key": "orders:read:any", "description": "查看全部订单" },
    { "key": "orders:manage:team", "registered_by": "orders-admin", "description": "管理本团队订单" }
  ]
}
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `version` | 否 | 规范版本号。当前只支持 `1`；填写其他值整份文件会被拒绝（不填按 `1` 处理）。 |
| `registered_by` | 否 | 文件级默认注册方；条目未写 `registered_by` 时使用它。 |
| `permissions` | 是 | 条目数组，1 ~ 1000 条。 |

数组简写（顶层直接为数组）等价于只写 `permissions`：

```json
[
  { "key": "orders:read:any", "registered_by": "orders-service" }
]
```

### 条目字段

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `key` | 是 | 权限 key，遵循下面的语法。 |
| `registered_by` | 条件 | 注册方名称。条目未提供时取文件级 `registered_by`；两者都没有则该条目无效。 |
| `description` | 否 | 权限用途说明，缺省为空字符串。 |

## 二、权限 key 语法

`resource:action:scope`，可加前缀 `!` 表示**拒绝**（deny）：

- `resource`：以小写字母开头，仅含小写字母、数字、`_`、`.`、`-`；**不支持 `*`**。
- `action`：`*`，或以小写字母开头，仅含小写字母、数字、`_`、`-`。
- `scope`：`own`、`team`、`any`、`*` 之一。
- `iam` 资源受限：只允许 `:any`（例如 `iam:users:any`），或 `teams`/`groups`/`roles`/`bindings` 四个域的 `:team`；`iam:*:*` 会被服务端拒绝。

合法示例：`orders:read:any`、`orders:*:team`、`cam:manage:any`、`!orders:read:own`。

## 三、校验与导入行为

1. 选中文件后，前端读取全部已注册权限（分页走完）用于区分**新增**与**更新**。
2. 逐条校验：JSON 结构、key 语法、注册方是否具备、文件内是否重复。
3. 弹窗展示预览：有效条目（标注 新增/更新）与无效条目（行号 + 原因）。
   **无效条目不会被导入**，修正后单独再导入这些条目即可。
4. 点击「确认导入」后按文件顺序逐条调用注册接口（注册是 upsert，已存在的 key 会被更新），
   过程中显示进度；结束后给出成功/失败统计，失败项列出 key 与原因，并刷新列表。

整份文件被拒绝的情形（此时不会打开预览，直接报错）：

- 不是合法 JSON；
- 顶层既不是对象也不是数组，或对象缺少 `permissions` 数组；
- `permissions` 为空，或超过 1000 条；
- `version` 不为 `1`。

## 四、示例文件

```json
{
  "version": 1,
  "registered_by": "orders-service",
  "permissions": [
    { "key": "orders:read:any", "description": "查看全部订单" },
    { "key": "orders:read:team", "description": "查看本团队订单" },
    { "key": "orders:read:own", "description": "查看自己的订单" },
    { "key": "orders:manage:any", "description": "管理全部订单" },
    { "key": "orders:manage:team", "description": "管理本团队订单" },
    { "key": "orders:*:any", "description": "订单服务的全部动作（any 作用域）" }
  ]
}
```

导入结果：6 条全部有效；若其中某些 key 已注册，则状态显示为「更新」而不是「新增」。
