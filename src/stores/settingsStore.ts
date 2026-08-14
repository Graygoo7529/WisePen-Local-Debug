import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 连接与身份设置。凭据仅保存在本机 localStorage，不写入仓库。 */
export interface ConnectionSettings {
  chatBaseUrl: string;
  assetBaseUrl: string;
  resourceBaseUrl: string;
  userBaseUrl: string;
  documentBaseUrl: string;
  storageBaseUrl: string;
  noteBaseUrl: string;
  fromSource: string;
  userId: string;
  identityType: string;
  userStatus: string;
  groupRoleMap: string;
  developer: string;
  xDeveloper: string;
  defaultModel: string;
  theme: "light" | "dark";
}

export const SERVICE_KEYS = [
  "chat",
  "asset",
  "resource",
  "user",
  "document",
  "storage",
  "note",
] as const;
export type ServiceKey = (typeof SERVICE_KEYS)[number];

export const SERVICE_LABELS: Record<ServiceKey, string> = {
  chat: "Chat 对话服务 (Python :9200)",
  asset: "AI Asset 资产服务 (Java :19910)",
  resource: "Resource 资源服务 (Java :19905)",
  user: "User 用户服务 (Java :19903)",
  document: "Document 文档服务 (Java :19906)",
  storage: "File Storage 存储服务 (Java :19907)",
  note: "Note 笔记服务 (Java :19908)",
};

/** 本地配置文件（wisepen-local.config.json）的形状，见 wisepen-local.config.example.json。 */
interface ConfigFileShape {
  services?: Record<string, unknown>;
  identity?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
}

const SERVICE_URL_KEYS: Record<string, keyof ConnectionSettings> = {
  chat: "chatBaseUrl",
  asset: "assetBaseUrl",
  resource: "resourceBaseUrl",
  user: "userBaseUrl",
  document: "documentBaseUrl",
  storage: "storageBaseUrl",
  note: "noteBaseUrl",
};

const IDENTITY_KEYS = [
  "fromSource",
  "userId",
  "identityType",
  "userStatus",
  "groupRoleMap",
  "developer",
  "xDeveloper",
] as const;

interface SettingsState extends ConnectionSettings {
  set: (patch: Partial<ConnectionSettings>) => void;
  /** 从本地配置文件（wisepen-local.config.json）导入设置，返回导入的字段说明。 */
  importConfigFile: (jsonText: string) => string[];
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      chatBaseUrl: "http://127.0.0.1:9200",
      assetBaseUrl: "http://127.0.0.1:19910",
      resourceBaseUrl: "http://127.0.0.1:19905",
      userBaseUrl: "http://127.0.0.1:19903",
      documentBaseUrl: "http://127.0.0.1:19906",
      storageBaseUrl: "http://127.0.0.1:19907",
      noteBaseUrl: "http://127.0.0.1:19908",
      fromSource: "",
      userId: "",
      identityType: "1",
      userStatus: "1",
      groupRoleMap: "{}",
      developer: "true",
      xDeveloper: "",
      defaultModel: "",
      theme: "light",
      set: (patch) => set(patch),
      importConfigFile: (jsonText) => {
        const cfg = JSON.parse(jsonText) as ConfigFileShape;
        const patch: Partial<ConnectionSettings> = {};
        const applied: string[] = [];
        const str = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v : "");

        for (const [key, target] of Object.entries(SERVICE_URL_KEYS)) {
          const v = str(cfg.services?.[key]);
          if (v) {
            (patch as Record<string, string>)[target] = v;
            applied.push(`${target} = ${v}`);
          }
        }
        for (const key of IDENTITY_KEYS) {
          const v = str(cfg.identity?.[key]);
          if (v) {
            (patch as Record<string, string>)[key] = v;
            applied.push(key === "fromSource" ? "fromSource（已导入）" : key);
          }
        }
        const defaultModel = str(cfg.preferences?.defaultModel);
        if (defaultModel) {
          patch.defaultModel = defaultModel;
          applied.push("defaultModel");
        }
        const theme = cfg.preferences?.theme;
        if (theme === "light" || theme === "dark") {
          patch.theme = theme;
          applied.push("theme");
        }
        if (applied.length > 0) set(patch);
        return applied;
      },
    }),
    { name: "wisepen-local-settings" },
  ),
);
