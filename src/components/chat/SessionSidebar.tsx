import { useState } from "react";
import { MessageSquarePlus, Pin, PinOff, Trash2 } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button, EmptyState, IconButton, Input, Spinner } from "../ui";
import { ConfirmModal, Modal } from "../Modal";
import { useChatStore } from "../../stores/chatStore";
import { formatRelativeTime } from "../../lib/format";
import type { SessionInfo } from "../../lib/types";

/** 会话列表侧栏：新建 / 选择 / 重命名 / 置顶 / 删除。 */
export function SessionSidebar() {
  const sessions = useChatStore((s) => s.sessions);
  const loading = useChatStore((s) => s.sessionsLoading);
  const currentId = useChatStore((s) => s.currentSessionId);
  const selectSession = useChatStore((s) => s.selectSession);
  const createSession = useChatStore((s) => s.createSession);
  const removeSession = useChatStore((s) => s.removeSession);
  const renameSession = useChatStore((s) => s.renameSession);
  const togglePin = useChatStore((s) => s.togglePin);

  const [renaming, setRenaming] = useState<SessionInfo | null>(null);
  const [renameText, setRenameText] = useState("");
  const [deleting, setDeleting] = useState<SessionInfo | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex w-[248px] shrink-0 flex-col border-r border-line bg-bg-elev">
      <div className="border-b border-line p-3">
        <Button
          variant="primary"
          className="w-full"
          icon={<MessageSquarePlus size={15} />}
          loading={creating}
          onClick={async () => {
            setCreating(true);
            await createSession();
            setCreating(false);
          }}
        >
          新建会话
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && sessions.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && sessions.length === 0 && (
          <EmptyState
            title="暂无会话"
            description="点击上方「新建会话」开始，或直接在右侧输入问题"
          />
        )}
        <div className="space-y-0.5">
          {sessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === currentId}
              onSelect={() => void selectSession(s.id)}
              onRename={() => {
                setRenaming(s);
                setRenameText(s.title);
              }}
              onPin={() => void togglePin(s.id, !(s as SessionInfo & { is_pinned?: boolean }).is_pinned)}
              onDelete={() => setDeleting(s)}
            />
          ))}
        </div>
      </div>

      <Modal
        open={renaming !== null}
        onClose={() => setRenaming(null)}
        title="重命名会话"
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setRenaming(null)}>取消</Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (renaming && renameText.trim()) {
                  await renameSession(renaming.id, renameText.trim());
                }
                setRenaming(null);
              }}
            >
              保存
            </Button>
          </>
        }
      >
        <Input
          value={renameText}
          onChange={(e) => setRenameText(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && renaming && renameText.trim()) {
              void renameSession(renaming.id, renameText.trim());
              setRenaming(null);
            }
          }}
        />
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="删除会话"
        message={`确定删除会话「${deleting?.title}」吗？服务端记录将被移除。`}
        confirmText="删除"
        danger
        onConfirm={async () => {
          if (deleting) await removeSession(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}

function SessionRow({
  session,
  active,
  onSelect,
  onRename,
  onPin,
  onDelete,
}: {
  session: SessionInfo;
  active: boolean;
  onSelect: () => void;
  onRename: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const pinned = Boolean(
    (session as SessionInfo & { is_pinned?: boolean; pinned?: boolean }).is_pinned ??
      (session as SessionInfo & { pinned?: boolean }).pinned,
  );
  return (
    <div
      className={cn(
        "group cursor-pointer rounded-lg px-2.5 py-2 transition-colors",
        active ? "bg-accent-soft" : "hover:bg-bg-hover",
      )}
      onClick={onSelect}
      onDoubleClick={onRename}
      title="双击重命名"
    >
      <div className="flex items-center gap-1.5">
        {pinned && <Pin size={11} className="shrink-0 text-accent" />}
        <div
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] font-medium",
            active ? "text-accent" : "text-fg",
          )}
        >
          {session.title || "未命名会话"}
        </div>
        <div className="hidden shrink-0 items-center group-hover:flex" onClick={(e) => e.stopPropagation()}>
          <IconButton title={pinned ? "取消置顶" : "置顶"} onClick={onPin}>
            {pinned ? <PinOff size={13} /> : <Pin size={13} />}
          </IconButton>
          <IconButton title="删除" className="hover:text-danger" onClick={onDelete}>
            <Trash2 size={13} />
          </IconButton>
        </div>
      </div>
      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-faint">
        <span>{formatRelativeTime(session.updated_at)}</span>
        {session.agent_id && <span className="text-accent">Agent</span>}
      </div>
    </div>
  );
}
