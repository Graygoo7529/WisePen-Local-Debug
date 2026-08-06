import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { chatApi } from "../api/chat";
import { startChatCompletion, abortChatCompletion } from "../api/sse";
import { ApiError } from "../api/client";
import { toast } from "./toastStore";
import { useSettingsStore } from "./settingsStore";
import type {
  ChatRequest,
  FrontendState,
  SessionInfo,
  SseEvent,
  TemporaryAttachmentRef,
  UIMessage,
} from "../lib/types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// ============ 实时回合（流式） ============
export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  step: number;
  status: "running" | "success";
  input?: unknown;
  output?: unknown;
  startedAt: number;
  inputAt?: number;
  finishedAt?: number;
  rawFrames: string[];
}

export interface LiveTurn {
  id: string;
  query: string;
  attachments: Array<{
    attachmentId: string;
    name: string;
    fileSize: number;
  }>;
  status: "streaming" | "done" | "error" | "aborted";
  messageId?: string;
  text: string;
  reasoning: string;
  reasoningStartedAt?: number;
  reasoningFinishedAt?: number;
  currentStep: number;
  toolCalls: ToolCallView[];
  errorText?: string;
  startedAt: number;
  finishedAt?: number;
  rawEvents: Array<{ raw: string; at: number }>;
}

export interface RequestOptions {
  model: string;
  providerId: string;
  runtimeOptionsText: string;
  allowToolNames: string[];
  denyToolNames: string[];
  onDemandSkillIds: string[];
  frontendStates: FrontendState[];
}

export const defaultRequestOptions = (): RequestOptions => ({
  model: useSettingsStore.getState().defaultModel,
  providerId: "",
  runtimeOptionsText: "",
  allowToolNames: [],
  denyToolNames: [],
  onDemandSkillIds: [],
  frontendStates: [],
});

/** 把 SSE 事件归约到实时回合上（返回新对象）。 */
export function applySseEvent(turn: LiveTurn, ev: SseEvent, raw: string): LiveTurn {
  const now = Date.now();
  const next: LiveTurn = {
    ...turn,
    rawEvents: [...turn.rawEvents, { raw, at: now }],
    toolCalls: turn.toolCalls.map((t) => ({ ...t, rawFrames: [...t.rawFrames] })),
  };
  const tool = next.toolCalls.find((t) => t.toolCallId === ev.toolCallId);
  const pushRawToTool = () => {
    if (tool) tool.rawFrames.push(raw);
  };
  pushRawToTool();

  switch (ev.type) {
    case "start":
      next.messageId = ev.messageId;
      break;
    case "start-step":
      next.currentStep += 1;
      break;
    case "reasoning-start":
      next.reasoningStartedAt ??= now;
      break;
    case "reasoning-delta":
      next.reasoningStartedAt ??= now;
      next.reasoning += (ev.delta as string) ?? "";
      next.reasoningFinishedAt = now;
      break;
    case "text-delta":
      next.text += (ev.delta as string) ?? "";
      break;
    case "tool-input-start":
      if (!next.toolCalls.some((t) => t.toolCallId === ev.toolCallId)) {
        next.toolCalls.push({
          toolCallId: ev.toolCallId ?? "",
          toolName: (ev.toolName as string) ?? "unknown",
          step: next.currentStep,
          status: "running",
          startedAt: now,
          rawFrames: [raw],
        });
      }
      break;
    case "tool-input-available": {
      const t = next.toolCalls.find((x) => x.toolCallId === ev.toolCallId);
      if (t) {
        t.input = ev.input;
        t.inputAt = now;
      }
      break;
    }
    case "tool-output-available": {
      const t = next.toolCalls.find((x) => x.toolCallId === ev.toolCallId);
      if (t) {
        t.output = ev.output;
        t.status = "success";
        t.finishedAt = now;
      }
      break;
    }
    case "error":
      next.status = "error";
      next.errorText = (ev.errorText as string) ?? "未知错误";
      next.finishedAt = now;
      break;
    case "abort":
      next.status = "aborted";
      next.finishedAt = now;
      break;
    case "finish":
      if (next.status === "streaming") next.status = "done";
      next.finishedAt = now;
      break;
  }
  return next;
}

// ============ Store ============
interface ChatState {
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  sessionsTotal: number;
  currentSessionId: string | null;
  currentSession: SessionInfo | null;

  history: UIMessage[];
  historyTotal: number;
  historyLoadedPages: number;
  historyLoading: boolean;

  liveTurns: LiveTurn[];
  sending: boolean;
  activeRequestId: string | null;
  userDefinedAttachmentIds: string[];
  options: RequestOptions;

