# 智慧教室管理平台前端 — 技术文档

## 一、技术栈

- 构建工具：Vite 7
- 框架：Vue 3（组合式 API）+ TypeScript ~5.9
- 路由：Vue Router 4（history 模式，全部子路径为前端路由）
- 状态管理：Pinia 3
- UI 组件：Element Plus 2 + @element-plus/icons-vue（简体中文语言包）
- HTTP 客户端：Axios（统一拦截器、token 刷新重放、problem+json 错误规范化）
- 日期处理：dayjs

## 二、环境要求

- Node.js ≥ 20（推荐 24）
- pnpm ≥ 9
- 可访问的 teamusers 身份认证服务（IAM 后端）
- 可访问的 smartclass-dispatchub 录播调度服务（控制台依赖，未部署时「录播调度」页面会报上游不可用）
- 可访问的 nsc-filehouse 文件服务（控制台依赖，未部署时「文件服务」页面会报服务不可用）

## 三、启动方法

1. 安装依赖并启动开发服务器（默认 http://localhost:5173）：

   ```sh
   pnpm install
   pnpm dev
   ```

2. 开发模式下前端将 `/iam-api` 开头的请求代理到 IAM 后端，默认目标为 `http://127.0.0.1:8080`；`/dispatch-api` 开头的请求代理到录播调度服务，默认目标为 `http://127.0.0.1:8081`；`/file-api` 开头的请求代理到文件服务，默认目标为 `http://127.0.0.1:8095`。后端在其他地址时通过环境变量覆盖：

   ```sh
   # Windows (cmd)
   set IAM_ORIGIN=http://192.168.1.10:8080 && set DISPATCH_ORIGIN=http://192.168.1.10:8081 && set FILE_ORIGIN=http://192.168.1.10:8095 && pnpm dev

   # Linux / macOS
   IAM_ORIGIN=http://192.168.1.10:8080 DISPATCH_ORIGIN=http://192.168.1.10:8081 FILE_ORIGIN=http://192.168.1.10:8095 pnpm dev
   ```

   文件服务的后端地址也可以用 `VITE_FILE_BASE` 指定（`FILE_ORIGIN` 未设置时生效），这样开发代理与生产构建共用同一个变量：

   ```sh
   VITE_FILE_BASE=http://192.168.1.10:8095 pnpm dev
   ```

3. 生产构建与本地预览：

   ```sh
   pnpm build
   pnpm preview
   ```

## 四、部署指南

1. 执行 `pnpm build`，产物输出到 `dist/` 目录，为纯静态文件。

2. 将 `dist/` 托管到任意静态文件服务器。因路由使用 history 模式，服务器需配置 SPA 回退：所有未命中的路径返回 `index.html`。

3. 前端默认以相对路径 `/iam-api` 调用 IAM 后端、以 `/dispatch-api` 调用录播调度服务、以 `/file-api` 调用文件服务（三者都保留服务自身的路径，如 `/api/v1`、`/healthz`），静态服务器需将三个前缀分别反向代理到对应服务（并去掉前缀）。nginx 参考配置：

   ```nginx
   server {
       listen 80;
       server_name smartclass.example.com;
       root /var/www/smartclass-web/dist;
       index index.html;

       location /iam-api/ {
           proxy_pass http://127.0.0.1:8080/;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       location /dispatch-api/ {
           proxy_pass http://127.0.0.1:8081/;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       location /file-api/ {
           proxy_pass http://127.0.0.1:8095/;
           proxy_set_header Host $host;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       }

       location / {
           try_files $uri $uri/ /index.html;
       }
   }
   ```

4. 若不便配置反向代理，也可在构建时通过 `VITE_IAM_BASE`、`VITE_DISPATCH_BASE`、`VITE_FILE_BASE` 环境变量让前端直连后端地址（要求后端允许跨域）：

   ```sh
   VITE_IAM_BASE=https://iam.example.com VITE_DISPATCH_BASE=https://dispatch.example.com VITE_FILE_BASE=https://files.example.com pnpm build
   ```

   三个变量分别覆盖 IAM、录播调度与文件服务（nsc-filehouse）的后端基址；文件服务仍按服务自身的路径调用（`/api/v1/...`、`/presign/...`、`/healthz`），未设置时使用同源前缀 `/iam-api`、`/dispatch-api`、`/file-api`。

5. teamusers 后端的部署与初始管理员引导见其官方文档：https://crazy4chicken.github.io/nsc-teamusers/
6. 录播调度的接口与权限说明见其官方文档：https://crazy4chicken.github.io/smartclass-dispatchub/
