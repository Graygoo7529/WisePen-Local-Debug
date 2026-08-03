import { Channel, invoke } from "@tauri-apps/api/core";
import { buildHeaders } from "./client";
import { useSettingsStore } from "../stores/settingsStore";
import type { ChatRequest, SseEvent } from "../lib/types";

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

/**
 * 发起 POST /chat/completions SSE 流式对话。
 * 返回 requestId，可用 abortChat 中断。
 */
export async function startChatCompletion(
  body: ChatRequest,
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

  // 不 await：invoke 的 Promise 在流结束后才 resolve；错误经 onError 上报。
  void invoke("chat_completion", {
    requestId,
    url: `${chatBaseUrl.replace(/\/+$/, "")}/chat/completions`,
    headers: buildHeaders("chat"),
    body,
    onEvent: channel,
  }).catch((e) => {
    handlers.onError?.(e instanceof Error ? e.message : String(e));
  });

  return requestId;
}

export function abortChatCompletion(requestId: string): void {
  void invoke("abort_chat", { requestId }).catch(() => undefined);
}