  loadSessions: () => Promise<void>;
  selectSession: (id: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  removeSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pin: boolean) => Promise<void>;
  loadOlderHistory: () => Promise<void>;
  setOptions: (patch: Partial<RequestOptions>) => void;
  send: (query: string) => Promise<void>;
  abort: () => void;
  uploadAttachment: (path: string) => Promise<void>;
  deleteAttachment: (attachmentId: string) => Promise<void>;
  addResourceAttachment: (resourceId: string) => Promise<void>;
}

function sortHistory(msgs: UIMessage[]): UIMessage[] {
  return [...msgs].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return ta - tb;
  });
}

export const useChatStore = create<ChatState>((set, getState) => ({
  sessions: [],
  sessionsLoading: false,
  sessionsTotal: 0,
  currentSessionId: null,
  currentSession: null,
  history: [],
  historyTotal: 0,
  historyLoadedPages: 0,
  historyLoading: false,
  liveTurns: [],
  sending: false,
  activeRequestId: null,
  userDefinedAttachmentIds: [],
  options: defaultRequestOptions(),

  loadSessions: async () => {
    set({ sessionsLoading: true });
    try {
      const page = await chatApi.listSessions(1, 50);
      set({ sessions: page.list, sessionsTotal: page.total, sessionsLoading: false });
    } catch (e) {
      set({ sessionsLoading: false });
      toast.error(`加载会话列表失败：${errText(e)}`);
    }
  },

  selectSession: async (id) => {
    if (getState().currentSessionId === id) return;
    set({
      currentSessionId: id,
      currentSession: null,
      liveTurns: [],
      history: [],
      historyLoadedPages: 0,
      historyTotal: 0,
      userDefinedAttachmentIds: [],
    });
    await Promise.all([getState().refreshSession(), (async () => {
      set({ historyLoading: true });
      try {
        const page = await chatApi.listHistoryMessages(id, 1, 20);
        set({
          history: sortHistory(page.list),
          historyTotal: page.total,
          historyLoadedPages: 1,
          historyLoading: false,
        });
      } catch (e) {
        set({ historyLoading: false });
        toast.error(`加载历史消息失败：${errText(e)}`);
      }
    })()]);
  },

  refreshSession: async () => {
    const id = getState().currentSessionId;
    if (!id) return;
    try {
      const session = await chatApi.getSession(id);
      set((s) => {
        const activeAttachmentIds = new Set(
          session.temporary_attachment_refs.map((attachment) => attachment.attachment_id),
        );
        return {
          currentSession: s.currentSessionId === id ? session : s.currentSession,
          sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...session } : x)),
          userDefinedAttachmentIds:
            s.currentSessionId === id
              ? s.userDefinedAttachmentIds.filter((attachmentId) =>
                  activeAttachmentIds.has(attachmentId),
                )
              : s.userDefinedAttachmentIds,
        };
      });
    } catch {
      /* 会话可能被删除 */
    }
  },

  createSession: async (title) => {
    try {
      const session = await chatApi.createSession(title || undefined);
      set((s) => ({
        sessions: [session, ...s.sessions],
        currentSessionId: session.id,
        currentSession: session,
        liveTurns: [],
        history: [],
        historyLoadedPages: 0,
        historyTotal: 0,
        userDefinedAttachmentIds: [],
      }));
      toast.success("已创建新会话");
    } catch (e) {
      toast.error(`创建会话失败：${errText(e)}`);
    }
  },

  removeSession: async (id) => {
    try {
      await chatApi.deleteSession(id);
      set((s) => ({
        sessions: s.sessions.filter((x) => x.id !== id),
        ...(s.currentSessionId === id
          ? {
              currentSessionId: null,
              currentSession: null,
              history: [],
              liveTurns: [],
              userDefinedAttachmentIds: [],
            }
          : {}),
      }));
      toast.success("会话已删除");
    } catch (e) {
      toast.error(`删除会话失败：${errText(e)}`);
    }
  },

  renameSession: async (id, title) => {
    try {
      const updated = await chatApi.renameSession(id, title);
      set((s) => ({
        sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...updated } : x)),
        currentSession: s.currentSessionId === id ? { ...s.currentSession!, ...updated } : s.currentSession,
      }));
    } catch (e) {
      toast.error(`重命名失败：${errText(e)}`);
    }
  },

  togglePin: async (id, pin) => {
    try {
      await chatApi.pinSession(id, pin);
      await getState().loadSessions();
    } catch (e) {
      toast.error(`置顶操作失败：${errText(e)}`);
    }
  },

  loadOlderHistory: async () => {
    const { currentSessionId, historyLoadedPages, historyTotal, history, historyLoading } = getState();
    if (!currentSessionId || historyLoading) return;
    if (history.length >= historyTotal && historyLoadedPages > 0) return;
    set({ historyLoading: true });
    try {
      const nextPage = historyLoadedPages + 1;
      const page = await chatApi.listHistoryMessages(currentSessionId, nextPage, 20);
      set((s) => ({
        history: sortHistory([...page.list, ...s.history]),
        historyLoadedPages: nextPage,
        historyTotal: page.total,
        historyLoading: false,
      }));
    } catch (e) {
      set({ historyLoading: false });
      toast.error(`加载更早历史失败：${errText(e)}`);
    }
  },

  setOptions: (patch) => set((s) => ({ options: { ...s.options, ...patch } })),

  send: async (query) => {
    const state = getState();
    if (state.sending || !query.trim()) return;

    // 无会话时自动创建
    let sessionId = state.currentSessionId;
    if (!sessionId) {
      try {
        const session = await chatApi.createSession();
        set((s) => ({
          sessions: [session, ...s.sessions],
          currentSessionId: session.id,
          currentSession: session,
          history: [],
        }));
        sessionId = session.id;
      } catch (e) {
        toast.error(`创建会话失败：${errText(e)}`);
        return;
      }
    }

    const opts = getState().options;
    const userDefinedAttachments = currentUserDefinedAttachments(getState());
    let runtimeOptions: Record<string, unknown> = {};
    if (opts.runtimeOptionsText.trim()) {
      try {
        runtimeOptions = JSON.parse(opts.runtimeOptionsText);
      } catch {
        toast.error("runtime_options 不是合法 JSON，请修正后再发送");
        return;
      }
    }

    const body: ChatRequest = {
      session_id: sessionId,
      query: query.trim(),
      model: opts.model || null,
      provider_id: opts.providerId || null,
      runtime_options: runtimeOptions,
      frontend_states: opts.frontendStates.length > 0 ? opts.frontendStates : null,
      user_defined_attachment_ids:
        userDefinedAttachments.length > 0
          ? userDefinedAttachments.map((attachment) => attachment.attachment_id)
          : null,
      user_defined_allow_tool_names: opts.allowToolNames.length > 0 ? opts.allowToolNames : null,
      user_defined_deny_tool_names: opts.denyToolNames.length > 0 ? opts.denyToolNames : null,
      user_defined_on_demand_skill_ids:
        opts.onDemandSkillIds.length > 0 ? opts.onDemandSkillIds : null,
    };

    const turn: LiveTurn = {
      id: crypto.randomUUID(),
      query: query.trim(),
      attachments: userDefinedAttachments.map((attachment) => ({
        attachmentId: attachment.attachment_id,
        name: attachment.attachment_name,
        fileSize: attachment.file_size,
      })),
      status: "streaming",
      text: "",
      reasoning: "",
      currentStep: 0,
      toolCalls: [],
      startedAt: Date.now(),
      rawEvents: [],
    };
    set((s) => ({ liveTurns: [...s.liveTurns, turn], sending: true }));

    const requestId = await startChatCompletion(body, {
      onEvent: (ev, raw) => {
        set((s) => ({
          liveTurns: s.liveTurns.map((t) => (t.id === turn.id ? applySseEvent(t, ev, raw) : t)),
        }));
      },
      onDone: () => {
        set((s) => ({
          sending: false,
          activeRequestId: null,
          liveTurns: s.liveTurns.map((t) =>
            t.id === turn.id && t.status === "streaming"
              ? { ...t, status: "done", finishedAt: Date.now() }
              : t,
          ),
        }));
      },
      onError: (message) => {
        set((s) => ({
          sending: false,
          activeRequestId: null,
          liveTurns: s.liveTurns.map((t) =>
            t.id === turn.id
              ? { ...t, status: "error", errorText: message, finishedAt: Date.now() }
              : t,
          ),
        }));
        toast.error(`对话流失败：${message}`);
      },
    });
    set({ activeRequestId: requestId, userDefinedAttachmentIds: [] });
  },

  abort: () => {
    const { activeRequestId } = getState();
    if (activeRequestId) abortChatCompletion(activeRequestId);
    set({ sending: false, activeRequestId: null });
  },

  uploadAttachment: async (path) => {
    let uploadSessionId: string | null = null;
    let initializedAttachmentId: string | null = null;
    try {
      const stat = await invoke<{ size: number; file_name: string }>("file_stat", { path });
      const name = stat.file_name;
      const dot = name.lastIndexOf(".");
      const extension = dot >= 0 ? name.slice(dot + 1).toLowerCase() : "";
      if (!IMAGE_EXTENSIONS.has(extension)) {
        throw new Error("仅支持 JPG、JPEG、PNG 和 WebP 图片");
      }
      if (stat.size > MAX_IMAGE_BYTES) {
        throw new Error("单张图片不能超过 5 MiB");
      }

      let sessionId = getState().currentSessionId;
      if (!sessionId) {
        const session = await chatApi.createSession();
        set((s) => ({
          sessions: [session, ...s.sessions],
          currentSessionId: session.id,
          currentSession: session,
          history: [],
          liveTurns: [],
          userDefinedAttachmentIds: [],
        }));
        sessionId = session.id;
      }
      uploadSessionId = sessionId;

      const md5 = await invoke<string>("file_md5", { path });
      const init = await chatApi.initUploadTemporaryAttachment({
        session_id: sessionId,
        filename: name,
        extension,
        file_size: stat.size,
        md5,
      });
      initializedAttachmentId = init.attachment_id;
      if (!init.flash_uploaded) {
        const result = await invoke<{ status: number; body: string }>("oss_put_file", {
          putUrl: init.put_url,
          callbackHeader: init.callback_header || null,
          path,
        });
        if (result.status >= 400) {
          throw new Error(`OSS 上传失败 HTTP ${result.status}: ${result.body.slice(0, 200)}`);
        }
      }

      const attachment: TemporaryAttachmentRef = {
        attachment_id: init.attachment_id,
        attachment_type: "temporary",
        attachment_name: name,
        object_key: init.object_key,
        extension,
        file_size: stat.size,
        mime_type: null,
      };
      const selectForCurrentSession = getState().currentSessionId === sessionId;
      set((s) => ({
        ...(selectForCurrentSession && s.currentSessionId === sessionId && s.currentSession
          ? {
              currentSession: {
                ...s.currentSession,
                temporary_attachment_refs: s.currentSession.temporary_attachment_refs.some(
                  (item) => item.attachment_id === attachment.attachment_id,
                )
                  ? s.currentSession.temporary_attachment_refs
                  : [...s.currentSession.temporary_attachment_refs, attachment],
              },
              userDefinedAttachmentIds: s.userDefinedAttachmentIds.includes(attachment.attachment_id)
                ? s.userDefinedAttachmentIds
                : [...s.userDefinedAttachmentIds, attachment.attachment_id],
            }
          : {}),
      }));
      if (getState().currentSessionId === sessionId) {
        await getState().refreshSession();
      }
      toast.success(
        selectForCurrentSession ? `图片「${name}」已上传，将附加到本轮消息` : `图片「${name}」已上传`,
      );
    } catch (e) {
      if (uploadSessionId && initializedAttachmentId) {
        await chatApi.deleteAttachment(uploadSessionId, initializedAttachmentId).catch(() => undefined);
        if (getState().currentSessionId === uploadSessionId) {
          await getState().refreshSession();
        }
      }
      toast.error(`上传图片失败：${errText(e)}`);
    }
  },

  deleteAttachment: async (attachmentId) => {
    const sessionId = getState().currentSessionId;
    if (!sessionId) return;
    try {
      await chatApi.deleteAttachment(sessionId, attachmentId);
      set((s) => ({
        userDefinedAttachmentIds: s.userDefinedAttachmentIds.filter((id) => id !== attachmentId),
      }));
      await getState().refreshSession();
      toast.success("附件已删除");
    } catch (e) {
      toast.error(`删除附件失败：${errText(e)}`);
    }
  },

  addResourceAttachment: async (resourceId) => {
    const sessionId = getState().currentSessionId;
    if (!sessionId) {
      toast.error("请先选择或创建一个会话");
      return;
    }
    try {
      await chatApi.addResourceAttachments(sessionId, [resourceId]);
      await getState().refreshSession();
      toast.success("已添加资源附件");
    } catch (e) {
      toast.error(`添加资源附件失败：${errText(e)}`);
    }
  },
}));

function currentUserDefinedAttachments(
  state: Pick<ChatState, "currentSession" | "userDefinedAttachmentIds">,
): TemporaryAttachmentRef[] {
  const attachmentIds = new Set(state.userDefinedAttachmentIds);
  return (state.currentSession?.temporary_attachment_refs ?? []).filter(
    (attachment) => attachmentIds.has(attachment.attachment_id),
  );
}

function errText(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
