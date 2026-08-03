import { useState } from "react";
import { ChevronRight, Clock, Wrench } from "lucide-react";
import { cn } from "../../lib/cn";
import { Badge, Tabs } from "../ui";
import { CodeBlock, JsonView } from "../JsonView";
import { formatDuration } from "../../lib/format";
import type { ToolDisplay } from "./chatDisplay";

/** 工具调用卡片：头部摘要 + 可展开的 输入/输出/原始帧/耗时。 */
export function ToolCallBlock({ tool }: { tool: ToolDisplay }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("input");
  const duration =
    tool.startedAt && tool.finishedAt ? tool.finishedAt - tool.startedAt : undefined;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-bg-sunken">
      <button
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={14}
          className={cn("shrink-0 text-fg-faint transition-transform", expanded && "rotate-90")}
        />
        <Wrench size={13} className="shrink-0 text-fg-faint" />
        <span className="font-mono text-[13px] font-medium text-fg">{tool.toolName}</span>
        {tool.step !== undefined && tool.step > 0 && (
          <Badge tone="gray">step {tool.step}</Badge>
        )}
        {tool.status === "running" ? (
          <Badge tone="blue">
            <span className="animate-pulse-dot">运行中</span>
          </Badge>
        ) : (
          <Badge tone="green">完成</Badge>
        )}
        {duration !== undefined && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-fg-faint">
            <Clock size={11} />
            {formatDuration(duration)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-line px-3 py-2.5">
          <Tabs
            className="mb-2.5"
            active={tab}
            onChange={setTab}
            tabs={[
              { key: "input", label: "输入" },
              { key: "output", label: "输出" },
              { key: "raw", label: `原始帧 (${tool.rawFrames?.length ?? 0})` },
              { key: "timing", label: "时间" },
            ]}
          />
          {tab === "input" &&
            (tool.input !== undefined && tool.input !== null ? (
              typeof tool.input === "string" ? (
                <CodeBlock text={tool.input} />
              ) : (
                <JsonView data={tool.input} />
              )
            ) : (
              <Hint text={tool.status === "running" ? "等待输入参数…" : "无输入"} />
            ))}
          {tab === "output" &&
            (tool.output !== undefined && tool.output !== null ? (
              typeof tool.output === "string" ? (
                <CodeBlock text={tool.output} />
              ) : (
                <JsonView data={tool.output} />
              )
            ) : (
              <Hint text={tool.status === "running" ? "执行中，等待输出…" : "无输出"} />
            ))}
          {tab === "raw" &&
            (tool.rawFrames && tool.rawFrames.length > 0 ? (
              <CodeBlock text={tool.rawFrames.join("\n\n")} />
            ) : (
              <Hint text="历史消息无原始帧（仅实时回合记录）" />
            ))}
          {tab === "timing" && (
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <TimingRow label="开始" value={fmtTime(tool.startedAt)} />
              <TimingRow label="结束" value={fmtTime(tool.finishedAt)} />
              <TimingRow label="耗时" value={formatDuration(duration)} />
              <TimingRow label="toolCallId" value={tool.toolCallId} mono />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div className="py-2 text-xs text-fg-faint">{text}</div>;
}

function TimingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-fg-faint">{label}</span>
      <span className={cn("text-fg", mono && "font-mono text-xs break-all")}>{value}</span>
    </div>
  );
}

function fmtTime(ts?: number): string {
  if (!ts) return "-";
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
