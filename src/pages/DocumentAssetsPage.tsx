import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FileText, FileUp, FolderOpen, RefreshCw, UserRound } from "lucide-react";
import { DOCUMENT_EXTENSIONS } from "../api/document";
import { resourceApi } from "../api/resource";
import { verifyIdentity } from "../api/user";
import { useSettingsStore } from "../stores/settingsStore";
import { toast } from "../stores/toastStore";
import type { CurrentUser, DocumentInfoResponse, ResourceItem, TagTreeNode, UserGroup } from "../lib/types";
import { cn } from "../lib/cn";
import { formatBytes } from "../lib/format";
import { Badge, Button, EmptyState, Input, Select, Spinner } from "../components/ui";
import { JsonView } from "../components/JsonView";
import { ConfirmModal } from "../components/Modal";
import { TagTreeItem } from "../components/resources/TagTreeItem";
import { DocumentReader } from "../components/documents/DocumentReader";
import { DocumentUpload } from "../components/documents/DocumentUpload";

const PAGE_SIZE = 30;
const isDocument = (type: string) => DOCUMENT_EXTENSIONS.includes(type.toLowerCase());
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);
const flatten = (nodes: TagTreeNode[]): TagTreeNode[] => nodes.flatMap(node => [node, ...flatten(node.children)]);

/** 连接变更时重建用户空间，避免残留上一个身份的资源和异步结果。 */
export default function DocumentAssetsPage() {
  const s = useSettingsStore();
  const identityKey = [s.userId, s.identityType, s.userStatus, s.groupRoleMap, s.fromSource, s.xDeveloper, s.developer, s.userBaseUrl, s.resourceBaseUrl, s.documentBaseUrl, s.storageBaseUrl].join("|");
  return <VerifiedSpace key={identityKey} />;
}

