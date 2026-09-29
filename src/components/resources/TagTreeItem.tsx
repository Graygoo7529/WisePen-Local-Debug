import { useState } from "react";
import { ChevronRight, Folder, Tag } from "lucide-react";
import { cn } from "../../lib/cn";
import type { TagTreeNode } from "../../lib/types";

/** 资源浏览与文档空间共用标签导航；选择标签后由页面按相同后端契约查询。 */
export function TagTreeItem({ node, depth = 0, selectedId, onSelect }: {
  node: TagTreeNode;
  depth?: number;
  selectedId: string | null;
  onSelect: (tagId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasChildren = node.children.length > 0;
  return <div>
    <div className={cn("flex items-center gap-0.5 rounded-md py-1.5 pr-1.5 text-[13px]", selectedId === node.tagId ? "bg-accent-soft text-accent" : "text-fg-muted hover:bg-bg-hover hover:text-fg")} style={{ paddingLeft: depth * 14 + 6 }}>
      {hasChildren ? <button className="flex h-5 w-5 shrink-0 items-center justify-center" aria-label={`${open ? "收起" : "展开"}${node.tagName}`} aria-expanded={open} onClick={() => setOpen(!open)}><ChevronRight size={12} className={cn(open && "rotate-90")} /></button> : <span className="w-5 shrink-0" />}
      <button className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-current={selectedId === node.tagId ? "page" : undefined} onClick={() => onSelect(node.tagId)} title={node.tagName}>
        {node.isPath ? <Folder size={14} className="shrink-0" /> : <Tag size={13} className="shrink-0" />}<span className="truncate">{node.tagName === "/" ? "根目录" : node.tagName === ".Trash" ? "回收站" : node.tagName}</span>
      </button>
    </div>
    {open && node.children.map(child => <TagTreeItem key={child.tagId} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />)}
  </div>;
}
