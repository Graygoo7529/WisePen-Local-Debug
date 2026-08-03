import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Folder, RefreshCw, Search, Tag } from "lucide-react";
import { resourceApi } from "../api/resource";
import type {
  ResourceItem,
  ResourceType,
  SearchHitItem,
  TagTreeNode,
} from "../lib/types";
import {
  Badge,
  Button,
  CopyButton,
  EmptyState,
  Input,
  PageHeader,
  Select,
  Spinner,
  type BadgeTone,
} from "../components/ui";
import { Modal } from "../components/Modal";
import { JsonView } from "../components/JsonView";
import { formatBytes, formatDateTime } from "../lib/format";
import { toast } from "../stores/toastStore";
import { cn } from "../lib/cn";

const PAGE_SIZE = 20;

const TYPE_OPTIONS = [
  { value: "", label: "全部类型" },
  { value: "NOTE", label: "NOTE" },
  { value: "PDF", label: "PDF" },
  { value: "DOC", label: "DOC" },
  { value: "DOCX", label: "DOCX" },
  { value: "SKILL", label: "SKILL" },
  { value: "AGENT", label: "AGENT" },
  { value: "DRAWIO", label: "DRAWIO" },
];

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function typeTone(t: string): BadgeTone {
  if (t === "NOTE") return "accent";
  if (t === "SKILL" || t === "AGENT") return "green";
  if (t === "PDF" || t === "DOC" || t === "DOCX") return "blue";
  if (t === "DRAWIO") return "yellow";
  return "gray";
}

