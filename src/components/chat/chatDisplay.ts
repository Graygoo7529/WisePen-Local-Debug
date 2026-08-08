import type { LiveTurn, ToolCallStatus, ToolCallView } from "../../stores/chatStore";
import type { UIMessage } from "../../lib/types";

/** 渲染层统一的消息部件：历史消息与实时回合都归一化到这里。 */
export type DisplayPart =
  | { kind: "text"; text: string }
  | { kind: "attachment"; name: string; fileSize: number }
  | { kind: "reasoning"; text: string; durationMs?: number }
  | { kind: "tool"; tool: ToolDisplay }
  | { kind: "error"; text: string };

export interface ToolDisplay {
  turnId?: string;
  recoveryFailed?: boolean;
  toolCallId: string;
  toolName: string;
  step?: number;
  status: ToolCallStatus;
  toolDesc?: string;
  errorText?: string;
  input?: unknown;
  output?: unknown;
  startedAt?: number;
  finishedAt?: number;
  rawFrames?: string[];
}

/** 历史 UIMessage parts → 展示部件。 */
export function partsFromUIMessage(msg: UIMessage): DisplayPart[] {
  const parts: DisplayPart[] = [];
  for (const p of msg.parts) {
    if (p.type === "text" && p.text) {
      parts.push({ kind: "text", text: p.text });
    } else if (p.type === "reasoning" && p.text) {
      parts.push({ kind: "reasoning", text: p.text });
    } else if (p.type.startsWith("tool-")) {
      const status: ToolCallStatus = p.state === "input-available"
        ? "input-available"
        : p.state === "approval-requested"
          ? "approval-requested"
          : "success";
      parts.push({
        kind: "tool",
        tool: {
          toolCallId: p.toolCallId ?? "",
          toolName: p.type.slice("tool-".length),
          status,
          input: p.input,
          output: p.output,
        },
      });
    } else if (p.type === "error") {
      parts.push({ kind: "error", text: p.text ?? "未知错误" });
    }
    // "step-start" 等结构部件不渲染
  }
  return parts;
}

/** 实时回合 → 展示部件。 */
export function partsFromLiveTurn(turn: LiveTurn): DisplayPart[] {
  const parts: DisplayPart[] = [];
  if (turn.reasoning) {
    const durationMs =
      turn.reasoningStartedAt && turn.reasoningFinishedAt
        ? turn.reasoningFinishedAt - turn.reasoningStartedAt
        : undefined;
    parts.push({ kind: "reasoning", text: turn.reasoning, durationMs });
  }
  for (const t of turn.toolCalls) {
    parts.push({
      kind: "tool",
      tool: toolDisplayFrom(t, turn.id, turn.status === "waiting" && Boolean(turn.errorText)),
    });
  }
  if (turn.text) {
    parts.push({ kind: "text", text: turn.text });
  }
  if (turn.errorText) {
    parts.push({ kind: "error", text: turn.errorText });
  }
  return parts;
}

/** 实时回合中的用户输入，包括本轮实际发送的图片快照。 */
export function userPartsFromLiveTurn(turn: LiveTurn): DisplayPart[] {
  const parts: DisplayPart[] = [
    ...turn.attachments.map((attachment) => ({
      kind: "attachment" as const,
      name: attachment.name,
      fileSize: attachment.fileSize,
    })),
  ];
  if (turn.query) parts.push({ kind: "text", text: turn.query });
  return parts;
}

function toolDisplayFrom(
  t: ToolCallView,
  turnId: string,
  recoveryFailed: boolean,
): ToolDisplay {
  return {
    turnId,
    recoveryFailed,
    toolCallId: t.toolCallId,
    toolName: t.toolName,
    step: t.step,
    status: t.status,
    toolDesc: t.toolDesc,
    errorText: t.errorText,
    input: t.input,
    output: t.output,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    rawFrames: t.rawFrames,
  };
}
