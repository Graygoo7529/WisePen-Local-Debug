import { useEffect, useRef, useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FileUp } from "lucide-react";
import { documentApi, DOCUMENT_EXTENSIONS, findUploadedDocument } from "../../api/document";
import { resourceApi } from "../../api/resource";
import type { DocumentInfoResponse, ResourceItem, TagTreeNode } from "../../lib/types";
import { formatBytes } from "../../lib/format";
import { toast } from "../../stores/toastStore";
import { Badge, Button, Field, Select, Spinner } from "../ui";
import { Modal } from "../Modal";
import { JsonView } from "../JsonView";

const TERMINAL = new Set(["READY", "FAILED", "TRANSFER_TIMEOUT", "REGISTERING_RES_TIMEOUT"]);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
interface UploadTask { documentId: string; name: string; status: string; error?: string; groupId?: string; resourceId?: string }

export function DocumentUpload({ open, onClose, target, paths, defaultPath, groupId, spaceName, onBusy, onReady, onOpen }: {
  open: boolean; onClose: () => void; target: DocumentInfoResponse | null; paths: TagTreeNode[]; defaultPath: string; groupId?: string; spaceName: string;
  onBusy: (busy: boolean) => void; onReady: () => void; onOpen: (item: ResourceItem) => void;
}) {
  const [tagId, setTagId] = useState(defaultPath);
  const [file, setFile] = useState<{ path: string; name: string; size: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [phase, setPhase] = useState("");
  const [task, setTask] = useState<UploadTask | null>(null);
  const [watching, setWatching] = useState(false);
  const [error, setError] = useState("");
  const [finding, setFinding] = useState(false);
  // 轮询不因父组件刷新而重启；仅保留最新的事件回调。
  const onReadyRef = useRef(onReady);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);
  useEffect(() => { onBusy(uploading || watching); }, [uploading, watching, onBusy]);
  useEffect(() => { if (open) { setTagId(defaultPath); setFile(null); setPhase(""); setError(""); } }, [open, defaultPath]);
  const taskId = task?.documentId;

  useEffect(() => {
    if (!taskId || !watching) return;
    let active = true;
    let timer: number | undefined;
    const deadline = Date.now() + 5 * 60 * 1000;
    const poll = async () => {
      try {
        const status = await documentApi.syncStatus(taskId);
        if (!active) return;
        setTask(current => current?.documentId === taskId ? { ...current, status: status.status, error: status.errorMessage ?? undefined } : current);
        if (TERMINAL.has(status.status)) {
          setWatching(false);
          if (status.status === "READY") { onReadyRef.current(); toast.success("文档处理完成，可打开阅读"); }
        } else if (Date.now() < deadline) timer = window.setTimeout(() => void poll(), 2000);
        else { setWatching(false); setError("文档仍在处理中。可继续检查，无需重复上传。"); }
      } catch (error) { if (active) { setError(errorText(error)); setWatching(false); } }
    };
    void poll();
    return () => { active = false; window.clearTimeout(timer); };
  }, [taskId, watching]);

  const chooseFile = async () => {
    try {
      const path = await openDialog({ multiple: false, title: "选择文档", filters: [{ name: "PDF / Office", extensions: DOCUMENT_EXTENSIONS }] });
      if (typeof path !== "string") return;
      const stat = await invoke<{ file_name: string; size: number }>("file_stat", { path });
      setFile({ path, name: stat.file_name, size: stat.size });
    } catch (error) { setError(errorText(error)); }
  };
  const upload = async () => {
    if (!file || uploading) return;
    if (!target && !tagId) { setError("请先选择保存目录"); return; }
    if (target && file.name.split(".").pop()?.toUpperCase() !== target.resourceInfo.resourceType) { setError("新版本的文件类型必须与当前文档一致"); return; }
    setUploading(true); setWatching(false); setTask(null); setError("");
    try {
      const id = await documentApi.upload(file.path, target ? undefined : tagId, target?.resourceInfo.resourceId, (next, id) => {
        setPhase(next);
        if (id) setTask({ documentId: id, name: target?.resourceInfo.resourceName ?? file.name, status: "UPLOADING", groupId, resourceId: target?.resourceInfo.resourceId });
      });
      setTask(current => current ? { ...current, documentId: id } : current);
      setWatching(true); onClose();
    } catch (error) { setError(errorText(error)); setPhase("上传未完成"); }
    finally { setUploading(false); }
  };
  const openTask = async () => {
    if (!task) return;
    setFinding(true); setError("");
    try {
      const item = task.resourceId ? await resourceApi.getResourceBaseInfo(task.resourceId) : await findUploadedDocument(task.documentId, task.name, task.groupId);
      if (!item) throw new Error("文档已就绪，尚未找到对应资源；请稍后再次打开。");
      onOpen(item);
    } catch (error) { setError(errorText(error)); }
    finally { setFinding(false); }
  };
  const retryTask = async () => {
    if (!task) return;
    try { await documentApi.retry(task.documentId); setError(""); setWatching(true); }
    catch (error) { setError(errorText(error)); }
  };
  return <>
    {task && <div className="border-b border-line bg-bg-elev px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3" aria-live="polite">{watching && <Spinner size={14} />}<span className="max-w-64 truncate">{task.name}</span><Badge tone={task.status === "READY" ? "green" : task.status.includes("FAILED") || task.status.includes("TIMEOUT") ? "red" : "blue"}>{uploading ? phase : task.status}</Badge>
        {task.status === "READY" ? <Button size="xs" loading={finding} onClick={() => void openTask()}>打开文档</Button> : !watching && !uploading && <Button size="xs" onClick={() => { setError(""); setWatching(true); }}>检查进度</Button>}
        {!watching && ["FAILED", "REGISTERING_RES_TIMEOUT"].includes(task.status) && <Button size="xs" onClick={() => void retryTask()}>重试处理</Button>}
      </div>
      {(task.error || error) && <p role="alert" className="mt-2 text-xs text-danger">{error || task.error}</p>}
      <details className="mt-2 text-xs text-fg-muted"><summary className="cursor-pointer">任务调试信息</summary><JsonView data={task} /></details>
    </div>}
    <Modal open={open} onClose={() => { if (!uploading) onClose(); }} title={target ? `上传新版本 · ${target.resourceInfo.resourceName}` : "上传文档"} footer={<><Button disabled={uploading} onClick={onClose}>取消</Button><Button variant="primary" disabled={!file} loading={uploading} onClick={() => void upload()}>上传并解析</Button></>}>
      <div className="space-y-4"><p className="text-sm text-fg-muted">支持 PDF、Word、PowerPoint 和 Excel，最大 100 MiB。{target ? "保留原资源及其位置，生成一个新版本。" : `上传到${spaceName}，完成后即可阅读。`}</p>
        {!target && <Field label="保存目录"><Select value={tagId} disabled={uploading} onChange={event => setTagId(event.target.value)} options={paths.map(tag => ({ value: tag.tagId, label: tag.tagName === "/" ? "根目录" : tag.tagName }))} /></Field>}
        <Button className="w-full" variant="outline" icon={<FileUp size={16} />} disabled={uploading} onClick={() => void chooseFile()}>{file?.name ?? "选择本地文件"}</Button>
        {file && <p className="text-xs text-fg-muted">{formatBytes(file.size)}</p>}{phase && <p className="text-sm text-accent" aria-live="polite">{phase}</p>}{error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </Modal>
  </>;
}
