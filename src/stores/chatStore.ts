import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { chatApi } from "../api/chat";
import {
  abortChatCompletion,
  reconnectChatCompletion,
  recoverChatCompletion,
  startChatCompletion,
  type StreamHandlers,
} from "../api/sse";
import { ApiError } from "../api/client";
import { toast } from "./toastStore";
import { useSettingsStore } from "./settingsStore";
import {
  CLIENT_TOOL_CAPABILITIES,
  executeClientTool as runClientTool,
  isClientTool,
} from "../lib/clientTools";
import type {
  ChatRecoverRequest,
  ChatRequest,
  FrontendState,
  SessionInfo,
  SseEvent,
  TemporaryAttachmentRef,
  UIMessage,
} from "../lib/types";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const PENDING_TURNS_STORAGE_KEY = "wisepen-local.pending-turns.v1";

export type ToolCallStatus =
  | "running"
  | "input-available"
  | "executing"
  | "client-ready"
  | "approval-requested"
  | "approval-approved"
  | "approval-denied"
  | "submitting"
  | "success"
  | "error"
  | "denied";

export interface LiveAttachment {
  attachmentId: string;
  name: string;
  fileSize: number;
}

// ============ 实时回合（流式） ============
export interface ToolCallView {
  toolCallId: string;
  toolName: string;
  step: number;
  status: ToolCallStatus;
  executionTarget?: "client" | "server";
  approvalRequired?: boolean;
  approvalId?: string;
  toolDesc?: string;
  approvalDecision?: boolean;
  clientResult?: { output?: unknown; errorText?: string };
  errorText?: string;
  input?: unknown;
  output?: unknown;
  startedAt: number;
  inputAt?: number;
  finishedAt?: number;
  rawFrames: string[];
}

export interface LiveTurn {
  id: string;
  sessionId: string;
  activeTurnId?: string;
  query: string;
  attachments: LiveAttachment[];
  status: "streaming" | "waiting" | "cancelling" | "done" | "error" | "aborted";
  cancelRequested?: boolean;
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
  /** 新会话绑定的 Agent；已有会话的 Agent 由 session.agent_id 决定。 */
  agentId: string;
  model: string;
  providerId: string;
  runtimeOptionsText: string;
  allowToolNames: string[];
  denyToolNames: string[];
  onDemandSkillIds: string[];
  frontendStates: FrontendState[];
}

export const defaultRequestOptions = (): RequestOptions => ({
  agentId: "",
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
          executionTarget: isClientTool((ev.toolName as string) ?? "") ? "client" : "server",
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
        if (t.executionTarget === "client") t.status = "input-available";
      }
      break;
    }
    case "data-tool-approval-request": {
      const t = findOrCreateTool(next, ev, raw, now);
      t.approvalRequired = true;
      t.approvalId = ev.approvalId;
      t.toolDesc = ev.toolDesc;
      t.input = ev.input;
      t.status = "approval-requested";
      break;
    }
    case "tool-output-available": {
      const t = next.toolCalls.find((x) => x.toolCallId === ev.toolCallId);
      if (t) {
        t.output = ev.output;
        t.status = t.approvalDecision === false ? "denied" : t.clientResult?.errorText ? "error" : "success";
        t.finishedAt = now;
      }
      break;
    }
    case "data-tool-execution-error": {
      const t = next.toolCalls.find((x) => x.toolCallId === ev.toolCallId);
      if (t) {
        t.status = "error";
        t.errorText = ev.errorText ?? "工具执行失败";
        t.finishedAt = now;
      }
      break;
    }
    case "data-tool-execution-denied": {
      const t = next.toolCalls.find((x) => x.toolCallId === ev.toolCallId);
      if (t) {
        t.status = "denied";
        t.finishedAt = now;
      }
      break;
    }
    case "error":
      next.status = next.cancelRequested || next.status === "cancelling" ? "aborted" : "error";
      next.errorText = next.status === "aborted" ? undefined : ((ev.errorText as string) ?? "未知错误");
      next.finishedAt = now;
      break;
    case "abort":
      next.status = "aborted";
      next.finishedAt = now;
      break;
    case "finish":
      if (next.status === "streaming") {
        next.status = hasPendingToolActions(next) ? "waiting" : "done";
      }
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
  syncCurrentTurn: () => Promise<void>;
  refreshSession: () => Promise<void>;
  createSession: (title?: string, agentId?: string | null) => Promise<SessionInfo | null>;
  removeSession: (id: string) => Promise<void>;
  renameSession: (id: string, title: string) => Promise<void>;
  togglePin: (id: string, pin: boolean) => Promise<void>;
  loadOlderHistory: () => Promise<void>;
  setOptions: (patch: Partial<RequestOptions>) => void;
  send: (query: string) => Promise<void>;
  abort: () => Promise<void>;
  executeClientTool: (turnId: string, toolCallId: string) => Promise<void>;
  decideToolApproval: (turnId: string, toolCallId: string, approved: boolean) => Promise<void>;
  retryTurnRecovery: (turnId: string) => Promise<void>;
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

