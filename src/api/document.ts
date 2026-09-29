import { invoke } from "@tauri-apps/api/core";
import { buildHeaders, get, post } from "./client";
import { useSettingsStore } from "../stores/settingsStore";
import { resourceApi } from "./resource";
import type {
  DocumentImageReferencesResponse,
  DocumentImageResolveResponse,
  DocumentInfoResponse,
  DocumentPreviewImageResponse,
  DocumentSearchTextResponse,
  DocumentStatus,
  DocumentUploadInitResponse,
  DocumentVersionInfo,
  PageResult,
} from "../lib/types";

export const DOCUMENT_EXTENSIONS = ["pdf", "doc", "docx", "ppt", "pptx", "xls", "xlsx"];

/** 复用文档正式上传、查询与 Fork 契约。上传任务 documentId 与资源 resourceId 分开使用。 */
export const documentApi = {
  upload: async (
    path: string,
    mountTargetTagId: string | undefined,
    resourceId: string | undefined,
    onPhase: (phase: string, documentId?: string) => void,
  ) => {
    const stat = await invoke<{ size: number; file_name: string }>("file_stat", { path });
    const extension = stat.file_name.split(".").pop()?.toLowerCase() ?? "";
    if (!DOCUMENT_EXTENSIONS.includes(extension)) throw new Error("请选择 PDF、Word、PowerPoint 或 Excel 文档");
    if (stat.size === 0 || stat.size > 100 * 1024 * 1024) throw new Error("文件大小须在 1 字节至 100 MiB 之间");
    onPhase("计算文件摘要");
    const md5 = await invoke<string>("file_md5", { path });
    onPhase("准备上传");
    const ticket = await post<DocumentUploadInitResponse>("document", "/document/uploadDoc", {
      filename: stat.file_name, extension, md5, expectedSize: stat.size, mountTargetTagId, resourceId,
    });
    onPhase(ticket.flashUploaded ? "文件已存在，等待解析" : "上传文件", ticket.documentId);
    if (!ticket.flashUploaded) {
      if (!ticket.putUrl || !ticket.callbackHeader) throw new Error("服务未返回完整上传凭证");
      const result = await invoke<{ status: number; body: string }>("oss_put_file", {
        putUrl: ticket.putUrl, callbackHeader: ticket.callbackHeader, path,
      });
      if (result.status < 200 || result.status >= 300) throw new Error(`文件上传失败：HTTP ${result.status}`);
    }
    return ticket.documentId;
  },
  syncStatus: (documentId: string) =>
    post<DocumentStatus>("document", "/document/syncDocStatus", undefined, { documentId }),
  retry: (documentId: string) =>
    post<void>("document", "/document/retryDocProcess", undefined, { documentId }),
  cancel: (documentId: string) =>
    post<void>("document", "/document/cancelDocProcess", undefined, { documentId }),
  getDocInfo: (resourceId: string, targetVersion?: number) =>
    get<DocumentInfoResponse>("document", "/document/getDocInfo", { resourceId, targetVersion }),
  getPdfPreview: async (resourceId: string, targetVersion: number) => {
    const baseUrl = useSettingsStore.getState().documentBaseUrl.replace(/\/+$/, "");
    const query = new URLSearchParams({ resourceId, targetVersion: String(targetVersion) });
    const bytes = await invoke<ArrayBuffer>("http_get_pdf", {
      url: baseUrl + "/document/getDocPreview?" + query,
      headers: buildHeaders("document"),
    });
    return new Blob([bytes], { type: "application/pdf" });
  },
  listVersions: (resourceId: string, page = 1) =>
    get<PageResult<DocumentVersionInfo>>("document", "/document/listDocVersions", { resourceId, page, size: 20 }),
  getImageReferences: (resourceId: string, targetVersion?: number, pageNo?: number) =>
    get<DocumentImageReferencesResponse>("document", "/document/getDocumentImageReferences", { resourceId, targetVersion, pageNo }),
  getPreviewImage: (resourceId: string, targetVersion: number) =>
    get<DocumentPreviewImageResponse>("document", "/document/getDocumentPreviewImage", { resourceId, targetVersion }),
  resolveImage: (resourceId: string, targetVersion: number, assetRef: string) =>
    get<DocumentImageResolveResponse>("document", "/document/resolveDocumentImage", { resourceId, targetVersion, assetRef }),
  /** 仅 Local 解析检视使用；调用前通过公开 getDocInfo 校验并锁定具体版本。返回清理后的 Markdown 或 PDF 文本。 */
  getSearchText: (resourceId: string, version: number) =>
    get<DocumentSearchTextResponse>("document", "/internal/document/getDocumentSearchText", { resourceId, version }),
  fork: (resourceId: string, forkedResourceVersion: number, forkedResourceName: string) =>
    post<string>("document", "/document/forkDocument", { resourceId, forkedResourceVersion, forkedResourceName }),
};

/** READY 后按实际 documentId 对照资源，不能仅靠同名文件或列表中的第一项。 */
export async function findUploadedDocument(documentId: string, name: string, groupId?: string) {
  for (let page = 1; ; page += 1) {
    const resources = await resourceApi.listResources({ groupId, resourceType: name.split(".").pop()?.toUpperCase(), page, size: 100, sortBy: "CREATE_TIME", sortDir: "DESC" });
    const candidates = resources.list.filter(item => item.resourceName === name);
    const matches = await Promise.allSettled(candidates.map(async item => ({ item, references: await documentApi.getImageReferences(item.resourceId) })));
    for (const match of matches) {
      if (match.status === "fulfilled" && match.value.references.documentId === documentId) return match.value.item;
    }
    if (page * 100 >= Number(resources.total) || resources.list.length === 0) return null;
  }
}
