import { useMemo, useState } from "react";
import { FlaskConical, History, Plus, Send, Trash2, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
  type BadgeTone,
} from "../components/ui";
import { CodeBlock, JsonView } from "../components/JsonView";
import { requestRaw } from "../api/client";
import { SERVICE_KEYS, SERVICE_LABELS, type ServiceKey } from "../stores/settingsStore";
import { toast } from "../stores/toastStore";
import { formatDuration, formatRelativeTime } from "../lib/format";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const HTTP_METHODS: HttpMethod[] = ["GET", "POST", "PUT", "DELETE"];

const METHOD_TONES: Record<HttpMethod, BadgeTone> = {
  GET: "blue",
  POST: "green",
  PUT: "yellow",
  DELETE: "red",
};

export interface EndpointPreset {
  service: ServiceKey;
  method: HttpMethod;
  /** 服务内路径；可带 ?query，填充时会拆分到查询参数编辑器。 */
  path: string;
  label: string;
  bodyTemplate?: unknown;
}

/**
 * 端点预设目录：覆盖 Docs/EndPoint 中 chat 服务全部端点，
 * 以及 Java 侧 /skill/*、/agent/*、/resource/* 常用端点与 /auth/login。
 * body 模板字段从 src/api/chat.ts、src/api/asset.ts 的封装函数参数推断。
 */
