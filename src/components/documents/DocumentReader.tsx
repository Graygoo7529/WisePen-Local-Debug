import { useEffect, useState } from "react";
import { defaultUrlTransform } from "react-markdown";
import { Trash2 } from "lucide-react";
import { documentApi } from "../../api/document";
import type { DocumentImageReferencesResponse, DocumentInfoResponse, DocumentPreviewImageResponse, DocumentVersionInfo } from "../../lib/types";
import { formatBytes } from "../../lib/format";
import { useSettingsStore } from "../../stores/settingsStore";
import { Button, Badge, EmptyState, Select, Spinner, Tabs, Textarea } from "../ui";
import { JsonView } from "../JsonView";
import { Markdown } from "../Markdown";
import { DocumentPdf } from "./DocumentPdf";
import { DocumentImage } from "./DocumentImage";

const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

export function DocumentReader({ resourceId, onUploadVersion, onDelete, deleteDisabled }: {
  resourceId: string;
  onUploadVersion: (info: DocumentInfoResponse) => void;
  onDelete: (info: DocumentInfoResponse) => void;
  deleteDisabled: boolean;
}) {
  const userId = useSettingsStore(s => s.userId);
  const [info, setInfo] = useState<DocumentInfoResponse | null>(null);
  const [version, setVersion] = useState<number>();
  const [versions, setVersions] = useState<DocumentVersionInfo[]>([]);
  const [images, setImages] = useState<DocumentImageReferencesResponse | null>(null);
  const [preview, setPreview] = useState<DocumentPreviewImageResponse | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pdf");
  const [reload, setReload] = useState(0);
  const [pageFilter, setPageFilter] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setInfo(null); setImages(null); setPreview(null); setText(null); setErrors({}); setVersions([]); setPageFilter("");
    const report = (key: string, error: unknown) => { if (active) setErrors(current => ({ ...current, [key]: errorText(error) })); };
    void (async () => {
      try {
        const data = await documentApi.getDocInfo(resourceId, version);
        if (!active) return;
        setInfo(data);
        const actualVersion = data.documentVersionInfo?.version;
        if (actualVersion == null) throw new Error("文档尚无可读取版本，请等待处理完成。");
        if (!data.resourceInfo.currentActions?.includes("VIEW")) throw new Error("当前用户没有此版本的查看权限。");
        if (data.documentVersionInfo?.documentStatus.status !== "READY") throw new Error("此版本尚未就绪，请稍后刷新。");
        // 辅助信息单独报告失败，避免图片或文本接口异常阻断 PDF 阅读。
        await Promise.all([
          documentApi.getImageReferences(resourceId, actualVersion).then(value => { if (active) setImages(value); }).catch(e => report("正文图片", e)),
          documentApi.getPreviewImage(resourceId, actualVersion).then(value => { if (active) setPreview(value); }).catch(e => report("文本首图", e)),
          documentApi.getSearchText(resourceId, actualVersion).then(value => { if (active) setText(value.searchText ?? ""); }).catch(e => report("解析正文", e)),
          data.resourceInfo.ownerId === userId ? (async () => {
            const collected: DocumentVersionInfo[] = [];
            for (let page = 1; active; page += 1) {
              const result = await documentApi.listVersions(resourceId, page);
              collected.push(...result.list);
              if (collected.length >= Number(result.total) || result.list.length === 0) break;
            }
            if (active) setVersions(collected);
          })().catch(e => report("版本列表", e)) : Promise.resolve(),
        ]);
      } catch (e) { report("文档", e); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [resourceId, version, reload, userId]);

  const actualVersion = info?.documentVersionInfo?.version;
  const ready = info?.documentVersionInfo?.documentStatus.status === "READY" && info.resourceInfo.currentActions?.includes("VIEW");
  const assetImage = (assetRef: string, alt: string) => actualVersion == null ? null : <DocumentImage key={`${resourceId}:${actualVersion}:${assetRef}`} resourceId={resourceId} version={actualVersion} assetRef={assetRef} alt={alt} />;
  const visibleImages = images?.images.filter(image => !pageFilter || (pageFilter === "unknown" ? image.pageNo == null : String(image.pageNo) === pageFilter)) ?? [];
  const pageOptions = [...new Set(images?.images.flatMap(image => image.pageNo == null ? [] : [image.pageNo]) ?? [])].sort((a, b) => a - b);

  if (!info && loading) return <div className="flex items-center justify-center gap-2 py-24 text-fg-muted"><Spinner />正在读取文档…</div>;
  return <div className="space-y-4 p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1"><h2 className="break-words text-lg font-semibold">{info?.resourceInfo.resourceName || "读取文档"}</h2>
        {info && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted"><Badge tone="blue">{info.resourceInfo.resourceType}</Badge><span>{formatBytes(Number(info.documentVersionInfo?.uploadMeta.size ?? 0))}</span><Badge tone={ready ? "green" : "yellow"}>{info.documentVersionInfo?.documentStatus.status ?? "未发布"}</Badge>{loading && <Spinner size={12} />}</div>}
      </div>
      <Button size="sm" variant="outline" onClick={() => setReload(value => value + 1)} loading={loading}>刷新</Button>
      {info?.resourceInfo.currentActions?.includes("EDIT") && <Button size="sm" variant="outline" onClick={() => onUploadVersion(info)}>上传新版本</Button>}
      {info?.resourceInfo.ownerId === userId && <Button size="sm" variant="danger" icon={<Trash2 size={14} />} disabled={deleteDisabled} onClick={() => onDelete(info)}>删除文档</Button>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <Tabs active={tab} onChange={setTab} tabs={[{ key: "pdf", label: "阅读预览" }, { key: "text", label: "解析正文" }, { key: "images", label: `图片${images ? ` · ${images.images.length}` : ""}` }]} />
      <Select aria-label="文档版本" className="w-36" value={version === undefined ? "" : String(version)} onChange={event => setVersion(event.target.value ? Number(event.target.value) : undefined)} options={[{ value: "", label: "最新版本" }, ...versions.map(item => ({ value: String(item.version), label: `版本 ${item.version}` }))]} />
    </div>
    {errors["文档"] && <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">{errors["文档"]}</p>}
    {ready && actualVersion != null && <>
      {tab === "pdf" && <DocumentPdf key={`${actualVersion}:${reload}`} resourceId={resourceId} version={actualVersion} />}
      {tab === "text" && <div className="rounded-xl border border-line bg-bg-elev p-5">
        {errors["解析正文"] ? <p role="alert" className="text-danger">{errors["解析正文"]}</p> : text === null ? <Spinner /> : !text ? <EmptyState title="暂无解析文本" description="扫描页可能没有可提取文字，仍可使用阅读预览。" /> : info.resourceInfo.resourceType === "PDF" ? <div className="whitespace-pre-wrap text-sm leading-7">{text}</div> : <Markdown text={text} urlTransform={(url, key) => key === "src" && url.startsWith("wisepen-asset:///") ? url : defaultUrlTransform(url)} components={{ img: ({ src, alt }) => typeof src === "string" && src.startsWith("wisepen-asset:///") ? assetImage(src, alt || "文档图片") : <span className="text-fg-muted">[此图片未生成可读取的平台资产]</span> }} />}
        {text?.includes("图片暂不可用") && <p className="mt-4 rounded-lg bg-warning-soft p-3 text-xs text-warning">正文包含缺图占位。可能是历史内嵌图在读取时被清理，或转换期间图片处理失败；不能仅凭占位判断原因。</p>}
      </div>}
      {tab === "images" && <div className="space-y-4">
        <div className="rounded-xl border border-line p-4"><h3 className="text-sm font-medium">第一页文字预览</h3><p className="mt-1 text-xs text-fg-muted">根据第一页可提取文字排版，不还原原始版式。</p>{errors["文本首图"] ? <p className="mt-2 text-xs text-danger">{errors["文本首图"]}</p> : preview?.markdownLink ? assetImage(preview.markdownLink, "第一页文字预览") : <p className="mt-3 text-sm text-fg-muted">{preview ? "此版本没有文本首图" : "正在查询首图…"}</p>}</div>
        <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-medium">正文图片</h3><Select aria-label="图片页码" className="w-44" value={pageFilter} onChange={event => setPageFilter(event.target.value)} options={[{ value: "", label: "全部页码" }, ...pageOptions.map(page => ({ value: String(page), label: `第 ${page} 页（推定）` })), { value: "unknown", label: "页码未知" }]} /></div>
        {errors["正文图片"] ? <p role="alert" className="text-danger">{errors["正文图片"]}</p> : images === null ? <Spinner /> : visibleImages.length === 0 ? <EmptyState title="没有匹配的正文图片" description="图片清单仅包含已保存的平台引用；原文件中的图片仍可在阅读预览中查看。" /> : visibleImages.map((image, index) => <div key={`${image.objectKey}:${index}`}><Badge>{image.pageNo ? `第 ${image.pageNo} 页 · 推定` : "页码未知"}</Badge>{assetImage(image.markdownLink, image.alt || `图片 ${image.imageIndex}`)}</div>)}
      </div>}
    </>}
    <details className="rounded-xl border border-line bg-bg-elev">
      <summary className="cursor-pointer px-4 py-3 text-sm text-fg-muted">调试信息 · 版本、接口响应与解析原文</summary>
      <div className="space-y-4 border-t border-line p-4 text-xs">
        <div className="break-all">resourceId: {resourceId}<br />documentId: {images?.documentId ?? preview?.documentId ?? "未取得"}<br />实际读取版本: {actualVersion ?? "未取得"}</div>
        <p className="text-fg-muted">解析正文通过内部搜索文本契约读取，先校验公开文档信息和 VIEW 权限。图片 URL 按需申请，过期可刷新。</p>
        {Object.keys(errors).length > 0 && <JsonView data={errors} />}
        <details><summary className="cursor-pointer py-2">文档与权限</summary><JsonView data={info} defaultExpandDepth={2} /></details>
        <details><summary className="cursor-pointer py-2">正文图片响应</summary><JsonView data={images} defaultExpandDepth={2} /></details>
        <details><summary className="cursor-pointer py-2">文本首图响应</summary><JsonView data={preview} /></details>
        <details><summary className="cursor-pointer py-2">解析原文</summary><Textarea aria-label="解析原文" value={text ?? ""} readOnly className="min-h-56 font-mono text-xs" /></details>
      </div>
    </details>
  </div>;
}
