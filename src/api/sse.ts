import { Channel, invoke } from "@tauri-apps/api/core";
import { buildHeaders } from "./client";
import { useSettingsStore } from "../stores/settingsStore";
import type { ChatRecoverRequest, ChatRequest, SseEvent } from "../lib/types";

/** Rust 侧推送的流帧（与 src-tauri/src/sse.rs 的 StreamFrame 对应）。 */
export type StreamFrame =
  | { kind: "meta"; status: number }
  | { kind: "event"; data: SseEvent; raw: string }
  | { kind: "done" }
  | { kind: "error"; message: string };

export interface StreamHandlers {
  onMeta?: (status: number) => void;
  onEvent: (data: SseEvent, raw: string) => void;
  onDone?: () => void;
  onError?: (message: string) => void;
}

interface StartChatStreamOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
}

async function startChatStream(
  options: StartChatStreamOptions,
  handlers: StreamHandlers,
): Promise<string> {
  const { chatBaseUrl } = useSettingsStore.getState();
  const requestId = crypto.randomUUID();
  const channel = new Channel<StreamFrame>();

  channel.onmessage = (frame) => {
    switch (frame.kind) {
      case "meta":
        handlers.onMeta?.(frame.status);
        break;
      case "event":
        handlers.onEvent(frame.data, frame.raw);
        break;
      case "done":
        handlers.onDone?.();
        break;
      case "error":
        handlers.onError?.(frame.message);
        break;
    }
  };

  // invoke 的 Promise 在流结束后才 resolve，传输错误经 onError 上报。
  void invoke("chat_stream", {
    requestId,
    method: options.method,
    url: `${chatBaseUrl.replace(/\/+$/, "")}${options.path}`,
    headers: buildHeaders("chat"),
    body: options.body ?? null,
    onEvent: channel,
  }).catch((error) => {
    handlers.onError?.(error instanceof Error ? error.message : String(error));
  });

  return requestId;
}

export const startChatCompletion = (body: ChatRequest, handlers: StreamHandlers) =>
  startChatStream({ method: "POST", path: "/chat/completions", body }, handlers);

export const reconnectChatCompletion = (sessionId: string, handlers: StreamHandlers) =>
  startChatStream(
    {
      method: "GET",
      path: `/chat/completions/stream?session_id=${encodeURIComponent(sessionId)}`,
    },
    handlers,
  );

export const recoverChatCompletion = (body: ChatRecoverRequest, handlers: StreamHandlers) =>
  startChatStream({ method: "POST", path: "/chat/completions/recover", body }, handlers);

export function abortChatCompletion(requestId: string): void {
  void invoke("abort_chat", { requestId }).catch(() => undefined);
}
