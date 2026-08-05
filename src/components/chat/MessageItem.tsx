import { useState } from "react";
import { AlertTriangle, Bot, Brain, ChevronRight, Image as ImageIcon, Terminal, User } from "lucide-react";
import { cn } from "../../lib/cn";
import { Markdown } from "../Markdown";
import { CodeBlock } from "../JsonView";
import { ToolCallBlock } from "./ToolCallBlock";
import { formatBytes, formatDuration } from "../../lib/format";
import type { DisplayPart } from "./chatDisplay";

/** 单条消息（用户或助手）。 */
export function MessageItem({
  role,
  parts,
  streaming,
  rawEvents,
  createdAt,
}: {
  role: "user" | "assistant";
  parts: DisplayPart[];
  streaming?: boolean;
  rawEvents?: Array<{ raw: string; at: number }>;
  createdAt?: string;
}) {
  const isUser = role === "user";
  return (
    <div className={cn("flex gap-3 px-5 py-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-accent text-white" : "bg-bg-hover text-fg-muted",
        )}
      >
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={cn("min-w-0 max-w-[85%] flex-1", isUser && "flex flex-col items-end")}>
        {parts.length === 0 && streaming && (
          <div className="inline-flex items-center gap-2 rounded-2xl rounded-tl-sm bg-bg-elev px-4 py-3 text-sm text-fg-faint shadow-sm">
            <span className="animate-pulse-dot">正在思考…</span>
          </div>
        )}
        {parts.map((part, i) => (
          <PartView
            key={i}
            part={part}
            isUser={isUser}
            streaming={streaming && i === parts.length - 1}
          />
        ))}
        {rawEvents && rawEvents.length > 0 && <RawEventsToggle rawEvents={rawEvents} />}
        {createdAt && (
          <div className="mt-1 px-1 text-[11px] text-fg-faint">{createdAt}</div>
        )}
      </div>
    </div>
  );
}

function PartView({
  part,
  isUser,
  streaming,
}: {
  part: DisplayPart;
  isUser: boolean;
  streaming?: boolean;
}) {
  switch (part.kind) {
    case "text":
      return isUser ? (
        <div className="mb-1.5 inline-block rounded-2xl rounded-tr-sm bg-accent px-4 py-2.5 text-sm leading-6 whitespace-pre-wrap text-white shadow-sm">
          {part.text}
        </div>
      ) : (
        <div className="mb-1.5 inline-block w-full rounded-2xl rounded-tl-sm bg-bg-elev px-4 py-3 shadow-sm">
          <Markdown text={part.text} className={cn(streaming && part.text && "stream-caret")} />
        </div>
      );
    case "attachment":
      return (
        <div className="mb-1.5 inline-flex max-w-full items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-3 py-2 text-xs text-accent">
          <ImageIcon size={14} className="shrink-0" />
          <span className="truncate">{part.name}</span>
          <span className="shrink-0 opacity-70">{formatBytes(part.fileSize)}</span>
        </div>
      );
    case "reasoning":
      return <ReasoningBlock text={part.text} durationMs={part.durationMs} streaming={streaming} />;
    case "tool":
      return (
        <div className="mb-1.5">
          <ToolCallBlock tool={part.tool} />
        </div>
      );
    case "error":
      return (
        <div className="mb-1.5 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <span className="break-all">{part.text}</span>
        </div>
      );
  }
}

function ReasoningBlock({
  text,
  durationMs,
  streaming,
}: {
  text: string;
  durationMs?: number;
  streaming?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-1.5 overflow-hidden rounded-lg border border-line bg-bg-sunken">
      <button
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-[13px] text-fg-muted transition-colors hover:bg-bg-hover"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight size={13} className={cn("transition-transform", open && "rotate-90")} />
        <Brain size={13} className="text-accent" />
        <span className="font-medium">思考过程</span>
        {streaming && <span className="animate-pulse-dot text-xs text-accent">进行中</span>}
        {durationMs !== undefined && (
          <span className="text-xs text-fg-faint">{formatDuration(durationMs)}</span>
        )}
      </button>
      {open && (
        <div className="border-t border-line px-3.5 py-2.5 text-[13px] leading-6 whitespace-pre-wrap text-fg-muted">
          {text}
        </div>
      )}
    </div>
  );
}

function RawEventsToggle({ rawEvents }: { rawEvents: Array<{ raw: string; at: number }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-fg-faint transition-colors hover:bg-bg-hover hover:text-fg"
        onClick={() => setOpen((v) => !v)}
      >
        <Terminal size={12} />
        原始 SSE 事件（{rawEvents.length}）
        <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <CodeBlock
          className="mt-1.5"
          maxHeight={320}
          text={rawEvents.map((e) => e.raw).join("\n\n")}
        />
      )}
    </div>
  );
}
