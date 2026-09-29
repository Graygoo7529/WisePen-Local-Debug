import { useEffect, useState } from "react";
import { documentApi } from "../../api/document";
import { Button } from "../ui";

/** 打开正文或图片页时解析稳定引用，临时地址仅保留在组件内。 */
export function DocumentImage({ resourceId, version, assetRef, alt }: {
  resourceId: string; version: number; assetRef: string; alt: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setUrl("");
    setError("");
    void documentApi.resolveImage(resourceId, version, assetRef).then(result => {
      if (active) setUrl(result.downloadUrl);
    }).catch((error: unknown) => {
      if (active) setError(error instanceof Error ? error.message : String(error));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [resourceId, version, assetRef, attempt]);
  return <span className="my-2 block rounded-lg border border-line bg-bg-elev p-3">
    <span className="mb-2 block text-xs text-fg-muted">{alt || "文档图片"}</span>
    {url && <img src={url} alt={alt} className="mx-auto mb-3 max-h-[520px] max-w-full object-contain" onError={() => { setUrl(""); setError("图片读取失败，可重新获取地址后重试。"); }} />}
    {error && <span role="alert" className="mb-2 block text-xs text-danger">{error}</span>}
    <Button size="xs" variant="outline" loading={loading} onClick={() => setAttempt(value => value + 1)}>{url ? "刷新图片" : "重试图片"}</Button>
  </span>;
}
