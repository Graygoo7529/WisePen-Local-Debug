import { invoke } from "@tauri-apps/api/core";
import { get } from "./client";

const MAX_ASSET_TEXT_BYTES = 4 * 1024 * 1024;

/** Local 调试工具通过 Java 存储服务获取限时地址，再由 Tauri 读取资产正文。 */
export const storageApi = {
  getDownloadUrl: (objectKey: string) =>
    get<string>("storage", "/internal/storage/getDownloadUrl", {
      objectKey,
      duration: 300,
    }),
  loadText: async (objectKey: string) => {
    const url = await storageApi.getDownloadUrl(objectKey);
    return await invoke<string>("http_get_text", {
      url,
      maxBytes: MAX_ASSET_TEXT_BYTES,
    });
  },
};
