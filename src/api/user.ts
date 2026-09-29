import { get } from "./client";
import type { CurrentUser, PageResult, UserGroup } from "../lib/types";
import type { ConnectionSettings } from "../stores/settingsStore";

export const userApi = {
  getCurrentUser: () => get<CurrentUser>("user", "/user/getUserInfo"),
  getMembership: (groupId: string) => get<{ role: number }>("user", "/group/member/getMyGroupMemberInfo", { groupId }),
  listGroups: async () => {
    const groups: UserGroup[] = [];
    for (let page = 1; ; page += 1) {
      const result = await get<PageResult<UserGroup>>("user", "/group/list", { groupRoleFilter: "ALL", page, size: 100 });
      groups.push(...result.list);
      if (groups.length >= Number(result.total) || result.list.length === 0) return groups;
    }
  },
};

/** 本地直连身份与真实用户及成员记录核对。只读，不提升或改写权限。 */
export async function verifyIdentity(settings: Pick<ConnectionSettings, "userId" | "identityType" | "userStatus" | "groupRoleMap" | "fromSource">) {
  if (!settings.userId || !settings.fromSource) throw new Error("请先在设置中导入本地配置并填写用户身份。");
  const roles: unknown = JSON.parse(settings.groupRoleMap || "{}");
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) throw new Error("小组角色配置必须是 JSON 对象。");
  const [user, groups] = await Promise.all([userApi.getCurrentUser(), userApi.listGroups()]);
  const statusCodes: Record<string, number> = { NORMAL: 1, UNIDENTIFIED: -1, BANNED: -2 };
  if (user.userId !== settings.userId || user.userInfo.identityType !== Number(settings.identityType) || statusCodes[user.userInfo.userStatus] !== Number(settings.userStatus)) {
    throw new Error("配置中的用户、身份类型或状态与用户服务不一致，请在设置中核对。");
  }
  const memberships = await Promise.all(groups.map(async group => [group.groupId, (await userApi.getMembership(group.groupId)).role] as const));
  const actualRoles = Object.fromEntries(memberships);
  const activeConfigured = Object.entries(roles).filter(([, role]) => role !== -1);
  if (activeConfigured.length !== memberships.length || activeConfigured.some(([id, role]) => actualRoles[id] !== role)) {
    throw new Error("配置的小组角色与当前成员记录不一致，请在设置中更新 X-Group-Role-Map。");
  }
  return { user, groups };
}
