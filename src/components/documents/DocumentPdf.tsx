import { useEffect, useState } from "react";
import { documentApi } from "../../api/document";
import { Button, Spinner } from "../ui";

export function DocumentPdf({ resourceId, version }: { resourceId: string; version: number }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    let objectUrl = "";
    setUrl("");
    setError("");
    void documentApi.getPdfPreview(resourceId, version).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch((e: unknown) => {
      if (active) setError(e instanceof Error ? e.message : String(e));
    });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [resourceId, version, attempt]);
  if (error) return <div className="space-y-2"><p role="alert" className="text-danger">{error}</p><Button onClick={() => setAttempt((value) => value + 1)}>重试预览</Button></div>;
  if (!url) return <div className="flex items-center gap-2 p-4 text-fg-muted"><Spinner />正在读取 PDF 预览…</div>;
  return <div className="space-y-2">
    <a href={url} download="document-preview.pdf" className="text-xs text-accent underline">保存当前 PDF 预览</a>
    <iframe title="文档 PDF 预览" src={url} className="h-[650px] w-full rounded-lg border border-line" />
    <p className="text-xs text-fg-faint">如当前系统的内置阅读器未显示 PDF，可保存后用系统阅读器打开。</p>
  </div>;
}
