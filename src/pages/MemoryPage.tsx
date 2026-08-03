import { useCallback, useEffect, useState } from "react";
import { Brain, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
import { chatApi } from "../api/chat";
import type { MemoryItem } from "../lib/types";
import {
  Button,
  Card,
  CopyButton,
  EmptyState,
  PageHeader,
  Spinner,
} from "../components/ui";
import { ConfirmModal } from "../components/Modal";
import { JsonView } from "../components/JsonView";
import { toast } from "../stores/toastStore";
import { cn } from "../lib/cn";

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function MemoryCard({ item, onDelete }: { item: MemoryItem; onDelete: () => void }) {
  const [metaOpen, setMetaOpen] = useState(false);
  const metaCount = item.metadata ? Object.keys(item.metadata).length : 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm leading-6 whitespace-pre-wrap text-fg">{item.memory}</div>
          <div className="mt-2 flex items-center gap-1">
            <span className="font-mono text-xs break-all text-fg-faint">{item.id}</span>
            <CopyButton text={item.id} title="复制记忆 ID" />
          </div>
        </div>
        <Button
          size="xs"
          variant="danger"
          icon={<Trash2 size={12} />}
          onClick={onDelete}
          className="mt-0.5"
        >
          删除
        </Button>
      </div>
      {metaCount > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <button
            className="flex cursor-pointer items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg"
            onClick={() => setMetaOpen((v) => !v)}
          >
            <ChevronRight size={12} className={cn("transition-transform", metaOpen && "rotate-90")} />
            metadata（{metaCount} 个字段）
          </button>
          {metaOpen && <JsonView data={item.metadata} className="mt-2" />}
        </div>
      )}
    </Card>
  );
}

export default function MemoryPage() {
  const [memories, setMemories] = useState<MemoryItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MemoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await chatApi.listMemories();
      setMemories(list);
    } catch (e) {
      toast.error(`加载记忆失败：${errText(e)}`);
      setMemories((prev) => prev ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatApi.deleteMemory(deleteTarget.id);
      toast.success("已删除该条记忆");
      setDeleteTarget(null);
      await load();
    } catch (e) {
      toast.error(`删除失败：${errText(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  const confirmClear = async () => {
    setClearing(true);
    try {
      await chatApi.deleteAllMemories();
      toast.success("已清空全部长期记忆");
      setClearOpen(false);
      await load();
    } catch (e) {
      toast.error(`清空失败：${errText(e)}`);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <PageHeader
          title="长期记忆"
          description="对话中沉淀的长期记忆（chat-service /chat/memory）。删除后立即生效，请谨慎操作。"
          actions={
            <>
              <Button
                variant="outline"
                icon={<RefreshCw size={14} />}
                loading={loading}
                onClick={() => void load()}
              >
                刷新
              </Button>
              <Button
                variant="danger"
                icon={<Trash2 size={14} />}
                disabled={!memories || memories.length === 0}
                onClick={() => setClearOpen(true)}
              >
                清空全部
              </Button>
            </>
          }
        />

        {memories === null ? (
          <div className="flex justify-center py-16">
            <Spinner size={20} />
          </div>
        ) : memories && memories.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Brain size={36} />}
              title="暂无长期记忆"
              description="与智能体对话并开启长期记忆策略后，沉淀的记忆会出现在这里。"
            />
          </Card>
        ) : (
          <>
            <div className="mb-3 text-xs text-fg-muted">
              共 {memories?.length ?? 0} 条记忆
              {loading && <Spinner size={12} className="ml-2 inline-block" />}
            </div>
            <div className="space-y-3">
              {memories?.map((m) => (
                <MemoryCard key={m.id} item={m} onDelete={() => setDeleteTarget(m)} />
              ))}
            </div>
          </>
        )}
      </div>

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDelete()}
        title="删除记忆"
        message={
          <>
            确定删除这条记忆吗？
            {deleteTarget && (
              <span className="mt-2 block rounded-lg bg-bg-sunken px-3 py-2 text-xs break-all text-fg-faint">
                {deleteTarget.memory}
              </span>
            )}
          </>
        }
        confirmText="删除"
        danger
        loading={deleting}
      />
      <ConfirmModal
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void confirmClear()}
        title="清空全部长期记忆"
        message={`确定清空全部 ${memories?.length ?? 0} 条长期记忆吗？此操作不可恢复，删除后无法找回，请谨慎确认。`}
        confirmText="清空全部"
        danger
        loading={clearing}
      />
    </div>
  );
}
