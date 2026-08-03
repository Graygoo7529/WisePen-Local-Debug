import { get, post } from "./client";
import type {
  AgentResourceInfoResponse,
  AgentSpec,
  AgentVersionBundle,
  AssetResourceType,
  AssetUploadInitResponse,
  SkillResourceInfoResponse,
  SkillVersionBundle,
} from "../lib/types";

interface CreateBody {
  title: string;
  name: string;
  description: string;
  mountTargetTagId?: string;
  sourceType?: "MANUAL" | "BY_AGENT";
}

interface AssetUploadItem {
  name: string;
  path: string;
  assetResourceType: AssetResourceType;
  md5: string;
  expectedSize: number;
}

/** wisepen-ai-asset-service（Java，:19910）的 /skill/* 端点。 */
export const skillApi = {
  createSkill: (body: CreateBody) => post<string>("asset", "/skill/createSkill", body),
  forkSkill: (body: { resourceId: string; forkedResourceVersion?: number; forkedResourceName: string }) =>
    post<string>("asset", "/skill/forkSkill", body),
  changeSkillInfo: (body: { resourceId: string; name?: string; description?: string }) =>
    post<unknown>("asset", "/skill/changeSkillInfo", body),
  getSkillInfo: (resourceId: string, targetVersion?: number) =>
    post<SkillResourceInfoResponse>("asset", "/skill/getSkillInfo", undefined, {
      resourceId,
      targetVersion,
    }),
  /** version 缺省 = 当前已发布版；传具体版本号 = 对应草稿/版本。 */
  getSkillVersionBundleInfo: (resourceId: string, version?: number) =>
    post<SkillVersionBundle>("asset", "/skill/getSkillVersionBundleInfo", undefined, {
      resourceId,
      version,
    }),
  getSkillAssetStsToken: (resourceId: string, targetVersion?: number) =>
    get<Record<string, unknown>>("asset", "/skill/getSkillAssetStsToken", {
      resourceId,
      targetVersion,
    }),
  publishSkillVersion: (resourceId: string) =>
    post<unknown>("asset", "/skill/publishSkillVersion", { resourceId }),
  initUploadSkillAssets: (body: {
    resourceId: string;
    draftVersion: number;
    assets: AssetUploadItem[];
  }) => post<AssetUploadInitResponse>("asset", "/skill/initUploadSkillAssets", body),
  deleteSkillAssets: (resourceId: string, draftVersion: number, assetIds: string[]) =>
    post<unknown>("asset", "/skill/deleteSkillAssets", {
      resourceId,
      draftVersion,
      assetIds,
    }),
};

/** wisepen-ai-asset-service 的 /agent/* 端点。 */
export const agentApi = {
  createAgent: (body: CreateBody) => post<string>("asset", "/agent/createAgent", body),
  forkAgent: (body: { resourceId: string; forkedResourceVersion?: number; forkedResourceName: string }) =>
    post<string>("asset", "/agent/forkAgent", body),
  changeAgentInfo: (body: { resourceId: string; name?: string; description?: string }) =>
    post<unknown>("asset", "/agent/changeAgentInfo", body),
  getAgentInfo: (resourceId: string, targetVersion?: number) =>
    post<AgentResourceInfoResponse>("asset", "/agent/getAgentInfo", undefined, {
      resourceId,
      targetVersion,
    }),
  updateAgentSpec: (resourceId: string, draftVersion: number, spec: AgentSpec) =>
    post<unknown>("asset", "/agent/updateAgentSpec", { resourceId, draftVersion, spec }),
  getAgentVersionBundleInfo: (resourceId: string, version?: number) =>
    post<AgentVersionBundle>("asset", "/agent/getAgentVersionBundleInfo", undefined, {
      resourceId,
      version,
    }),
  publishAgentVersion: (resourceId: string) =>
    post<unknown>("asset", "/agent/publishAgentVersion", { resourceId }),
  initUploadAgentAssets: (body: {
    resourceId: string;
    draftVersion: number;
    assets: AssetUploadItem[];
  }) => post<AssetUploadInitResponse>("asset", "/agent/initUploadAgentAssets", body),
  deleteAgentAssets: (resourceId: string, draftVersion: number, assetIds: string[]) =>
    post<unknown>("asset", "/agent/deleteAgentAssets", {
      resourceId,
      draftVersion,
      assetIds,
    }),
};