export const useChatStore = create<ChatState>((set, getState) => {
  let transportGeneration = 0;

  const disconnectLocalStream = (): void => {
    transportGeneration += 1;
    const requestId = getState().activeRequestId;
    if (requestId) abortChatCompletion(requestId);
  };

  const attachTurnStream = async (
    turnId: string,
    sessionId: string,
    starter: (handlers: StreamHandlers) => Promise<string>,
  ): Promise<void> => {
    const generation = ++transportGeneration;
    let requestId = "";
    const ownsTransport = () =>
      generation === transportGeneration
      && (!requestId || getState().activeRequestId === requestId);
    const handlers: StreamHandlers = {
      onMeta: (status) => {
        if (!ownsTransport() || status >= 400) return;
        void chatApi.getActiveChatTurn(sessionId).then(({ turn_id }) => {
          if (!ownsTransport() || !turn_id) return;
          set((s) => ({
            liveTurns: s.liveTurns.map((turn) =>
              turn.id === turnId ? { ...turn, activeTurnId: turn_id } : turn,
            ),
          }));
        }).catch(() => undefined);
      },
      onEvent: (event, raw) => {
        if (!ownsTransport()) return;
        set((s) => ({
          liveTurns: s.liveTurns.map((turn) =>
            turn.id === turnId ? applySseEvent(turn, event, raw) : turn,
          ),
        }));
      },
      onDone: () => {
        if (!ownsTransport()) return;
        const current = getState().liveTurns.find((turn) => turn.id === turnId);
        const shouldKeepPending = current?.status === "waiting"
          && hasPendingToolActions(current);
        if (current && !shouldKeepPending) removePendingTurn(sessionId);
        set((s) => {
          const ownsTransport = s.activeRequestId === requestId;
          return {
            activeRequestId: ownsTransport ? null : s.activeRequestId,
            sending: ownsTransport ? false : s.sending,
            liveTurns: s.liveTurns.map((turn) => {
              if (turn.id !== turnId) return turn;
              if (["done", "error", "aborted", "waiting"].includes(turn.status)) return turn;
              if (turn.status === "cancelling") {
                return { ...turn, status: "aborted", finishedAt: Date.now() };
              }
              return {
                ...turn,
                status: hasPendingToolActions(turn) ? "waiting" : "done",
                finishedAt: Date.now(),
              };
            }),
          };
        });
      },
      onError: (message) => {
        if (!ownsTransport()) return;
        set((s) => {
          const ownsTransport = s.activeRequestId === requestId;
          return {
            activeRequestId: ownsTransport ? null : s.activeRequestId,
            sending: ownsTransport ? false : s.sending,
            liveTurns: s.liveTurns.map((turn) => {
              if (turn.id !== turnId) return turn;
              const recoveryFailed = turn.toolCalls.some((tool) => tool.status === "submitting");
              return {
                ...turn,
                status: recoveryFailed ? "waiting" : "error",
                errorText: message,
                finishedAt: Date.now(),
                toolCalls: recoveryFailed
                  ? turn.toolCalls.map(restoreResolvedToolAction)
                  : turn.toolCalls,
              };
            }),
          };
        });
        toast.error(`对话流失败：${message}`);
      },
    };

    requestId = await starter(handlers);
    if (generation !== transportGeneration) {
      abortChatCompletion(requestId);
      return;
    }
    set({ activeRequestId: requestId });
  };

  const recoverReadyTurn = async (turnId: string): Promise<void> => {
    const turn = getState().liveTurns.find((item) => item.id === turnId);
    if (!turn || turn.status === "streaming" || turn.status === "cancelling") return;

    const actionable = turn.toolCalls.filter(isPendingToolAction);
    if (actionable.length === 0 || actionable.some(isUnresolvedToolAction)) return;

    const clientResults = actionable.flatMap((tool) => {
      if (tool.executionTarget !== "client" || !tool.clientResult) return [];
      return [{
        tool_call_id: tool.toolCallId,
        ...(tool.clientResult.errorText
          ? { error_text: tool.clientResult.errorText }
          : { output: tool.clientResult.output }),
      }];
    });
    const approvalStatus = actionable.flatMap((tool) =>
      tool.approvalRequired && tool.approvalDecision !== undefined
        ? [{ tool_call_id: tool.toolCallId, approved: tool.approvalDecision }]
        : [],
    );
    if (clientResults.length + approvalStatus.length === 0) return;

    set((s) => ({
      sending: true,
      liveTurns: s.liveTurns.map((item) =>
        item.id === turnId
          ? {
              ...item,
              status: "streaming",
              errorText: undefined,
              toolCalls: item.toolCalls.map((tool) =>
                isResolvedToolAction(tool) ? { ...tool, status: "submitting" } : tool,
              ),
            }
          : item,
      ),
    }));

    const body: ChatRecoverRequest = {
      session_id: turn.sessionId,
      client_tool_results: clientResults,
      tool_approval_status: approvalStatus,
    };
    await attachTurnStream(turnId, turn.sessionId, (handlers) =>
      recoverChatCompletion(body, handlers),
    );
  };

  const recordClientToolResult = (
    turnId: string,
    toolCallId: string,
    result: { output?: unknown; errorText?: string },
  ): void => {
    set((s) => ({
      liveTurns: s.liveTurns.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              toolCalls: turn.toolCalls.map((tool) =>
                tool.toolCallId === toolCallId
                  ? {
                      ...tool,
                      clientResult: result,
                      errorText: result.errorText,
                      status: "client-ready",
                    }
                  : tool,
              ),
            }
          : turn,
      ),
    }));
  };

  const restoreSessionTurn = async (
    sessionId: string,
    history: UIMessage[] | null,
  ): Promise<void> => {
    try {
      const active = await chatApi.getActiveChatTurn(sessionId);
      if (getState().currentSessionId !== sessionId) return;

      if (active.turn_id) {
        const snapshot = getPendingTurn(sessionId);
        const turn = createLiveTurn({
          id: active.turn_id,
          sessionId,
          activeTurnId: active.turn_id,
          query: snapshot?.query ?? "",
          attachments: snapshot?.attachments ?? [],
          startedAt: snapshot?.startedAt,
        });
        set({ liveTurns: [turn], sending: true });
        await attachTurnStream(turn.id, sessionId, (handlers) =>
          reconnectChatCompletion(sessionId, handlers),
        );
        return;
      }

      if (history === null) {
        set({ sending: false, activeRequestId: null });
        return;
      }

      const suspended = extractSuspendedTurn(sessionId, history);
      if (suspended) {
        set({
          history: suspended.history,
          liveTurns: [suspended.turn],
          sending: false,
          activeRequestId: null,
        });
      } else {
        removePendingTurn(sessionId);
        set({ liveTurns: [], sending: false, activeRequestId: null });
      }
    } catch (error) {
      if (getState().currentSessionId === sessionId) {
        toast.error(`恢复会话运行状态失败：${errText(error)}`);
      }
    }
  };

  return {
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
    disconnectLocalStream();
    set({
      currentSessionId: id,
      currentSession: null,
      liveTurns: [],
      history: [],
      historyLoadedPages: 0,
      historyTotal: 0,
      sending: false,
      activeRequestId: null,
      userDefinedAttachmentIds: [],
    });
    set({ historyLoading: true });
    const [, history] = await Promise.all([
      getState().refreshSession(),
      chatApi.listHistoryMessages(id, 1, 20).then((page): UIMessage[] | null => {
        if (getState().currentSessionId !== id) return [];
        set({
          history: sortHistory(page.list),
          historyTotal: page.total,
          historyLoadedPages: 1,
          historyLoading: false,
        });
        return sortHistory(page.list);
      }).catch((error) => {
        if (getState().currentSessionId === id) {
          set({ historyLoading: false });
          toast.error(`加载历史消息失败：${errText(error)}`);
        }
        return null;
      }),
    ]);
    await restoreSessionTurn(id, history);
  },

  syncCurrentTurn: async () => {
    const sessionId = getState().currentSessionId;
    if (!sessionId) return;
    disconnectLocalStream();
    set({ historyLoading: true, activeRequestId: null, sending: false });
    await getState().refreshSession();
    let history: UIMessage[] | null = null;
    try {
      const page = await chatApi.listHistoryMessages(sessionId, 1, 20);
      if (getState().currentSessionId !== sessionId) return;
      history = sortHistory(page.list);
      set({
        history,
        historyTotal: page.total,
        historyLoadedPages: 1,
        historyLoading: false,
      });
    } catch (error) {
      if (getState().currentSessionId === sessionId) {
        set({ historyLoading: false });
        toast.error(`刷新会话失败：${errText(error)}`);
      }
    }
    await restoreSessionTurn(sessionId, history);
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

  createSession: async (title, agentId) => {
    try {
      const session = await chatApi.createSession(
        title || undefined,
        agentId === undefined ? getState().options.agentId || null : agentId,
      );
      disconnectLocalStream();
      set((s) => ({
        sessions: [session, ...s.sessions],
        currentSessionId: session.id,
        currentSession: session,
        liveTurns: [],
        history: [],
        historyLoadedPages: 0,
        historyTotal: 0,
        sending: false,
        activeRequestId: null,
        userDefinedAttachmentIds: [],
      }));
      toast.success("已创建新会话");
      return session;
    } catch (e) {
      toast.error(`创建会话失败：${errText(e)}`);
      return null;
    }
  },

  removeSession: async (id) => {
    try {
      await chatApi.deleteSession(id);
      removePendingTurn(id);
      if (getState().currentSessionId === id) {
        disconnectLocalStream();
      }
      set((s) => ({
        sessions: s.sessions.filter((x) => x.id !== id),
        ...(s.currentSessionId === id
          ? {
              currentSessionId: null,
              currentSession: null,
              history: [],
              liveTurns: [],
              sending: false,
              activeRequestId: null,
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
    if (state.liveTurns.some((turn) => turn.status === "waiting")) {
      toast.error("请先处理当前会话中待执行的客户端工具或工具审批");
      return;
    }

    // 无会话时自动创建
    let sessionId = state.currentSessionId;
    if (!sessionId) {
      try {
        const session = await chatApi.createSession(
          undefined,
          state.options.agentId || null,
        );
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
      user_defined_allow_tool_names:
        opts.allowToolNames.length > 0
          ? [...new Set([
              ...opts.allowToolNames,
              ...CLIENT_TOOL_CAPABILITIES.map((tool) => tool.name),
            ])]
          : null,
      user_defined_deny_tool_names: opts.denyToolNames.length > 0 ? opts.denyToolNames : null,
      user_defined_on_demand_skill_ids:
        opts.onDemandSkillIds.length > 0 ? opts.onDemandSkillIds : null,
      client_tool_capabilities: CLIENT_TOOL_CAPABILITIES,
    };

    const attachments = userDefinedAttachments.map((attachment) => ({
      attachmentId: attachment.attachment_id,
      name: attachment.attachment_name,
      fileSize: attachment.file_size,
    }));
    const turn = createLiveTurn({
      id: crypto.randomUUID(),
      sessionId,
      query: query.trim(),
      attachments,
    });
    savePendingTurn(sessionId, {
      query: turn.query,
      attachments,
      startedAt: turn.startedAt,
    });
    set((s) => ({ liveTurns: [...s.liveTurns, turn], sending: true }));
    set({ userDefinedAttachmentIds: [] });
    await attachTurnStream(turn.id, sessionId, (handlers) =>
      startChatCompletion(body, handlers),
    );
  },

  abort: async () => {
    const sessionId = getState().currentSessionId;
    const turn = [...getState().liveTurns]
      .reverse()
      .find((item) => item.sessionId === sessionId && item.status === "streaming");
    if (!sessionId || !turn) return;

    set((s) => ({
      liveTurns: s.liveTurns.map((item) =>
        item.id === turn.id
          ? { ...item, status: "cancelling", cancelRequested: true }
          : item,
      ),
    }));
    try {
      await chatApi.cancelChatCompletion(sessionId);
    } catch (error) {
      set((s) => ({
        liveTurns: s.liveTurns.map((item) =>
          item.id === turn.id
            ? { ...item, status: "streaming", cancelRequested: false }
            : item,
        ),
      }));
      toast.error(`取消对话失败：${errText(error)}`);
    }
  },

  executeClientTool: async (turnId, toolCallId) => {
    const turn = getState().liveTurns.find((item) => item.id === turnId);
    const tool = turn?.toolCalls.find((item) => item.toolCallId === toolCallId);
    if (!turn || !tool || tool.status !== "input-available") return;

    set((s) => ({
      liveTurns: s.liveTurns.map((item) =>
        item.id === turnId
          ? {
              ...item,
              toolCalls: item.toolCalls.map((candidate) =>
                candidate.toolCallId === toolCallId
                  ? { ...candidate, status: "executing" }
                  : candidate,
              ),
            }
          : item,
      ),
    }));
    try {
      const output = await runClientTool(tool.toolName, tool.input);
      recordClientToolResult(turnId, toolCallId, { output });
    } catch (error) {
      recordClientToolResult(turnId, toolCallId, { errorText: errText(error) });
    }
    await recoverReadyTurn(turnId);
  },

  decideToolApproval: async (turnId, toolCallId, approved) => {
    set((s) => ({
      liveTurns: s.liveTurns.map((turn) =>
        turn.id === turnId
          ? {
              ...turn,
              toolCalls: turn.toolCalls.map((tool) =>
                tool.toolCallId === toolCallId && tool.status === "approval-requested"
                  ? {
                      ...tool,
                      approvalDecision: approved,
                      status: approved ? "approval-approved" : "approval-denied",
                    }
                  : tool,
              ),
            }
          : turn,
      ),
    }));
    await recoverReadyTurn(turnId);
  },

  retryTurnRecovery: async (turnId) => {
    await recoverReadyTurn(turnId);
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
        const session = await chatApi.createSession(
          undefined,
          getState().options.agentId || null,
        );
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
  };
});

interface PendingTurnSnapshot {
  query: string;
  attachments: LiveAttachment[];
  startedAt: number;
}

function createLiveTurn(options: {
  id: string;
  sessionId: string;
  activeTurnId?: string;
  query: string;
  attachments: LiveAttachment[];
  startedAt?: number;
}): LiveTurn {
  return {
    id: options.id,
    sessionId: options.sessionId,
    activeTurnId: options.activeTurnId,
    query: options.query,
    attachments: options.attachments,
    status: "streaming",
    text: "",
    reasoning: "",
    currentStep: 0,
    toolCalls: [],
    startedAt: options.startedAt ?? Date.now(),
    rawEvents: [],
  };
}

function findOrCreateTool(
  turn: LiveTurn,
  event: SseEvent,
  raw: string,
  now: number,
): ToolCallView {
  let tool = turn.toolCalls.find((item) => item.toolCallId === event.toolCallId);
  if (!tool) {
    tool = {
      toolCallId: event.toolCallId ?? "",
      toolName: event.toolName ?? "unknown",
      step: turn.currentStep,
      status: "running",
      executionTarget: isClientTool(event.toolName ?? "") ? "client" : "server",
      startedAt: now,
      rawFrames: [raw],
    };
    turn.toolCalls.push(tool);
  }
  return tool;
}

function isPendingToolAction(tool: ToolCallView): boolean {
  return [
    "input-available",
    "executing",
    "client-ready",
    "approval-requested",
    "approval-approved",
    "approval-denied",
  ].includes(tool.status);
}

function isUnresolvedToolAction(tool: ToolCallView): boolean {
  return ["input-available", "executing", "approval-requested"].includes(tool.status);
}

function isResolvedToolAction(tool: ToolCallView): boolean {
  return ["client-ready", "approval-approved", "approval-denied"].includes(tool.status);
}

function hasPendingToolActions(turn: LiveTurn): boolean {
  return turn.toolCalls.some(
    (tool) => isPendingToolAction(tool) || tool.status === "submitting",
  );
}

function restoreResolvedToolAction(tool: ToolCallView): ToolCallView {
  if (tool.status !== "submitting") return tool;
  if (tool.executionTarget === "client" && tool.clientResult) {
    return { ...tool, status: "client-ready" };
  }
  if (tool.approvalDecision !== undefined) {
    return {
      ...tool,
      status: tool.approvalDecision ? "approval-approved" : "approval-denied",
    };
  }
  return tool;
}

function extractSuspendedTurn(
  sessionId: string,
  history: UIMessage[],
): { history: UIMessage[]; turn: LiveTurn } | null {
  let assistantIndex = -1;
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].parts.some((part) =>
      part.state === "input-available" || part.state === "approval-requested")) {
      assistantIndex = index;
      break;
    }
  }
  if (assistantIndex < 0) return null;

  let userIndex = -1;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (history[index].role === "user") {
      userIndex = index;
      break;
    }
  }

  const assistant = history[assistantIndex];
  const user = userIndex >= 0 ? history[userIndex] : undefined;
  const snapshot = getPendingTurn(sessionId);
  const query = snapshot?.query ?? user?.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n") ?? "";
  const turn = createLiveTurn({
    id: `suspended:${sessionId}`,
    sessionId,
    query,
    attachments: snapshot?.attachments ?? [],
    startedAt: snapshot?.startedAt ?? parseTimestamp(user?.createdAt),
  });
  turn.status = "waiting";
  turn.messageId = assistant.id;
  turn.text = assistant.parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("");
  turn.reasoning = assistant.parts
    .filter((part) => part.type === "reasoning" && part.text)
    .map((part) => part.text)
    .join("");
  turn.currentStep = assistant.parts.filter((part) => part.type === "step-start").length;
  turn.toolCalls = assistant.parts
    .filter((part) => part.type.startsWith("tool-") && part.toolCallId)
    .map((part) => {
      const toolName = part.type.slice("tool-".length);
      const status: ToolCallStatus = part.state === "input-available"
        ? "input-available"
        : part.state === "approval-requested"
          ? "approval-requested"
          : "success";
      return {
        toolCallId: part.toolCallId ?? "",
        toolName,
        step: turn.currentStep,
        status,
        executionTarget: isClientTool(toolName) ? "client" : "server",
        approvalRequired: part.state === "approval-requested",
        input: part.input,
        output: part.output,
        startedAt: turn.startedAt,
        rawFrames: [],
      };
    });

  return {
    history: history.filter((_, index) => index !== assistantIndex && index !== userIndex),
    turn,
  };
}

function readPendingTurns(): Record<string, PendingTurnSnapshot> {
  try {
    const raw = localStorage.getItem(PENDING_TURNS_STORAGE_KEY);
    return raw ? JSON.parse(raw) as Record<string, PendingTurnSnapshot> : {};
  } catch {
    return {};
  }
}

function getPendingTurn(sessionId: string): PendingTurnSnapshot | undefined {
  return readPendingTurns()[sessionId];
}

function savePendingTurn(sessionId: string, snapshot: PendingTurnSnapshot): void {
  try {
    localStorage.setItem(
      PENDING_TURNS_STORAGE_KEY,
      JSON.stringify({ ...readPendingTurns(), [sessionId]: snapshot }),
    );
  } catch {
    // WebView 存储不可用时仍可在当前页面完成对话，只是不支持刷新后还原用户输入。
  }
}

function removePendingTurn(sessionId: string): void {
  try {
    const pending = readPendingTurns();
    delete pending[sessionId];
    localStorage.setItem(PENDING_TURNS_STORAGE_KEY, JSON.stringify(pending));
  } catch {
    // 忽略本地快照清理失败。
  }
}

function parseTimestamp(value?: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

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
