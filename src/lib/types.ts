/**
 * WisePen 后端 API 类型定义。
 * 来源：WisePenCloud-AI/services/wisepen-chat-service/src/chat/schemas/* 与
 * WisePenCloud Java 各服务的 DTO（见 Docs/EndPoint）。
 */

// ============ 通用分页 ============
/** Python PageResult 用 total_page，Java PageR 用 totalPage，两种都可能出现。 */
export interface PageResult<T> {
  list: T[];
  total: number;
  page: number;
  size: number;
  total_page?: number;
  totalPage?: number;
}

// ============ Chat：Session ============
export interface TemporaryAttachmentRef {
  attachment_id: string;
  attachment_type: string;
  attachment_name: string;
  object_key: string;
  extension: string;
  file_size: number;
  mime_type?: string | null;
}

export interface ResourceAttachmentRef {
  attachment_id: string;
  attachment_type: string;
  attachment_name: string;
  resource_id: string;
  resource_type: string;
}

export interface SessionInfo {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  temporary_attachment_refs: TemporaryAttachmentRef[];
  resource_attachment_refs: ResourceAttachmentRef[];
  agent_id?: string | null;
  agent_version?: number | null;
}

/** AI SDK 6.x UIMessage（历史消息经服务端转换后即是此形状）。 */
export interface UIMessage {
  id: string;
  role: string;
  parts: UIMessagePart[];
  createdAt?: string | null;
}

export interface UIMessagePart {
  type: string; // "text" | "reasoning" | "step-start" | "tool-{toolName}" ...
  text?: string | null;
  state?: string | null;
  toolCallId?: string | null;
  input?: unknown;
  output?: unknown;
}

// ============ Chat：Completions ============
export interface FrontendState {
  key: string;
  value: unknown;
  disabled?: boolean;
}

export interface ChatRequest {
  session_id: string;
  query: string;
  model?: string | null;
  provider_id?: string | null;
  runtime_options?: Record<string, unknown>;
  frontend_states?: FrontendState[] | null;
  user_defined_attachment_ids?: string[] | null;
  user_defined_allow_tool_names?: string[] | null;
  user_defined_deny_tool_names?: string[] | null;
  user_defined_on_demand_skill_ids?: string[] | null;
  user_defined_force_enabled_skill_ids?: string[] | null;
}

// ============ Chat：SSE 事件（AI SDK 6.x UIMessage Stream） ============
export interface SseEvent {
  type: string;
  messageId?: string;
  id?: string;
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  reason?: string;
  [key: string]: unknown;
}

// ============ Chat：Attachment ============
export interface InitUploadResponse {
  attachment_id: string;
  object_key: string;
  put_url: string;
  callback_header: string;
  flash_uploaded: boolean;
}

// ============ Chat：Memory ============
export interface MemoryItem {
  id: string;
  memory: string;
  metadata: Record<string, unknown>;
}

// ============ Chat：Model / Provider ============
export type ModelScope = "SYSTEM" | "USER";
export type ModelFamily = "QWEN" | "GPT" | "CLAUDE" | "GEMINI" | "GENERIC";
export type ProviderType = "ALIBABA" | "OPENAI" | "ANTHROPIC" | "GOOGLE" | "OPENAI_COMPATIBLE";

export interface ModelProviderMapping {
  model_id: string;
  provider_id: string;
  provider_name?: string | null;
  provider_model_name: string;
  support_runtime_options: Record<string, unknown>;
  is_preferred: boolean;
  is_active: boolean;
  priority: number;
}

export interface ModelInfo {
  id: string;
  scope: ModelScope;
  display_name: string;
  type: number;
  model_family: ModelFamily;
  billing_ratio: number;
  support_thinking: boolean;
  support_vision: boolean;
  support_tools: boolean;
  context_window_tokens?: number | null;
  max_output_tokens?: number | null;
  is_active: boolean;
  mappings: ModelProviderMapping[] | null;
}

export interface AvailableModels {
  system_models: ModelInfo[];
  user_models: ModelInfo[];
}

export interface ProviderInfo {
  id: string;
  name: string;
  base_url?: string | null;
  api_key_fingerprint?: string | null;
  scope: "SYSTEM" | "USER";
  type: ProviderType;
  is_active: boolean;
  token_usage: number;
  billable_token_usage: number;
}