export const ENDPOINT_PRESETS: EndpointPreset[] = [
  // ---- Chat：对话（5）----
  {
    service: "chat",
    method: "POST",
    path: "/chat/completions",
    label: "发起对话（SSE 请用对话页）",
    bodyTemplate: {
      session_id: "",
      query: "你好",
      model: null,
      provider_id: null,
      runtime_options: {},
      frontend_states: null,
      user_defined_attachment_ids: null,
      tool_selection_default_enabled: null,
      tool_selection_overrides: null,
      user_defined_on_demand_skill_ids: null,
      client_tool_capabilities: [
        {
          name: "local_debug_echo",
          description: "在 WisePen-Local 中回显一段调试文本。",
          input_schema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
            additionalProperties: false,
          },
        },
      ],
    },
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/completions/active?session_id=",
    label: "查询会话当前 active Turn",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/completions/stream?session_id=",
    label: "重连 active Turn SSE（流式交互请用对话页）",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/completions/recover",
    label: "恢复挂起对话 SSE（流式交互请用对话页）",
    bodyTemplate: {
      session_id: "",
      client_tool_results: [],
      tool_approval_status: [],
    },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/completions/cancel",
    label: "取消当前 Chat Turn",
    bodyTemplate: { session_id: "" },
  },
  // ---- Chat：Session（8）----
  {
    service: "chat",
    method: "GET",
    path: "/chat/session/listSessions?page=1&size=20",
    label: "分页查询会话列表",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/session/getSession?session_id=",
    label: "查询会话详情",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/session/createSession",
    label: "创建会话",
    bodyTemplate: { title: "新会话", agent_id: null },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/session/deleteSession?session_id=",
    label: "删除会话",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/session/renameSession?session_id=",
    label: "重命名会话",
    bodyTemplate: { new_title: "新标题" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/session/pinSession?session_id=",
    label: "置顶 / 取消置顶会话",
    bodyTemplate: { set_pin: true },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/session/setSessionAgent?session_id=",
    label: "设置会话 Agent",
    bodyTemplate: { agent_id: null },
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/session/listHistoryMessages?session_id=&page=1&size=20",
    label: "分页查询历史消息（page=1 为最新回合）",
  },
  // ---- Chat：Attachment（3）----
  {
    service: "chat",
    method: "POST",
    path: "/chat/attachment/initUploadTemporaryAttachment",
    label: "初始化临时附件上传",
    bodyTemplate: {
      session_id: "",
      filename: "example.pdf",
      extension: "pdf",
      file_size: 1024,
      md5: "",
      enable_library: false,
    },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/attachment/addResourceAttachments",
    label: "添加资源附件",
    bodyTemplate: { session_id: "", resource_ids: [] },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/attachment/deleteAttachment",
    label: "删除附件",
    bodyTemplate: { session_id: "", attachment_id: "" },
  },
  // ---- Chat：Memory（3）----
  {
    service: "chat",
    method: "GET",
    path: "/chat/memory/listMemories",
    label: "查询全部长期记忆",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/memory/deleteMemory?memory_id=",
    label: "删除单条长期记忆",
  },
  {
    service: "chat",
    method: "DELETE",
    path: "/chat/memory/deleteAllMemories",
    label: "清空长期记忆",
  },
  // ---- Chat：Model / Provider（12）----
  {
    service: "chat",
    method: "GET",
    path: "/chat/model/listAvailableModels",
    label: "查询可用模型",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/model/listUserProviders",
    label: "查询用户 Provider 列表",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/createUserProvider",
    label: "创建用户 Provider",
    bodyTemplate: {
      name: "我的 Provider",
      type: "OPENAI_COMPATIBLE",
      api_key: "",
      base_url: null,
      is_active: true,
    },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/updateUserProvider",
    label: "更新用户 Provider",
    bodyTemplate: { provider_id: "", name: "我的 Provider" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/deleteUserProvider",
    label: "删除用户 Provider",
    bodyTemplate: { provider_id: "" },
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/model/listUserModelsByProviderId?provider_id=",
    label: "按 Provider 查询用户模型",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/model/listAllUserModels",
    label: "查询全部用户模型",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/createUserModel",
    label: "创建用户模型",
    bodyTemplate: { display_name: "我的模型" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/updateUserModel",
    label: "更新用户模型",
    bodyTemplate: { model_id: "", display_name: "我的模型" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/deleteUserModel",
    label: "删除用户模型",
    bodyTemplate: { model_id: "" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/bindModelProvider",
    label: "绑定模型与 Provider",
    bodyTemplate: {
      model_id: "",
      provider_id: "",
      provider_model_name: "",
      is_preferred: true,
      is_active: true,
    },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/model/unbindModelProvider",
    label: "解绑模型与 Provider",
    bodyTemplate: { model_id: "", provider_id: "" },
  },
  // ---- Chat：Tool / MCP（10）----
  {
    service: "chat",
    method: "GET",
    path: "/chat/tool/listUserTools",
    label: "查询用户 Tool 列表",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/tool/listAvailableTools",
    label: "查询全部可用 Tool",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/tool/getUserToolConfig?tool_name=",
    label: "查询 Tool 用户配置",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/tool/updateUserToolConfig",
    label: "新增 / 更新 Tool 用户配置",
    bodyTemplate: { tool_name: "", enabled: true, config: null, secret_config: null },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/tool/deleteUserToolConfig",
    label: "删除 Tool 用户配置",
    bodyTemplate: { tool_name: "" },
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/tool/listUserMcpServers",
    label: "查询 MCP Server 列表",
  },
  {
    service: "chat",
    method: "GET",
    path: "/chat/tool/getUserMcpServer?server_id=",
    label: "查询 MCP Server 详情",
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/tool/previewUserMcpServer",
    label: "预览 MCP Server（不保存）",
    bodyTemplate: { url: "http://127.0.0.1:8000/mcp" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/tool/upsertUserMcpServer",
    label: "新增 / 更新 MCP Server",
    bodyTemplate: { url: "http://127.0.0.1:8000/mcp" },
  },
  {
    service: "chat",
    method: "POST",
    path: "/chat/tool/deleteUserMcpServer",
    label: "删除 MCP Server",
    bodyTemplate: { server_id: "" },
  },
  // ---- Chat：Speech（1）----
  {
    service: "chat",
    method: "POST",
    path: "/chat/speech/getCredential",
    label: "获取语音识别凭证",
    bodyTemplate: { provider: "IFLYTEK", options: {} },
  },
  // ---- Asset：Skill（9）----
  {
    service: "asset",
    method: "POST",
    path: "/skill/createSkill",
    label: "创建 Skill",
    bodyTemplate: {
      title: "我的 Skill",
      name: "my-skill",
      description: "",
      mountTargetTagId: "",
      sourceType: "MANUAL",
    },
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/forkSkill",
    label: "Fork Skill",
    bodyTemplate: { resourceId: "", forkedResourceVersion: 1, forkedResourceName: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/changeSkillInfo",
    label: "修改 Skill 信息",
    bodyTemplate: { resourceId: "", name: "", description: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/getSkillInfo?resourceId=&targetVersion=",
    label: "查询 Skill 详情",
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/getSkillVersionBundleInfo?resourceId=&version=",
    label: "查询 Skill 版本包信息",
  },
  {
    service: "asset",
    method: "GET",
    path: "/skill/getSkillAssetStsToken?resourceId=&targetVersion=",
    label: "获取 Skill 资产 STS Token",
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/publishSkillVersion",
    label: "发布 Skill 版本",
    bodyTemplate: { resourceId: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/initUploadSkillAssets",
    label: "初始化 Skill 资产上传",
    bodyTemplate: {
      resourceId: "",
      draftVersion: 1,
      assets: [
        { name: "SKILL.md", path: "SKILL.md", assetResourceType: "MD", md5: "", expectedSize: 0 },
      ],
    },
  },
  {
    service: "asset",
    method: "POST",
    path: "/skill/deleteSkillAssets",
    label: "删除 Skill 资产",
    bodyTemplate: { resourceId: "", draftVersion: 1, assetIds: [] },
  },
  // ---- Asset：Agent（9）----
  {
    service: "asset",
    method: "POST",
    path: "/agent/createAgent",
    label: "创建 Agent",
    bodyTemplate: {
      title: "我的 Agent",
      name: "my-agent",
      description: "",
      mountTargetTagId: "",
      sourceType: "MANUAL",
    },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/forkAgent",
    label: "Fork Agent",
    bodyTemplate: { resourceId: "", forkedResourceVersion: 1, forkedResourceName: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/changeAgentInfo",
    label: "修改 Agent 信息",
    bodyTemplate: { resourceId: "", name: "", description: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/getAgentInfo?resourceId=&targetVersion=",
    label: "查询 Agent 详情",
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/updateAgentSpec",
    label: "更新 Agent Spec",
    bodyTemplate: {
      resourceId: "",
      draftVersion: 1,
      spec: {
        systemPrompt: "你是一个有帮助的助手。",
        autoGenerateTitle: true,
        modelPolicy: { defaultModelId: "", defaultProviderId: "", allowRequestOverride: true },
        toolAndSkillPolicy: {
          enableUseTool: true,
          toolSelectionDefaultEnabled: true,
          toolSelectionOverrides: {},
          enableUseSkill: true,
          onDemandSkillIds: [],
          skillMatchTopK: 20,
        },
        memoryPolicy: {
          enableChatMemory: true,
          enablePersistenceChatMemory: true,
          enableChatMemorySummary: true,
          highWatermarkRatio: 0.8,
          lowWatermarkRatio: 0.6,
          summaryPrompt: "",
          enableLongTermMemory: true,
          longTermMemoryLimit: 100,
          longTermMemoryScoreThreshold: 0.5,
        },
      },
    },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/getAgentVersionBundleInfo?resourceId=&version=",
    label: "查询 Agent 版本包信息",
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/publishAgentVersion",
    label: "发布 Agent 版本",
    bodyTemplate: { resourceId: "" },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/initUploadAgentAssets",
    label: "初始化 Agent 资产上传",
    bodyTemplate: {
      resourceId: "",
      draftVersion: 1,
      assets: [
        { name: "agent.md", path: "agent.md", assetResourceType: "MD", md5: "", expectedSize: 0 },
      ],
    },
  },
  {
    service: "asset",
    method: "POST",
    path: "/agent/deleteAgentAssets",
    label: "删除 Agent 资产",
    bodyTemplate: { resourceId: "", draftVersion: 1, assetIds: [] },
  },
  // ---- Resource（4）----
  {
    service: "resource",
    method: "GET",
    path: "/resource/item/listResources?page=1&size=20",
    label: "分页查询资源列表",
  },
  {
    service: "resource",
    method: "GET",
    path: "/resource/tag/getTagTree",
    label: "查询标签树",
  },
  {
    service: "resource",
    method: "GET",
    path: "/resource/search/globalSearchResources?keyword=&scope=ALL&page=1&size=20",
    label: "全局搜索资源",
  },
  {
    service: "resource",
    method: "GET",
    path: "/resource/item/getResourceBaseInfo?resourceId=",
    label: "查询资源基础信息",
  },
  // ---- User（1）----
  {
    service: "user",
    method: "POST",
    path: "/auth/login",
    label: "账号密码登录",
    bodyTemplate: { account: "", password: "" },
  },
];

interface QueryPair {
  id: number;
  key: string;
  value: string;
}

interface HistoryItem {
  id: number;
  service: ServiceKey;
  method: HttpMethod;
  path: string;
  query: Record<string, string>;
  bodyText: string;
  status?: number;
  elapsedMs?: number;
  ok: boolean;
  time: number;
}

type RequestResult =
  | { kind: "ok"; status: number; body: unknown; elapsedMs: number; method: HttpMethod; path: string }
  | { kind: "error"; message: string };

let nextId = 1;

const HISTORY_LIMIT = 20;

/** 把可能带 ?query 的路径拆成纯路径与查询键值对。 */
function splitPathAndQuery(raw: string): { path: string; pairs: Array<[string, string]> } {
  const idx = raw.indexOf("?");
  if (idx < 0) return { path: raw, pairs: [] };
  return {
    path: raw.slice(0, idx),
    pairs: [...new URLSearchParams(raw.slice(idx + 1)).entries()],
  };
}

function statusTone(status: number): BadgeTone {
  if (status < 300) return "green";
  if (status < 400) return "yellow";
  return "red";
}

export default function ExplorerPage() {
  const [service, setService] = useState<ServiceKey>("chat");
  const [method, setMethod] = useState<HttpMethod>("GET");
  const [path, setPath] = useState("/chat/session/listSessions");
  const [queryPairs, setQueryPairs] = useState<QueryPair[]>([]);
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);

  /** datalist 选项：预设目录中出现过的全部 path（去重）。 */
  const presetPaths = useMemo(
    () => [...new Set(ENDPOINT_PRESETS.map((p) => p.path))],
    [],
  );

  const applyPreset = (preset: EndpointPreset) => {
    const { path: p, pairs } = splitPathAndQuery(preset.path);
    setService(preset.service);
    setMethod(preset.method);
    setPath(p);
    setQueryPairs(pairs.map(([key, value]) => ({ id: nextId++, key, value })));
    setBodyText(
      preset.bodyTemplate !== undefined ? JSON.stringify(preset.bodyTemplate, null, 2) : "",
    );
  };

  const fillFromHistory = (item: HistoryItem) => {
    setService(item.service);
    setMethod(item.method);
    setPath(item.path);
    setQueryPairs(
      Object.entries(item.query).map(([key, value]) => ({ id: nextId++, key, value })),
    );
    setBodyText(item.bodyText);
  };

  const pushHistory = (item: Omit<HistoryItem, "id" | "time">) => {
    setHistory((h) => [{ ...item, id: nextId++, time: Date.now() }, ...h].slice(0, HISTORY_LIMIT));
  };

  const updatePair = (id: number, patch: Partial<QueryPair>) => {
    setQueryPairs((pairs) => pairs.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const send = async () => {
    const rawPath = path.trim();
    if (!rawPath) {
      toast.error("请填写请求路径");
      return;
    }
    // 路径输入框里直接粘贴的 ?query 与参数编辑器合并（编辑器优先）
    const { path: cleanPath, pairs: embedded } = splitPathAndQuery(rawPath);
    const query: Record<string, string> = {};
    for (const [k, v] of embedded) {
      if (k) query[k] = v;
    }
    for (const pair of queryPairs) {
      const k = pair.key.trim();
      if (k) query[k] = pair.value;
    }

    let body: unknown;
    const bodyStr = bodyText.trim();
    if (method !== "GET" && bodyStr) {
      try {
        body = JSON.parse(bodyStr);
      } catch {
        toast.error("Body 不是合法 JSON，已中止发送");
        return;
      }
    }

    setSending(true);
    try {
      const resp = await requestRaw(service, { method, path: cleanPath, query, body });
      setResult({
        kind: "ok",
        status: resp.status,
        body: resp.body,
        elapsedMs: resp.elapsed_ms,
        method,
        path: cleanPath,
      });
      pushHistory({
        service,
        method,
        path: cleanPath,
        query,
        bodyText: bodyStr,
        status: resp.status,
        elapsedMs: resp.elapsed_ms,
        ok: resp.status < 400,
      });
    } catch (e) {
      // 网络层失败（服务未启动、连接被拒等）展示为错误卡片，不走 toast
      const message = e instanceof Error ? e.message : String(e);
      setResult({ kind: "error", message });
      pushHistory({ service, method, path: cleanPath, query, bodyText: bodyStr, ok: false });
    } finally {
      setSending(false);
    }
  };

  const rawText = useMemo(() => {
    if (result?.kind !== "ok") return null;
    const b = result.body;
    if (b && typeof b === "object" && "_text" in (b as Record<string, unknown>)) {
      const t = (b as Record<string, unknown>)._text;
      return typeof t === "string" ? t : String(t);
    }
    return null;
  }, [result]);

  return (
    <div className="flex h-full flex-col">
      {/* 顶部：请求编辑卡 */}
      <div className="shrink-0 border-b border-line px-6 py-4">
        <div className="mx-auto max-w-[1100px]">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="服务" className="w-[250px]">
                <Select
                  value={service}
                  onChange={(e) => setService(e.target.value as ServiceKey)}
                  options={SERVICE_KEYS.map((k) => ({ value: k, label: SERVICE_LABELS[k] }))}
                />
              </Field>
              <Field label="方法" className="w-[110px]">
                <Select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as HttpMethod)}
                  options={HTTP_METHODS.map((m) => ({ value: m, label: m }))}
                />
              </Field>
              <Field label="从预设填充" className="min-w-[260px] flex-1">
                {/* ui.Select 不支持 optgroup，此处用同样式原生 select 按服务分组 */}
                <select
                  className="h-9 w-full cursor-pointer rounded-lg border border-line bg-bg-elev px-2 pr-8 text-sm text-fg transition-colors focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
                  value=""
                  onChange={(e) => {
                    const preset = ENDPOINT_PRESETS[Number(e.target.value)];
                    if (preset) applyPreset(preset);
                  }}
                >
                  <option value="" disabled>
                    选择预设端点…
                  </option>
                  {SERVICE_KEYS.map((sk) => {
                    const items = ENDPOINT_PRESETS.map((p, i) => ({ p, i })).filter(
                      (x) => x.p.service === sk,
                    );
                    if (items.length === 0) return null;
                    return (
                      <optgroup key={sk} label={SERVICE_LABELS[sk]}>
                        {items.map(({ p, i }) => (
                          <option key={i} value={i}>
                            {p.label}（{p.method} {p.path}）
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </Field>
            </div>

            <div className="flex items-end gap-3">
              <Field
                label="路径"
                className="flex-1"
                hint="可粘贴带 ?query 的完整路径，发送时会与下方查询参数合并"
              >
                <Input
                  list="explorer-endpoint-paths"
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !sending) void send();
                  }}
                  placeholder="/chat/session/listSessions"
                  spellCheck={false}
                  className="font-mono"
                />
              </Field>
              <Button
                variant="primary"
                icon={<Send size={14} />}
                loading={sending}
                onClick={() => void send()}
              >
                发送
              </Button>
            </div>
            <datalist id="explorer-endpoint-paths">
              {presetPaths.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-[13px] font-medium text-fg-muted">Query 参数</span>
                <Button
                  size="xs"
                  variant="ghost"
                  icon={<Plus size={12} />}
                  onClick={() =>
                    setQueryPairs((pairs) => [...pairs, { id: nextId++, key: "", value: "" }])
                  }
                >
                  添加参数
                </Button>
              </div>
              {queryPairs.length === 0 ? (
                <div className="text-xs text-fg-faint">无查询参数</div>
              ) : (
                <div className="space-y-1.5">
                  {queryPairs.map((pair) => (
                    <div key={pair.id} className="flex items-center gap-2">
                      <Input
                        className="h-8 flex-1 font-mono text-[13px]"
                        placeholder="key"
                        value={pair.key}
                        onChange={(e) => updatePair(pair.id, { key: e.target.value })}
                        spellCheck={false}
                      />
                      <Input
                        className="h-8 flex-[2] font-mono text-[13px]"
                        placeholder="value"
                        value={pair.value}
                        onChange={(e) => updatePair(pair.id, { value: e.target.value })}
                        spellCheck={false}
                      />
                      <IconButton
                        title="删除该参数"
                        onClick={() =>
                          setQueryPairs((pairs) => pairs.filter((p) => p.id !== pair.id))
                        }
                      >
                        <X size={13} />
                      </IconButton>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Field label={method === "GET" ? "Body（JSON，GET 请求不可用）" : "Body（JSON）"}>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                disabled={method === "GET"}
                placeholder='{"key": "value"}'
                spellCheck={false}
                className="min-h-[120px] font-mono text-[12.5px]"
              />
            </Field>
          </Card>
        </div>
      </div>

      {/* 下部：响应区 + 最近请求 */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto flex max-w-[1100px] items-start gap-4 px-6 py-4">
          <div className="min-w-0 flex-1">
            {result === null ? (
              <Card>
                <EmptyState
                  icon={<FlaskConical size={28} />}
                  title="尚未发送请求"
                  description="在上方编辑请求并点击发送，这里会展示 HTTP 状态、耗时与完整响应体。"
                />
              </Card>
            ) : result.kind === "error" ? (
              <Card className="border-danger/40 p-4">
                <div className="flex items-center gap-2">
                  <Badge tone="red">网络错误</Badge>
                  <span className="text-sm font-medium text-danger">请求未送达后端</span>
                </div>
                <p className="mt-2 text-[13px] leading-5 break-all text-fg-muted">
                  {result.message}
                </p>
                <p className="mt-2 text-xs text-fg-faint">
                  请确认目标服务已启动，且设置页中的服务地址与身份凭据正确。
                </p>
              </Card>
            ) : (
              <Card>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                  <Badge tone={statusTone(result.status)}>HTTP {result.status}</Badge>
                  <Badge tone="gray">{formatDuration(result.elapsedMs)}</Badge>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted">
                    {result.method} {result.path}
                  </span>
                </div>
                <div className="p-4">
                  {rawText !== null ? (
                    <CodeBlock text={rawText} maxHeight={520} />
                  ) : (
                    <JsonView data={result.body} defaultExpandDepth={3} />
                  )}
                </div>
              </Card>
            )}
          </div>

          <Card className="w-[280px] shrink-0">
            <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                <History size={14} className="text-fg-muted" />
                最近请求
              </div>
              {history.length > 0 && (
                <IconButton title="清空最近请求" onClick={() => setHistory([])}>
                  <Trash2 size={13} />
                </IconButton>
              )}
            </div>
            <div className="max-h-[480px] overflow-y-auto p-1.5">
              {history.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-fg-faint">
                  发送请求后会记录在这里（最多 {HISTORY_LIMIT} 条），点击可回填表单
                </div>
              ) : (
                history.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => fillFromHistory(item)}
                    title="点击回填表单"
                    className="w-full cursor-pointer rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-bg-hover"
                  >
                    <div className="flex items-center gap-1.5">
                      <Badge tone={METHOD_TONES[item.method]}>{item.method}</Badge>
                      <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg">
                        {item.path}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-2 pl-0.5 text-[11px] text-fg-faint">
                      <span>
                        {item.status !== undefined ? (
                          <span className={item.ok ? "text-success" : "text-danger"}>
                            HTTP {item.status}
                          </span>
                        ) : (
                          <span className="text-danger">网络错误</span>
                        )}
                        {item.elapsedMs !== undefined && ` · ${formatDuration(item.elapsedMs)}`}
                      </span>
                      <span className="shrink-0">{formatRelativeTime(item.time)}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
