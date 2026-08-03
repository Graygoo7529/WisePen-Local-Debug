import { get, post } from "./client";
import type {
  PageResult,
  ResourceItem,
  ResourceType,
  SearchHitItem,
  TagTreeNode,
} from "../lib/types";

export interface ListResourcesQuery {
  groupId?: string;
  tagIds?: string[];
  tagQueryLogicMode?: "AND" | "OR";
  resourceType?: ResourceType;
  page?: number;
  size?: number;
  sortBy?: "UPDATE_TIME" | "CREATE_TIME" | "NAME" | "SIZE";
  sortDir?: "ASC" | "DESC";
}

/** wisepen-resource-service（Java，:19905）端点。 */
export const resourceApi = {
  /** 资源列表；groupId 为空 = 个人空间。tagIds 会以重复 key 形式序列化。 */
  listResources: (q: ListResourcesQuery = {}) =>
    get<PageResult<ResourceItem>>("resource", "/resource/item/listResources", {
      groupId: q.groupId,
      tagIds: q.tagIds?.join(","),
      tagQueryLogicMode: q.tagQueryLogicMode,
      resourceType: q.resourceType,
      page: q.page ?? 1,
      size: q.size ?? 20,
      sortBy: q.sortBy,
      sortDir: q.sortDir,
    }),
  getResourceBaseInfo: (resourceId: string) =>
    get<ResourceItem>("resource", "/resource/item/getResourceBaseInfo", { resourceId }),
  getTagTree: (groupId?: string) =>
    get<TagTreeNode[]>("resource", "/resource/tag/getTagTree", { groupId }),
  globalSearchResources: (keyword: string, scope: "ALL" | "DOCUMENT" | "NOTE" = "ALL", page = 1, size = 20) =>
    get<PageResult<SearchHitItem>>("resource", "/resource/search/globalSearchResources", {
      keyword,
      scope,
      page,
      size,
    }),
  renameResource: (resourceId: string, newName: string) =>
    post<unknown>("resource", "/resource/item/renameResource", { resourceId, newName }),
};