// ============ Chat：Tool / MCP ============
export interface ToolInfo {
  name: string;
  description: string;
  requires_config: boolean;
  configured: boolean;
  enabled: boolean;
  missing_config_keys: string[];
  config_schema: Record<string, unknown>;
  secret_fingerprints: Record<string, string>;
}

export interface UserMcpServer {
  server_id: string;
  display_name: string;
  url: string;
  enabled: boolean;
  headers: Record<string, string>;
  secret_header_fingerprints: Record<string, string>;
  enabled_tool_names: string[];
}

export type McpToolStatus = "never" | "available" | "invalid_schema";

export interface McpToolSnapshot {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  status: McpToolStatus;
}

export interface McpPreviewResult {
  status: McpToolStatus;
  error: string;
  tools: McpToolSnapshot[];
}

// ============ Chat：Speech ============
export interface SpeechCredential {
  provider: string;
  expires_at: string;
  credential: Record<string, unknown>;
}

// ============ AI Asset：Skill / Agent ============
export type AssetResourceType = "MD" | "PYTHON_SCRIPT" | "TEXT" | "JSON" | "YAML" | "TOML";

export interface AIResourceInfo {
  name: string;
  description: string;
  version: number;
  sourceType: "MANUAL" | "BY_AGENT";
}

export interface AssetInfo {
  id: string;
  name: string;
  path: string;
  objectKey: string;
  assetResourceType: AssetResourceType;
  uploadStatus: "UPLOADING" | "AVAILABLE";
  size: number;
}

export interface SkillVersionBundle {
  resourceId: string;
  version: number;
  status: "DRAFT" | "PUBLISHED";
  assets: AssetInfo[];
}

export interface SkillResourceInfoResponse {
  resourceInfo: ResourceItem;
  skillInfo: AIResourceInfo;
}

export interface AgentSpec {
  systemPrompt: string;
  autoGenerateTitle: boolean;
  modelPolicy: {
    defaultModelId: string;
    defaultProviderId: string;
    allowRequestOverride: boolean;
  };
  toolAndSkillPolicy: {
    enableUseTool: boolean;
    allowToolNames: string[];
    denyToolNames: string[];
    enableUseSkill: boolean;
    onDemandSkillIds: string[];
    forceEnabledSkillIds: string[];
  };
  memoryPolicy: {
    enableChatMemory: boolean;
    enablePersistenceChatMemory: boolean;
    enableChatMemorySummary: boolean;
    highWatermarkRatio: number;
    lowWatermarkRatio: number;
    summaryPrompt: string;
    enableLongTermMemory: boolean;
    longTermMemoryLimit: number;
    longTermMemoryScoreThreshold: number;
  };
}

export interface AgentVersionBundle {
  resourceId: string;
  version: number;
  status: "DRAFT" | "PUBLISHED";
  assets: AssetInfo[];
  spec: AgentSpec;
}

export interface AgentResourceInfoResponse {
  resourceInfo: ResourceItem;
  agentInfo: AIResourceInfo;
}

export interface AssetUploadTicket {
  assetId: string;
  path: string;
  name: string;
  objectKey: string;
  putUrl: string;
  callbackHeader: string;
  flashUploaded: boolean;
}

export interface AssetUploadInitResponse {
  resourceId: string;
  version: number;
  assetUploadTickets: AssetUploadTicket[];
}

// ============ Resource 服务 ============
export type ResourceType =
  | "NOTE"
  | "DRAWIO"
  | "PDF"
  | "DOC"
  | "DOCX"
  | "PPT"
  | "PPTX"
  | "XLS"
  | "XLSX"
  | "SKILL"
  | "AGENT"
  | string;

export interface ResourceItem {
  resourceId: string;
  resourceName: string;
  resourceType: ResourceType;
  ownerId: string;
  preview?: string;
  size?: number;
  currentActions?: string[];
  tagBinds?: Array<{
    groupId: string;
    primaryTagId: string;
    tags: Record<string, TagInfo>;
  }>;
  ownerInfo?: {
    nickname?: string;
    username?: string;
    avatar?: string;
  };
  [key: string]: unknown;
}

export interface TagInfo {
  tagName: string;
  tagDesc: string;
  tagIcon: string;
  tagColor: string;
  isPath: boolean;
  [key: string]: unknown;
}

export interface TagTreeNode extends TagInfo {
  tagId: string;
  parentId: string;
  grantedActions?: string[];
  children: TagTreeNode[];
}

export interface SearchHitItem {
  resourceId: string;
  resourceType: ResourceType;
  resourceName: string;
  highlightContent: string;
  updateTime: string;
}
