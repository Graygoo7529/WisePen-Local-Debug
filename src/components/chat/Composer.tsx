import { useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Paperclip, SendHorizonal, SlidersHorizontal, Square, X } from "lucide-react";
import { Badge, Button, IconButton, Input } from "../ui";
import { Modal } from "../Modal";
import { useChatStore } from "../../stores/chatStore";
import { formatBytes } from "../../lib/format";
import { cn } from "../../lib/cn";

/** 消息输入区：附件条 + 文本框 + 工具栏。 */
export function Composer({
  optionsOpen,
  onToggleOptions,
}: {
  optionsOpen: boolean;
  onToggleOptions: () => void;
}) {
  const [query, setQuery] = useState("");
  const sending = useChatStore((s) => s.sending);
  const send = useChatStore((s) => s.send);
  const abort = useChatStore((s) => s.abort);
  const uploadAttachment = useChatStore((s) => s.uploadAttachment);
  const deleteAttachment = useChatStore((s) => s.deleteAttachment);
  const session = useChatStore((s) => s.currentSession);
  const options = useChatStore((s) => s.options);
  const [uploading, setUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeOptionCount =
    (options.model ? 1 : 0) +
    options.onDemandSkillIds.length +
    options.allowToolNames.length +
    options.denyToolNames.length +
    options.frontendStates.length +
    (options.runtimeOptionsText.trim() ? 1 : 0);

  const doSend = async () => {
    const q = query.trim();
    if (!q || sending) return;
    setQuery("");
    await send(q);
    textareaRef.current?.focus();
  };

  const pickFile = async () => {
    const picked = await openDialog({ multiple: false, title: "选择附件（≤100MB）" });
    if (!picked) return;
    setUploading(true);
    await uploadAttachment(picked);
    setUploading(false);
  };

  const tempRefs = session?.temporary_attachment_refs ?? [];
  const resRefs = session?.resource_attachment_refs ?? [];

  return (
    <div className="border-t border-line bg-bg-elev px-4 pt-2 pb-3">
      {(tempRefs.length > 0 || resRefs.length > 0) && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tempRefs.map((a) => (
            <Badge key={a.attachment_id} tone="blue" className="gap-1.5 py-1">
              <Paperclip size={11} />
              {a.attachment_name}
              <span className="text-[10px] opacity-70">{formatBytes(a.file_size)}</span>
              <button
                className="cursor-pointer hover:text-danger"
                title="删除附件"
                onClick={() => void deleteAttachment(a.attachment_id)}
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
          {resRefs.map((a) => (
            <Badge key={a.attachment_id} tone="accent" className="gap-1.5 py-1">
              <FolderPlus size={11} />
              {a.attachment_name}
              <span className="text-[10px] opacity-70">{a.resource_type}</span>
              <button
                className="cursor-pointer hover:text-danger"
                title="删除附件"
                onClick={() => void deleteAttachment(a.attachment_id)}
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-line-strong bg-bg shadow-sm transition-colors focus-within:border-accent">
        <textarea
          ref={textareaRef}
          className="max-h-[180px] min-h-[44px] w-full resize-none bg-transparent px-3.5 pt-3 text-sm leading-6 outline-none placeholder:text-fg-faint"
          placeholder="输入问题，Enter 发送，Shift+Enter 换行"
          value={query}
          rows={Math.min(6, Math.max(1, query.split("\n").length + 1))}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void doSend();
            }
          }}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <IconButton title="上传临时附件" onClick={() => void pickFile()} disabled={uploading}>
            <Paperclip size={16} />
          </IconButton>
          <ResourceAttachButton />
          <div className="relative">
            <IconButton
              title="请求参数（模型 / Skill / 工具 / 上下文）"
              onClick={onToggleOptions}
              className={cn(optionsOpen && "bg-accent-soft text-accent")}
            >
              <SlidersHorizontal size={16} />
            </IconButton>
            {activeOptionCount > 0 && (
              <span className="pointer-events-none absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {activeOptionCount}
              </span>
            )}
          </div>
          <div className="flex-1" />
          {uploading && <span className="text-xs text-fg-faint">上传附件中…</span>}
          {sending ? (
            <Button size="sm" variant="danger" icon={<Square size={13} />} onClick={abort}>
              停止
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              icon={<SendHorizonal size={14} />}
              disabled={!query.trim()}
              onClick={() => void doSend()}
            >
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ResourceAttachButton() {
  const addResourceAttachment = useChatStore((s) => s.addResourceAttachment);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const [open, setOpen] = useState(false);
  const [resourceId, setResourceId] = useState("");
  const [adding, setAdding] = useState(false);

  const submit = async () => {
    const id = resourceId.trim();
    if (!id) return;
    setAdding(true);
    await addResourceAttachment(id);
    setAdding(false);
    setOpen(false);
    setResourceId("");
  };

  return (
    <>
      <IconButton
        title="添加资源附件（输入 resourceId）"
        disabled={!currentSessionId}
        onClick={() => setOpen(true)}
      >
        <FolderPlus size={16} />
      </IconButton>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="添加资源附件"
        width="max-w-sm"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button variant="primary" loading={adding} disabled={!resourceId.trim()} onClick={() => void submit()}>
              添加
            </Button>
          </>
        }
      >
        <div className="text-xs leading-5 text-fg-muted">
          将资源服务中的文档/笔记等资源引用进当前会话（不复制文件）。资源 ID 可在「资源浏览」页复制。
        </div>
        <Input
          className="mt-3 font-mono"
          placeholder="resourceId"
          value={resourceId}
          autoFocus
          onChange={(e) => setResourceId(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          spellCheck={false}
        />
      </Modal>
    </>
  );
}
