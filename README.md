# WisePen Local

WisePen 本地调试与使用工作台。Tauri 2 + React 19 + TypeScript + Vite 7 + Tailwind CSS 4，直连本地运行的 WisePen 后端服务（Python `wisepen-chat-service` 与 Java 各微服务），不经过网关。

## 功能

- **对话**：会话管理（新建/重命名/置顶/删除）、SSE 流式对话（AI SDK 6.x UIMessage Stream）、思考过程折叠展示、**工具调用的输入/输出/耗时/原始 SSE 帧检视**、请求参数面板（模型与 Provider 映射、按需 Skill、工具黑白名单、`frontend_states` 上下文模拟、`runtime_options`）、临时附件上传（OSS 预签名）与资源附件引用、历史消息全部经 `listHistoryMessages` 端点读取（无本地存储）。
- **Skill 工坊**：Skill 的创建、信息修改、草稿/已发布版本查询、资产（SKILL.md + references）在线编写/导入/上传/删除、发布、Fork。
- **Agent 配置**：Agent 的创建/Fork/发布、Spec（systemPrompt/模型策略/工具与 Skill 策略/记忆策略）编辑、资产管理。
- **模型与 Provider**：可用模型与映射查看、用户模型与 Provider 的完整 CRUD、绑定/解绑。
- **工具与 MCP**：内置工具启停与配置（含密钥项）、用户 MCP Server 的增删改查与在线预览。
- **长期记忆**：查看、单条删除、清空。
- **资源浏览**：标签树筛选、类型筛选、全局搜索、资源详情。
- **端点探索器**：60+ 预设端点 + 任意手工请求，覆盖 Docs/EndPoint 全部端点，含最近请求历史。
- **设置**：各服务地址与身份凭据管理、连通性测试、从本地配置文件 `wisepen-local.config.json`（已 gitignore）一键导入、浅色/深色主题。

## 运行

```bash
pnpm install
pnpm tauri dev
```

使用前在「设置」页填写 `X-From-Source` 与 `X-User-Id`（值见 `Docs/DevEnv/微服务调试指南.md`）；或复制 `wisepen-local.config.example.json` 为 `wisepen-local.config.json`（已 gitignore，不提交）填写后一键导入。后端服务需先启动（见仓库根 `run.txt` 与 `Docs/DevEnv`）。

## 架构与约定

见 [AGENTS.md](./AGENTS.md)。要点：所有后端 HTTP 经 Rust 代理层（`src-tauri/src/`）转发以绕开 WebView CORS；SSE 在 Rust 侧解析后经 Channel 推送；前端只走 `src/api/` 封装；样式只用主题令牌。
