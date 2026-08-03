import type { LiveTurn, ToolCallView } from "../../stores/chatStore";
import type { UIMessage } from "../../lib/types";

/** 渲染层统一的消息部件：历史消息与实时回合都归一化到这里。 */
export type DisplayPart =
  | { kind: "text"; text: string }
  | { kind: "reasoning"; text: string; durationMs?: number }
  | { kind: "tool"; tool: ToolDisplay }
  | { kind: "error"; text: string };

export interface ToolDisplay {
  toolCallId: string;
  toolName: string;
  step?: number;
  status: "running" | "success";
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
      parts.push({
        kind: "tool",
        tool: {
          toolCallId: p.toolCallId ?? "",
          toolName: p.type.slice("tool-".length),
          status: "success",
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
    parts.push({ kind: "tool", tool: toolDisplayFrom(t) });
  }
  if (turn.text) {
    parts.push({ kind: "text", text: turn.text });
  }
  if (turn.errorText) {
    parts.push({ kind: "error", text: turn.errorText });
  }
  return parts;
}

function toolDisplayFrom(t: ToolCallView): ToolDisplay {
  return {
    toolCallId: t.toolCallId,
    toolName: t.toolName,
    step: t.step,
    status: t.status,
    input: t.input,
    output: t.output,
    startedAt: t.startedAt,
    finishedAt: t.finishedAt,
    rawFrames: t.rawFrames,
  };
}