function VerifiedSpace() {
  const [context, setContext] = useState<{ user: CurrentUser; groups: UserGroup[] } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setContext(null); setError("");
    void verifyIdentity(useSettingsStore.getState()).then(value => { if (active) setContext(value); }).catch(error => { if (active) setError(errorText(error)); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <EmptyState title="连接与身份需要核对" description={error} action={<div className="flex gap-3"><Link className="text-sm text-accent" to="/settings">前往设置</Link><Button size="sm" onClick={() => setAttempt(value => value + 1)}>重新检查</Button></div>} />;
  if (!context) return <div className="flex h-full items-center justify-center gap-2 text-sm text-fg-muted"><Spinner />正在核对当前身份与用户空间…</div>;
  return <DocumentSpace {...context} />;
}

function DocumentSpace({ user, groups }: { user: CurrentUser; groups: UserGroup[] }) {
  const [groupId, setGroupId] = useState("");
  const [tree, setTree] = useState<TagTreeNode[]>([]);
  const [treeError, setTreeError] = useState("");
  const [treeLoading, setTreeLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [listError, setListError] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<ResourceItem | null>(null);
  const [readerRevision, setReaderRevision] = useState(0);
  const [manualId, setManualId] = useState("");
  const [openingId, setOpeningId] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<DocumentInfoResponse | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResourceItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    let active = true;
    setTree([]); setTreeError(""); setTreeLoading(true);
    void resourceApi.getTagTree(groupId || undefined).then(nodes => { if (active) setTree(nodes); }).catch(error => { if (active) setTreeError(errorText(error)); }).finally(() => { if (active) setTreeLoading(false); });
    return () => { active = false; };
  }, [groupId, reload]);

  useEffect(() => {
    let active = true;
    setItems([]); setListError(""); setListLoading(true);
    void resourceApi.listResources({ groupId: groupId || undefined, tagIds: selectedTag ? [selectedTag] : undefined, resourceType: type || undefined, page, size: PAGE_SIZE, sortBy: "CREATE_TIME", sortDir: "DESC" }).then(result => {
      if (active) { setItems(result.list); setTotal(Number(result.total)); }
    }).catch(error => { if (active) { setListError(errorText(error)); setTotal(0); } }).finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [groupId, selectedTag, type, page, reload]);

  const tags = flatten(tree);
  const currentTag = tags.find(tag => tag.tagId === selectedTag);
  const inTrash = (tag: TagTreeNode) => {
    let node: TagTreeNode | undefined = tag;
    const seen = new Set<string>();
    while (node && !seen.has(node.tagId)) {
      if (node.tagName === ".Trash") return true;
      seen.add(node.tagId);
      const parentId: string = node.parentId;
      node = tags.find(item => item.tagId === parentId);
    }
    return false;
  };
  const paths = tags.filter(tag => tag.isPath && !inTrash(tag));
  const defaultPath = currentTag?.isPath && !inTrash(currentTag) ? currentTag.tagId : paths.find(tag => tag.tagName === "/")?.tagId ?? "";
  const spaceName = groupId ? groups.find(group => group.groupId === groupId)?.groupName ?? "小组空间" : "我的空间";
  const canUpload = !treeLoading && !treeError && (!currentTag || !inTrash(currentTag)) && !uploadBusy && paths.length > 0;
  const beginUpload = (target: DocumentInfoResponse | null = null) => {
    if (uploadBusy) { toast.info("请先等待当前上传处理完成"); return; }
    setUploadTarget(target); setUploadOpen(true);
  };
  const openById = async () => {
    if (!manualId.trim()) return;
    setOpeningId(true);
    try { setSelected(await resourceApi.getResourceBaseInfo(manualId.trim())); setReaderRevision(value => value + 1); }
    catch (error) { toast.error(errorText(error)); }
    finally { setOpeningId(false); }
  };
  const visible = items.filter(item => item.resourceName.toLowerCase().includes(keyword.toLowerCase()));
  const deleteDocument = async () => {
    if (!deleteTarget || deleting || uploadBusy) return;
    setDeleting(true); setDeleteError("");
    try {
      await resourceApi.removeResources([deleteTarget.resourceId]);
      setSelected(current => current?.resourceId === deleteTarget.resourceId ? null : current);
      setDeleteTarget(null); setPage(1); setReload(value => value + 1);
      toast.success("文档已删除");
    } catch (error) { setDeleteError(errorText(error)); }
    finally { setDeleting(false); }
  };

  return <div className="flex h-full min-w-0 flex-col">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-bg-elev px-5 py-4">
      <div><h1 className="text-lg font-semibold">文档空间</h1><p className="mt-1 text-xs text-fg-muted">从空间选择资源，上传、阅读并查看解析结果。</p></div>
      <div className="flex items-center gap-2"><Button size="sm" variant="outline" icon={<RefreshCw size={14} />} onClick={() => { setReload(value => value + 1); setReaderRevision(value => value + 1); }}>刷新</Button><Button size="sm" variant="primary" icon={<FileUp size={14} />} disabled={!canUpload} onClick={() => beginUpload()}>上传文档</Button></div>
    </header>
    <ConfirmModal open={deleteTarget !== null} onClose={() => { if (!deleting) setDeleteTarget(null); }} onConfirm={() => void deleteDocument()} title="删除文档" confirmText="确认删除" danger loading={deleting} message={<>
      <p>确定删除“{deleteTarget?.resourceName}”吗？</p>
      <p className="mt-2">文档将从个人及共享空间移除，所有版本都将无法继续访问。此操作不是移入回收站，当前页面无法恢复。</p>
      {deleteError && <p role="alert" className="mt-3 text-danger">{deleteError}</p>}
    </>} />
    <DocumentUpload open={uploadOpen} onClose={() => setUploadOpen(false)} target={uploadTarget} paths={paths} defaultPath={defaultPath} groupId={groupId || undefined} spaceName={spaceName} onBusy={setUploadBusy} onReady={() => setReload(value => value + 1)} onOpen={item => { setSelected(item); setReaderRevision(value => value + 1); }} />
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-[290px] shrink-0 flex-col border-r border-line bg-bg-elev">
        <div className="space-y-3 border-b border-line p-3"><div className="flex items-center gap-2 text-sm"><UserRound size={17} className="text-accent" /><span className="truncate">{user.userInfo.nickname || user.userInfo.username}</span><Badge tone="green">身份已核对</Badge></div>
          <Select aria-label="用户空间" value={groupId} onChange={event => { setGroupId(event.target.value); setSelectedTag(null); setPage(1); setSelected(null); setKeyword(""); }} options={[{ value: "", label: "我的空间" }, ...groups.map(group => ({ value: group.groupId, label: group.groupName }))]} />
        </div>
        <div className="max-h-[30vh] shrink-0 overflow-y-auto border-b border-line p-2">
          <button className={cn("mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm", !selectedTag ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover")} onClick={() => { setSelectedTag(null); setPage(1); }}><FolderOpen size={15} />全部资源</button>
          {treeLoading ? <div className="p-3"><Spinner /></div> : treeError ? <p role="alert" className="p-2 text-xs text-danger">{treeError}</p> : tree.map(node => <TagTreeItem key={node.tagId} node={node} selectedId={selectedTag} onSelect={id => { setSelectedTag(id); setPage(1); }} />)}
        </div>
        <div className="space-y-2 border-b border-line p-3"><div className="truncate text-xs text-fg-muted">{spaceName} / {currentTag?.tagName === "/" ? "根目录" : currentTag?.tagName ?? "全部资源"}</div><Select aria-label="资源类型" value={type} onChange={event => { setType(event.target.value); setPage(1); }} options={[{ value: "", label: "全部资源类型" }, ...[...DOCUMENT_EXTENSIONS.map(value => value.toUpperCase()), "NOTE", "SKILL", "AGENT"].map(value => ({ value, label: value }))]} /><Input aria-label="筛选当前页资源" value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="筛选当前页名称…" /></div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {listLoading ? <div className="flex justify-center p-8"><Spinner /></div> : listError ? <EmptyState title="资源加载失败" description={listError} /> : visible.length === 0 ? <EmptyState title={items.length ? "当前页没有匹配资源" : "这里还没有资源"} description="选择其他目录，或上传一份文档。" /> : visible.map(item => <button key={item.resourceId} className={cn("mb-1 flex w-full items-start gap-2 rounded-lg px-3 py-3 text-left", selected?.resourceId === item.resourceId ? "bg-accent-soft text-accent" : "text-fg hover:bg-bg-hover")} onClick={() => setSelected(item)}><FileText size={17} className="mt-0.5 shrink-0" /><span className="min-w-0"><span className="block truncate text-sm" title={item.resourceName}>{item.resourceName}</span><span className="mt-1 block text-[11px] text-fg-muted">{item.resourceType} · {formatBytes(Number(item.size ?? 0))}</span></span></button>)}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-line p-3 text-xs text-fg-muted"><span>{page} 页 · {total} 项</span><div className="flex gap-1"><Button size="xs" disabled={page <= 1 || listLoading} onClick={() => setPage(value => value - 1)}>上一页</Button><Button size="xs" disabled={page * PAGE_SIZE >= total || listLoading} onClick={() => setPage(value => value + 1)}>下一页</Button></div></div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        {selected ? isDocument(selected.resourceType) ? <DocumentReader key={`${selected.resourceId}:${readerRevision}`} resourceId={selected.resourceId} onUploadVersion={beginUpload} deleteDisabled={uploadBusy || uploadOpen} onDelete={info => { setDeleteError(""); setDeleteTarget(info.resourceInfo); }} /> : <div className="p-5"><h2 className="mb-2 text-lg font-semibold">{selected.resourceName}</h2><Badge>{selected.resourceType}</Badge><p className="my-4 text-sm text-fg-muted">这是 {selected.resourceType} 资源。文档阅读器支持 PDF、Word、PowerPoint 和 Excel。</p>{["SKILL", "AGENT"].includes(selected.resourceType) && <Link className="text-sm text-accent" to={selected.resourceType === "SKILL" ? "/skills" : "/agents"}>前往对应工作台</Link>}<details className="mt-5"><summary className="cursor-pointer text-sm text-fg-muted">资源详情</summary><JsonView data={selected} /></details></div> : <EmptyState icon={<FolderOpen size={32} />} title="选择一份文档开始阅读" description="左侧列出当前空间的目录和资源。选择文档后可预览、切换版本、查看解析正文及图片。" action={<Button variant="primary" disabled={!canUpload} onClick={() => beginUpload()}>上传文档</Button>} />}
        <details className="mx-5 mb-5 rounded-xl border border-line bg-bg-elev"><summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">连接调试</summary><div className="space-y-3 border-t border-line p-4 text-xs"><JsonView data={{ userId: user.userId, identityType: user.userInfo.identityType, status: user.userInfo.userStatus, space: groupId || "personal", selectedTagId: selectedTag, developer: useSettingsStore.getState().xDeveloper, documentService: useSettingsStore.getState().documentBaseUrl, resourceService: useSettingsStore.getState().resourceBaseUrl }} defaultExpandDepth={1} /><p className="text-fg-muted">身份使用设置页当前生效值；配置文件仅在导入时生效。开发者请求头用于 HTTP 调用，不保证 Kafka 消费实例相同。</p><div className="flex gap-2"><Input aria-label="手动打开资源 ID" value={manualId} onChange={event => setManualId(event.target.value)} placeholder="按 resourceId 打开" /><Button size="sm" loading={openingId} onClick={() => void openById()}>打开</Button></div></div></details>
      </main>
    </div>
  </div>;
}
