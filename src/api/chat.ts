import { get, post, del, request } from "./client";
import type {
  AvailableModels,
  InitUploadResponse,
  MemoryItem,
  ModelInfo,
  PageResult,
  ProviderInfo,
  ProviderType,
  SessionInfo,
  SpeechCredential,
  ToolInfo,
  UIMessage,
  UserMcpServer,
  McpPreviewResult,
} from "../lib/types";

/** wisepen-chat-service（Python，/chat 前缀）的全部业务端点。 */
export const chatApi = {
  // ---- Session ----
  listSessions: (page = 1, size = 20) =>
    get<PageResult<SessionInfo>>("chat", "/chat/session/listSessions", { page, size }),
  getSession: (sessionId: string) =>
    get<SessionInfo>("chat", "/chat/session/getSession", { session_id: sessionId }),
  createSession: (title?: string, agentId?: string | null) =>
    post<SessionInfo>("chat", "/chat/session/createSession", { title, agent_id: agentId ?? null }),
  deleteSession: (sessionId: string) =>
    post<unknown>("chat", "/chat/session/deleteSession", undefined, { session_id: sessionId }),
  renameSession: (sessionId: string, newTitle: string) =>
    post<SessionInfo>(
      "chat",
      "/chat/session/renameSession",
      { new_title: newTitle },
      { session_id: sessionId },
    ),
  pinSession: (sessionId: string, setPin: boolean) =>
    post<SessionInfo>(
      "chat",
      "/chat/session/pinSession",
      { set_pin: setPin },
      { session_id: sessionId },
    ),
  setSessionAgent: (sessionId: string, agentId: string | null) =>
    post<SessionInfo>(
      "chat",
      "/chat/session/setSessionAgent",
      { agent_id: agentId },
      { session_id: sessionId },
    ),
  /** page=1 为最新回合。 */
  listHistoryMessages: (sessionId: string, page = 1, size = 20) =>
    get<PageResult<UIMessage>>("chat", "/chat/session/listHistoryMessages", {
      session_id: sessionId,
      page,
      size,
    }),

  // ---- Attachment ----
  initUploadTemporaryAttachment: (body: {
    session_id: string;
    filename: string;
    extension: string;
    file_size: number;
    md5: string;
    enable_library?: boolean;
  }) => post<InitUploadResponse>("chat", "/chat/attachment/initUploadTemporaryAttachment", body),
  addResourceAttachments: (sessionId: string, resourceIds: string[]) =>
    post<string[]>("chat", "/chat/attachment/addResourceAttachments", {
      session_id: sessionId,
      resource_ids: resourceIds,
    }),
  deleteAttachment: (sessionId: string, attachmentId: string) =>
    post<unknown>("chat", "/chat/attachment/deleteAttachment", {
      session_id: sessionId,
      attachment_id: attachmentId,
    }),

  // ---- Memory ----
  listMemories: () => get<MemoryItem[]>("chat", "/chat/memory/listMemories"),
  deleteMemory: (memoryId: string) =>
    post<unknown>("chat", "/chat/memory/deleteMemory", undefined, { memory_id: memoryId }),
  deleteAllMemories: () => del<unknown>("chat", "/chat/memory/deleteAllMemories"),

  // ---- Model / Provider ----
  listAvailableModels: () => get<AvailableModels>("chat", "/chat/model/listAvailableModels"),
  listUserProviders: () =>
    get<{ providers: ProviderInfo[] }>("chat", "/chat/model/listUserProviders"),
  createUserProvider: (body: {
    name: string;
    type: ProviderType;
    api_key: string;
    base_url?: string | null;
    is_active?: boolean;
  }) => post<unknown>("chat", "/chat/model/createUserProvider", body),
  updateUserProvider: (body: Record<string, unknown> & { provider_id: string }) =>
    post<unknown>("chat", "/chat/model/updateUserProvider", body),
  deleteUserProvider: (providerId: string) =>
    post<unknown>("chat", "/chat/model/deleteUserProvider", { provider_id: providerId }),
  listUserModelsByProviderId: (providerId: string) =>
    get<{ models: ModelInfo[] }>("chat", "/chat/model/listUserModelsByProviderId", {
      provider_id: providerId,
    }),
  listAllUserModels: () => get<{ models: ModelInfo[] }>("chat", "/chat/model/listAllUserModels"),
  createUserModel: (body: Record<string, unknown> & { display_name: string }) =>
    post<unknown>("chat", "/chat/model/createUserModel", body),
  updateUserModel: (body: Record<string, unknown> & { model_id: string }) =>
    post<unknown>("chat", "/chat/model/updateUserModel", body),
  deleteUserModel: (modelId: string) =>
    post<unknown>("chat", "/chat/model/deleteUserModel", { model_id: modelId }),
  bindModelProvider: (body: {
    model_id: string;
    provider_id: string;
    provider_model_name: string;
    is_preferred?: boolean;
    is_active?: boolean;
  }) => post<unknown>("chat", "/chat/model/bindModelProvider", body),
  unbindModelProvider: (modelId: string, providerId: string) =>
    post<unknown>("chat", "/chat/model/unbindModelProvider", {
      model_id: modelId,
      provider_id: providerId,
    }),

  // ---- Tool / MCP ----
  listUserTools: () => get<{ tools: ToolInfo[] }>("chat", "/chat/tool/listUserTools"),
  getUserToolConfig: (toolName: string) =>
    get<ToolInfo>("chat", "/chat/tool/getUserToolConfig", { tool_name: toolName }),
  updateUserToolConfig: (body: {
    tool_name: string;
    enabled?: boolean | null;
    config?: Record<string, unknown> | null;
    secret_config?: Record<string, string> | null;
  }) => post<unknown>("chat", "/chat/tool/updateUserToolConfig", body),
  deleteUserToolConfig: (toolName: string) =>
    post<unknown>("chat", "/chat/tool/deleteUserToolConfig", { tool_name: toolName }),
  listUserMcpServers: () => get<{ servers: UserMcpServer[] }>("chat", "/chat/tool/listUserMcpServers"),
  getUserMcpServer: (serverId: string) =>
    get<UserMcpServer>("chat", "/chat/tool/getUserMcpServer", { server_id: serverId }),
  previewUserMcpServer: (body: Record<string, unknown> & { url: string }) =>
    post<McpPreviewResult>("chat", "/chat/tool/previewUserMcpServer", body),
  upsertUserMcpServer: (body: Record<string, unknown> & { url: string }) =>
    post<unknown>("chat", "/chat/tool/upsertUserMcpServer", body),
  deleteUserMcpServer: (serverId: string) =>
    post<unknown>("chat", "/chat/tool/deleteUserMcpServer", { server_id: serverId }),

  // ---- Speech ----
  getSpeechCredential: (provider = "IFLYTEK", options: Record<string, unknown> = {}) =>
    post<SpeechCredential>("chat", "/chat/speech/getCredential", { provider, options }),
};

/** 与 chatApi.previewUserMcpServer 同参，但超时放宽（预览需实际连接远端 MCP 服务器）。 */
export const previewUserMcpServerWithTimeout = (
  body: Record<string, unknown> & { url: string },
  timeoutSecs = 30,
) =>
  request<McpPreviewResult>("chat", {
    method: "POST",
    path: "/chat/tool/previewUserMcpServer",
    body,
    timeoutSecs,
  });
