# WisePen-Local

WisePen 本地调试与使用工作台：Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind CSS 4 + zustand。
直连本地运行的 Python（wisepen-chat-service :9200）与 Java（ai-asset :19910、resource :19905 等）后端服务。

## 运行

```bash
pnpm install
pnpm tauri dev        # 开发（自动起 Vite + Tauri 窗口）
pnpm build            # 前端类型检查 + 产物构建
cd src-tauri && cargo test   # Rust 单元测试
```

首次使用：复制 `wisepen-local.config.example.json` 为 `wisepen-local.config.json`（已 gitignore，含凭据不提交）填写，在设置页「从配置文件导入」。

## 架构

- **Rust 代理层（src-tauri/src/）**：所有后端 HTTP 请求经 reqwest 转发，绕开 WebView CORS。
  - `http.rs` — `rest_request` 通用 REST 命令（返回 `{status, body, elapsed_ms}`）。
  - `sse.rs` — `chat_completion`：POST /chat/completions SSE 流，按帧解析后经 `Channel<StreamFrame>` 推送；`abort_chat` 中断。
  - `fsutil.rs` — `read_text_file` / `file_stat` / `file_md5` / `text_md5` / `oss_put_text` / `oss_put_file`（OSS 预签名上传）。
- **前端（src/）**：
  - `api/client.ts` — `request<T>(service, {method, path, query, body})`：注入身份头、解包 `R<T>`，错误抛 `ApiError`。`requestRaw` 不解包（探索器用）。
  - `api/chat.ts`（Python /chat 全端点）、`api/asset.ts`（Java /skill/* /agent/*）、`api/resource.ts`、`api/sse.ts`（`startChatCompletion(body, handlers)` → requestId）。
  - `lib/types.ts` — 全部 API 类型；`lib/format.ts` 格式化工具；`lib/cn.ts` className 合并。
  - `stores/settingsStore.ts` — 连接与凭据（localStorage 持久化，**凭据绝不写入仓库**）。
  - `stores/chatStore.ts` — 会话/历史/实时回合（SSE 事件经 `applySseEvent` 归约）。
  - `components/ui.tsx` — 设计系统原语（Button/Card/Input/Select/Switch/Badge/Field/Tabs/Modal 在 `components/Modal.tsx` 等）。

## 约定

- **样式**：只用 Tailwind 类 + CSS 变量令牌（`bg-bg`、`bg-bg-elev`、`text-fg`、`text-fg-muted`、`border-line`、`bg-accent`、`text-danger` 等，定义见 `src/index.css`）。**不要写死颜色**（如 `text-gray-500`、`bg-white`），深色主题靠令牌切换。不用 `dark:` 变体。
- **UI 组件**：优先复用 `components/ui.tsx`、`Modal.tsx`、`JsonView.tsx`（JsonView/CodeBlock）、`Markdown.tsx`、`toast`（`stores/toastStore.ts`）。不引入新的组件库。
- **HTTP**：页面一律走 `api/` 模块封装，不直接 `invoke("rest_request")`（探索器页除外）。
- **请求/响应字段**：严格对照 `lib/types.ts`；Java 服务响应同样是 `{code, msg, data}` 信封，`request()` 已统一解包。分页 `PageResult<T>` 的 `list/total` 两服务一致，`total_page`/`totalPage` 并存。
- **TypeScript**：strict；不引入新依赖（确有需要先记录原因）；组件用函数组件 + Hooks。
- **页面结构**：`pages/XxxPage.tsx` 默认导出；页面私有组件放 `components/<域>/` 目录。
- **凭据与密钥**：来自 settingsStore；密钥类输入（api_key、secret_config、secret_headers）只在表单中收集、提交给后端，不回显（后端只返回指纹）。

## 后端要点

- 身份头：`X-From-Source`（错误→404）、`X-User-Id`；Java 服务另加 `X-Identity-Type`、`X-Group-Role-Map`；灰度 `developer`、`X-Developer`（`client.ts: buildHeaders` 已处理）。
- SSE 为 AI SDK 6.x UIMessage Stream：`text-delta` / `reasoning-delta` / `tool-input-start|available` / `tool-output-available` / `error` / `finish` / `[DONE]`，工具输入输出整包下发，无 `data-*` 帧。
- 历史消息：`GET /chat/session/listHistoryMessages`（page=1 最新回合），返回即 UIMessage 形状；**对话历史只从端点读取，不做本地持久化**。
- Skill 发布流程：`createSkill` → `getSkillInfo` → `initUploadSkillAssets`（需每资产 md5+expectedSize）→ 对非 `flashUploaded` 的 ticket 执行 `oss_put_text` → `getSkillVersionBundleInfo?version=草稿号` 确认 → `publishSkillVersion`。
- `POST /chat/completions` 请求体中模拟前端上下文的字段是 `frontend_states`（`{key, value, disabled?}`），不是 `states`。
