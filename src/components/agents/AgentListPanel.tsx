import { useState } from "react";
import { Bot, Plus, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import type { ResourceItem } from "../../lib/types";
import { Button, EmptyState, IconButton, Input, Spinner } from "../ui";

/** 左侧 Agent 资源列表（resourceType=AGENT）。 */
export function AgentListPanel({
  agents,
  loading,
  selectedId,
  onSelect,
  onRefresh,
  onCreate,
}: {
  agents: ResourceItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (resourceId: string) => void;
  onRefresh: () => void;
  onCreate: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [manualId, setManualId] = useState("");
  const normalizedKeyword = keyword.trim().toLowerCase();
  const filtered = normalizedKeyword
    ? agents.filter(
        (agent) =>
          agent.resourceName?.toLowerCase().includes(normalizedKeyword) ||
          agent.resourceId.toLowerCase().includes(normalizedKeyword),
      )
    : agents;

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-line bg-bg-elev">
      <div className="space-y-2 border-b border-line p-3">
        <Button variant="primary" className="w-full" icon={<Plus size={15} />} onClick={onCreate}>
          新建 Agent
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            value={keyword}
            placeholder="按名称 / resourceId 过滤"
            spellCheck={false}
            onChange={(event) => setKeyword(event.target.value)}
          />
          <IconButton title="刷新列表" onClick={onRefresh}>
            <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && agents.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <EmptyState
            icon={<Bot size={32} />}
            title={agents.length === 0 ? "暂无 Agent" : "没有匹配的 Agent"}
            description={agents.length === 0 ? "点击上方「新建 Agent」创建第一个智能体" : undefined}
          />
        )}
        <div className="space-y-0.5">
          {filtered.map((a) => {
            const active = a.resourceId === selectedId;
            return (
              <div
                key={a.resourceId}
                onClick={() => onSelect(a.resourceId)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2 transition-colors",
                  active ? "bg-accent-soft" : "hover:bg-bg-hover",
                )}
              >
                <div
                  className={cn(
                    "truncate text-[13px] font-medium",
                    active ? "text-accent" : "text-fg",
                  )}
                >
                  {a.resourceName || "未命名 Agent"}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">
                  {a.resourceId}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line p-3">
        <div className="text-xs font-medium text-fg-muted">手动加载</div>
        <div className="flex items-center gap-1.5">
          <Input
            value={manualId}
            placeholder="输入 resourceId"
            className="font-mono"
            spellCheck={false}
            onChange={(event) => setManualId(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && manualId.trim()) onSelect(manualId.trim());
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!manualId.trim()}
            onClick={() => onSelect(manualId.trim())}
          >
            加载
          </Button>
        </div>
      </div>
    </div>
  );
}