// ============ 标签树 ============
function TagTreeItem({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: TagTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (tagId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  const selected = selectedId === node.tagId;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-0.5 rounded-md py-1 pr-1.5 text-[13px] transition-colors",
          selected ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover hover:text-fg",
        )}
        style={{ paddingLeft: depth * 14 + 6 }}
      >
        {hasChildren ? (
          <button
            className="flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center"
            onClick={() => setOpen((v) => !v)}
            title={open ? "收起" : "展开"}
          >
            <ChevronRight size={12} className={cn("transition-transform", open && "rotate-90")} />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
          title={node.tagName}
          onClick={() => onSelect(node.tagId)}
        >
          {node.isPath ? <Folder size={13} className="shrink-0" /> : <Tag size={12} className="shrink-0" />}
          <span className="truncate">{node.tagName}</span>
        </button>
      </div>
      {open &&
        node.children.map((child) => (
          <TagTreeItem
            key={child.tagId}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

// ============ 页面 ============
export default function ResourcesPage() {
  // 标签树
  const [tree, setTree] = useState<TagTreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState<string | null>(null);
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);

  // 筛选与结果
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [keyword, setKeyword] = useState("");
  const [appliedKeyword, setAppliedKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<Array<ResourceItem | SearchHitItem>>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  // 详情弹窗
  const [detail, setDetail] = useState<
    { resourceId: string; loading: true } | { resourceId: string; loading: false; data: ResourceItem } | null
  >(null);

  const searchMode = appliedKeyword !== "";

  const loadTree = useCallback(async () => {
    setTreeLoading(true);
    setTreeError(null);
    try {
      const nodes = await resourceApi.getTagTree();
      setTree(nodes);
    } catch (e) {
      setTreeError(errText(e));
      setTree(null);
    } finally {
      setTreeLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  const load = useCallback(async () => {
    setLoading(true);
    setListError(null);
    try {
      if (appliedKeyword) {
        const res = await resourceApi.globalSearchResources(appliedKeyword, "ALL", page, PAGE_SIZE);
        setItems(res.list);
        setTotal(res.total);
      } else {
        const res = await resourceApi.listResources({
          resourceType: (typeFilter || undefined) as ResourceType | undefined,
          tagIds: selectedTagId ? [selectedTagId] : undefined,
          page,
          size: PAGE_SIZE,
        });
        setItems(res.list);
        setTotal(res.total);
      }
    } catch (e) {
      setListError(errText(e));
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [appliedKeyword, typeFilter, selectedTagId, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const onSelectTag = (tagId: string) => {
    setSelectedTagId((prev) => (prev === tagId ? null : tagId));
    setPage(1);
  };

  const applySearch = () => {
    setAppliedKeyword(keyword.trim());
    setPage(1);
  };

  const openDetail = async (resourceId: string) => {
    setDetail({ resourceId, loading: true });
    try {
      const data = await resourceApi.getResourceBaseInfo(resourceId);
      setDetail({ resourceId, loading: false, data });
    } catch (e) {
      setDetail(null);
      toast.error(`获取资源详情失败：${errText(e)}`);
    }
  };

  const hasPrev = page > 1;
  const hasNext = page * PAGE_SIZE < total;

  return (
    <div className="flex h-full">
      {/* 左：标签树 */}
      <div className="flex w-64 shrink-0 flex-col border-r border-line bg-bg-elev">
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-line px-3">
          <span className="text-sm font-semibold text-fg">标签</span>
          <Button size="xs" variant="ghost" icon={<RefreshCw size={12} />} loading={treeLoading} onClick={() => void loadTree()}>
            刷新
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {treeLoading && tree === null ? (
            <div className="flex justify-center py-10">
              <Spinner size={18} />
            </div>
          ) : treeError ? (
            <EmptyState
              title="标签树加载失败"
              description={treeError}
              action={
                <Button size="sm" variant="outline" onClick={() => void loadTree()}>
                  重试
                </Button>
              }
            />
          ) : tree && tree.length === 0 ? (
            <EmptyState title="暂无标签" description="资源服务中还没有可用标签。" />
          ) : (
            tree?.map((node) => (
              <TagTreeItem
                key={node.tagId}
                node={node}
                depth={0}
                selectedId={selectedTagId}
                onSelect={onSelectTag}
              />
            ))
          )}
        </div>
        {selectedTagId && (
          <div className="shrink-0 border-t border-line px-3 py-2">
            <button
              className="cursor-pointer text-xs text-accent hover:underline"
              onClick={() => {
                setSelectedTagId(null);
                setPage(1);
              }}
            >
              清除标签筛选
            </button>
          </div>
        )}
      </div>

      {/* 右：筛选 + 结果 */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="shrink-0 border-b border-line px-4 pt-4 pb-3">
          <PageHeader
            title="资源浏览"
            description={searchMode ? `全局搜索：${appliedKeyword}` : "个人空间资源列表，可按类型与标签筛选。"}
          />
          <div className="flex items-center gap-2">
            <Select
              className="w-36"
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                setPage(1);
              }}
              options={TYPE_OPTIONS}
              disabled={searchMode}
            />
            <Input
              className="max-w-[320px] flex-1"
              placeholder="输入关键词全局搜索资源…"
              value={keyword}
              spellCheck={false}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applySearch();
              }}
            />
            <Button variant="primary" icon={<Search size={14} />} onClick={applySearch} loading={loading}>
              搜索
            </Button>
            {searchMode && (
              <Button
                variant="outline"
                onClick={() => {
                  setKeyword("");
                  setAppliedKeyword("");
                  setPage(1);
                }}
              >
                退出搜索
              </Button>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {listError ? (
            <EmptyState
              title="资源加载失败"
              description={listError}
              action={
                <Button size="sm" variant="outline" onClick={() => void load()}>
                  重试
                </Button>
              }
            />
          ) : loading && items.length === 0 ? (
            <div className="flex justify-center py-16">
              <Spinner size={20} />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="没有匹配的资源"
              description={searchMode ? "换个关键词试试。" : "可调整类型或标签筛选条件。"}
            />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-xs text-fg-faint">
                  <th className="border-b border-line px-2 py-2 font-medium">名称</th>
                  <th className="w-24 border-b border-line px-2 py-2 font-medium">类型</th>
                  {!searchMode && <th className="w-20 border-b border-line px-2 py-2 font-medium">大小</th>}
                  {!searchMode && <th className="w-28 border-b border-line px-2 py-2 font-medium">所有者</th>}
                  <th className="w-36 border-b border-line px-2 py-2 font-medium">更新时间</th>
                  <th className="w-32 border-b border-line px-2 py-2 font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.resourceId} className="group border-b border-line last:border-0 hover:bg-bg-hover">
                    <td className="max-w-0 px-2 py-2.5">
                      <div className="truncate text-fg" title={item.resourceName}>
                        {item.resourceName}
                      </div>
                      {searchMode &&
                        "highlightContent" in item &&
                        typeof item.highlightContent === "string" &&
                        item.highlightContent && (
                          <div className="mt-0.5 truncate text-xs text-fg-faint" title={item.highlightContent}>
                            {item.highlightContent}
                          </div>
                        )}
                    </td>
                    <td className="px-2 py-2.5">
                      <Badge tone={typeTone(String(item.resourceType))}>{String(item.resourceType)}</Badge>
                    </td>
                    {!searchMode && (
                      <td className="px-2 py-2.5 text-xs text-fg-muted">
                        {formatBytes((item as ResourceItem).size)}
                      </td>
                    )}
                    {!searchMode && (
                      <td className="px-2 py-2.5 text-xs text-fg-muted">
                        {(item as ResourceItem).ownerInfo?.nickname ?? "-"}
                      </td>
                    )}
                    <td className="px-2 py-2.5 text-xs text-fg-muted">
                      {formatDateTime(item.updateTime as string)}
                    </td>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-1">
                        <CopyButton text={item.resourceId} title="复制资源 ID" />
                        {!searchMode && (
                          <Button size="xs" variant="ghost" onClick={() => void openDetail(item.resourceId)}>
                            详情
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 分页 */}
        <div className="flex h-12 shrink-0 items-center justify-between border-t border-line px-4">
          <span className="text-xs text-fg-muted">
            第 {page} 页 · 共 {total} 条
            {loading && <Spinner size={12} className="ml-2 inline-block" />}
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={!hasPrev} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button size="sm" variant="outline" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>

      {/* 资源详情 */}
      <Modal
        open={detail !== null}
        onClose={() => setDetail(null)}
        title={detail ? `资源详情 · ${detail.resourceId}` : "资源详情"}
        width="max-w-3xl"
      >
        {detail?.loading ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : detail ? (
          <JsonView data={detail.data} defaultExpandDepth={3} />
        ) : null}
      </Modal>
    </div>
  );
}
