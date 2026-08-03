import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "../lib/cn";
import { CopyButton } from "./ui";
import { prettyJson } from "../lib/format";

/** 可折叠 JSON 树查看器。 */
export function JsonView({
  data,
  defaultExpandDepth = 2,
  className,
}: {
  data: unknown;
  defaultExpandDepth?: number;
  className?: string;
}) {
  const text = useMemo(() => prettyJson(data), [data]);
  return (
    <div className={cn("group relative rounded-lg bg-code-bg p-3", className)}>
      <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={text} />
      </div>
      <div className="font-mono text-[12.5px] leading-[1.55]">
        <JsonNode value={data} depth={0} defaultExpandDepth={defaultExpandDepth} />
      </div>
    </div>
  );
}

function JsonNode({
  name,
  value,
  depth,
  defaultExpandDepth,
}: {
  name?: string;
  value: unknown;
  depth: number;
  defaultExpandDepth: number;
}) {
  const [expanded, setExpanded] = useState(depth < defaultExpandDepth);

  const keyLabel = name !== undefined && (
    <span className="text-info">{JSON.stringify(name)}: </span>
  );

  if (value === null || value === undefined) {
    return (
      <div>
        {keyLabel}
        <span className="text-fg-faint">null</span>
      </div>
    );
  }
  if (typeof value === "boolean") {
    return (
      <div>
        {keyLabel}
        <span className="text-warning">{String(value)}</span>
      </div>
    );
  }
  if (typeof value === "number") {
    return (
      <div>
        {keyLabel}
        <span className="text-accent">{String(value)}</span>
      </div>
    );
  }
  if (typeof value === "string") {
    return (
      <div className="break-all">
        {keyLabel}
        <span className="text-success whitespace-pre-wrap">{JSON.stringify(value)}</span>
      </div>
    );
  }

  const isArray = Array.isArray(value);
  const entries = isArray
    ? (value as unknown[]).map((v, i) => [i, v] as const)
    : Object.entries(value as Record<string, unknown>);
  const open = isArray ? "[" : "{";
  const close = isArray ? "]" : "}";

  if (entries.length === 0) {
    return (
      <div>
        {keyLabel}
        <span className="text-fg-faint">
          {open} {close}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        className="inline-flex cursor-pointer items-center gap-0.5 text-fg-muted hover:text-fg"
        onClick={() => setExpanded((v) => !v)}
      >
        <ChevronRight
          size={12}
          className={cn("transition-transform", expanded && "rotate-90")}
        />
        {keyLabel}
        <span className="text-fg-faint">
          {open} {entries.length} {isArray ? "项" : "键"}
        </span>
      </button>
      {expanded ? (
        <div className="ml-3 border-l border-line pl-2.5">
          {entries.map(([k, v]) => (
            <JsonNode
              key={String(k)}
              name={isArray ? undefined : String(k)}
              value={v}
              depth={depth + 1}
              defaultExpandDepth={defaultExpandDepth}
            />
          ))}
          <div className="text-fg-faint">{close}</div>
        </div>
      ) : (
        <span className="text-fg-faint"> … {close}</span>
      )}
    </div>
  );
}

/** 等宽代码块（原始 SSE 帧、长文本等）。 */
export function CodeBlock({
  text,
  className,
  maxHeight = 400,
}: {
  text: string;
  className?: string;
  maxHeight?: number;
}) {
  return (
    <div className={cn("group relative rounded-lg bg-code-bg", className)}>
      <div className="absolute top-2 right-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <CopyButton text={text} />
      </div>
      <pre
        className="overflow-auto p-3 font-mono text-[12.5px] leading-[1.55] break-all whitespace-pre-wrap"
        style={{ maxHeight }}
      >
        {text}
      </pre>
    </div>
  );
}
