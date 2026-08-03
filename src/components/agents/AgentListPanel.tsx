import { Bot, Plus, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import type { ResourceItem } from "../../lib/types";
import { Button, EmptyState, IconButton, Spinner } from "../ui";

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
  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-line bg-bg-elev">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div className="text-sm font-semibold text-fg">Agent 列表</div>
        <IconButton title="刷新列表" onClick={onRefresh}>
          <RefreshCw size={14} className={loading ? "animate-spin" : undefined} />
        </IconButton>
      </div>
      <div className="border-b border-line p-3">
        <Button variant="primary" className="w-full" icon={<Plus size={15} />} onClick={onCreate}>
          新建 Agent
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && agents.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && agents.length === 0 && (
          <EmptyState
            icon={<Bot size={32} />}
            title="暂无 Agent"
            description="点击上方「新建 Agent」创建第一个智能体"
          />
        )}
        <div className="space-y-0.5">
          {agents.map((a) => {
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
    </div>
  );
}
