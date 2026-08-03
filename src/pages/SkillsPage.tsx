import { useCallback, useEffect, useState } from "react";
import { Wand2 } from "lucide-react";
import { resourceApi } from "../api/resource";
import { skillApi } from "../api/asset";
import type { ResourceItem, SkillResourceInfoResponse, SkillVersionBundle } from "../lib/types";
import { Button, EmptyState, PageHeader, Spinner } from "../components/ui";
import { toast } from "../stores/toastStore";
import { SkillListPanel } from "../components/skills/SkillListPanel";
import { SkillInfoCard } from "../components/skills/SkillInfoCard";
import { SkillVersionCard } from "../components/skills/SkillVersionCard";
import { AssetWorkspaceCard } from "../components/skills/AssetWorkspaceCard";
import { errText, type WorkspaceEntry } from "../components/skills/workspace";

export default function SkillsPage() {
  // 左栏列表
  const [skills, setSkills] = useState<ResourceItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 详情
  const [info, setInfo] = useState<SkillResourceInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);

  // 版本（draftVersion 贯穿上传 / 删除 / 查草稿）
  const [draftVersion, setDraftVersion] = useState(1);
  const [publishedBundle, setPublishedBundle] = useState<SkillVersionBundle | null>(null);
  const [draftBundle, setDraftBundle] = useState<SkillVersionBundle | null>(null);
  const [queryingPublished, setQueryingPublished] = useState(false);
  const [queryingDraft, setQueryingDraft] = useState(false);

  // 资产工作区
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const resp = await resourceApi.listResources({ resourceType: "SKILL", size: 50 });
      setSkills(resp.list);
    } catch (e) {
      toast.error(`加载 Skill 列表失败：${errText(e)}`);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  const loadInfo = async (resourceId: string) => {
    setInfoLoading(true);
    setInfoError(null);
    try {
      const resp = await skillApi.getSkillInfo(resourceId);
      setInfo(resp);
      setDraftVersion(resp.skillInfo.version + 1);
    } catch (e) {
      setInfo(null);
      setInfoError(errText(e));
      toast.error(`加载 Skill 信息失败：${errText(e)}`);
    } finally {
      setInfoLoading(false);
    }
  };

  const select = (resourceId: string) => {
    setSelectedId(resourceId);
    setInfo(null);
    setInfoError(null);
    setPublishedBundle(null);
    setDraftBundle(null);
    setEntries([]);
    void loadInfo(resourceId);
  };

  const queryPublished = async (): Promise<SkillVersionBundle | null> => {
    if (!selectedId) return null;
    setQueryingPublished(true);
    try {
      const bundle = await skillApi.getSkillVersionBundleInfo(selectedId);
      setPublishedBundle(bundle);
      return bundle;
    } catch (e) {
      toast.error(`查询已发布版本失败：${errText(e)}`);
      return null;
    } finally {
      setQueryingPublished(false);
    }
  };

  const queryDraft = async (): Promise<SkillVersionBundle | null> => {
    if (!selectedId) return null;
    setQueryingDraft(true);
    try {
      const bundle = await skillApi.getSkillVersionBundleInfo(selectedId, draftVersion);
      setDraftBundle(bundle);
      return bundle;
    } catch (e) {
      toast.error(`查询草稿 v${draftVersion} 失败：${errText(e)}`);
      return null;
    } finally {
      setQueryingDraft(false);
    }
  };

  /** 工作区载入结构用：已查询过则复用，否则先查询再返回。 */
  const ensureBundle = async (kind: "draft" | "published"): Promise<SkillVersionBundle | null> => {
    const cached = kind === "draft" ? draftBundle : publishedBundle;
    if (cached) return cached;
    return kind === "draft" ? await queryDraft() : await queryPublished();
  };

  const changeDraftVersion = (v: number) => {
    setDraftVersion(v);
    setDraftBundle(null);
  };

  return (
    <div className="flex h-full">
      <SkillListPanel
        skills={skills}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={select}
        onReload={reloadList}
      />

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] px-6 py-6">
          <PageHeader title="Skill 工坊" description="创建、编辑、上传资产并发布本地 Skill。" />

          {!selectedId ? (
            <EmptyState
              icon={<Wand2 size={36} />}
              title="尚未选择 Skill"
              description="从左侧列表选择一个 Skill，或创建 / 手动加载新的 Skill。"
            />
          ) : infoLoading && !info ? (
            <div className="flex justify-center py-16">
              <Spinner size={22} />
            </div>
          ) : !info ? (
            <EmptyState
              icon={<Wand2 size={36} />}
              title="加载 Skill 信息失败"
              description={infoError ?? undefined}
              action={
                <Button variant="outline" onClick={() => void loadInfo(selectedId)}>
                  重试
                </Button>
              }
            />
          ) : (
            <div className="space-y-4">
              <SkillInfoCard
                info={info}
                onSaved={async () => {
                  await loadInfo(selectedId);
                  await reloadList();
                }}
              />
              <SkillVersionCard
                draftVersion={draftVersion}
                onDraftVersionChange={changeDraftVersion}
                publishedBundle={publishedBundle}
                draftBundle={draftBundle}
                queryingPublished={queryingPublished}
                queryingDraft={queryingDraft}
                onQueryPublished={() => void queryPublished()}
                onQueryDraft={() => void queryDraft()}
              />
              <AssetWorkspaceCard
                resourceId={selectedId}
                draftVersion={draftVersion}
                entries={entries}
                onEntriesChange={setEntries}
                ensureBundle={ensureBundle}
                onRefreshDraft={async () => {
                  await queryDraft();
                }}
                onAfterPublish={async () => {
                  await loadInfo(selectedId);
                  setPublishedBundle(null);
                  await reloadList();
                }}
                onForked={(newId) => {
                  void (async () => {
                    await reloadList();
                    select(newId);
                  })();
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
