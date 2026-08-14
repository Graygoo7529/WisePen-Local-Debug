import { useCallback, useEffect, useRef, useState } from "react";
import { GitFork, Rocket, Trash2, Wand2 } from "lucide-react";
import { resourceApi } from "../api/resource";
import { skillApi } from "../api/asset";
import {
  ResourceWorkbenchHeader,
  type ResourceVersionSelection,
} from "../components/assets/ResourceWorkbenchHeader";
import { ConfirmModal, Modal } from "../components/Modal";
import { AssetWorkspaceCard } from "../components/skills/AssetWorkspaceCard";
import { SkillInfoCard } from "../components/skills/SkillInfoCard";
import { SkillListPanel } from "../components/skills/SkillListPanel";
import { errText, type WorkspaceEntry } from "../components/skills/workspace";
import { Badge, Button, EmptyState, Field, Input, Select, Spinner, Tabs } from "../components/ui";
import type { ResourceItem, SkillResourceInfoResponse, SkillVersionBundle } from "../lib/types";
import { toast } from "../stores/toastStore";

export default function SkillsPage() {
  const infoRequest = useRef(0);
  const bundleRequest = useRef(0);
  const [skills, setSkills] = useState<ResourceItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<SkillResourceInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [bundle, setBundle] = useState<SkillVersionBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [selection, setSelection] = useState<ResourceVersionSelection>({ kind: "draft", version: 1 });
  const [entries, setEntries] = useState<WorkspaceEntry[]>([]);
  const [tab, setTab] = useState("files");
  const [forkOpen, setForkOpen] = useState(false);
  const [forkName, setForkName] = useState("");
  const [forkVersion, setForkVersion] = useState("");
  const [forking, setForking] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const reloadList = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await resourceApi.listResources({ resourceType: "SKILL", size: 50 });
      setSkills(response.list);
    } catch (error) {
      toast.error(`加载 Skill 列表失败：${errText(error)}`);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void reloadList();
  }, [reloadList]);

  const loadBundle = useCallback(async (resourceId: string, target: ResourceVersionSelection) => {
    const requestId = ++bundleRequest.current;
    setBundleLoading(true);
    setBundle(null);
    try {
      const response = await skillApi.getSkillVersionBundleInfo(resourceId, target.version);
      if (requestId === bundleRequest.current) setBundle(response);
    } catch (error) {
      if (requestId === bundleRequest.current) {
        toast.error(`加载 v${target.version} 失败：${errText(error)}`);
      }
    } finally {
      if (requestId === bundleRequest.current) setBundleLoading(false);
    }
  }, []);

  const loadResource = useCallback(async (resourceId: string) => {
    const requestId = ++infoRequest.current;
    setInfoLoading(true);
    setInfo(null);
    setBundle(null);
    try {
      const response = await skillApi.getSkillInfo(resourceId);
      if (requestId !== infoRequest.current) return;
      setInfo(response);
      const draft: ResourceVersionSelection = {
        kind: "draft",
        version: response.skillInfo.version + 1,
      };
      setSelection(draft);
      await loadBundle(resourceId, draft);
    } catch (error) {
      if (requestId === infoRequest.current) {
        toast.error(`加载 Skill 信息失败：${errText(error)}`);
      }
    } finally {
      if (requestId === infoRequest.current) setInfoLoading(false);
    }
  }, [loadBundle]);

  const selectSkill = (resourceId: string) => {
    setSelectedId(resourceId);
    setEntries([]);
    setTab("files");
    void loadResource(resourceId);
  };

  const changeVersion = (next: ResourceVersionSelection) => {
    if (!selectedId) return;
    setSelection(next);
    void loadBundle(selectedId, next);
  };

  const reloadBundle = () => {
    if (selectedId) void loadBundle(selectedId, selection);
  };

  const refreshInfo = async () => {
    if (!selectedId) return;
    try {
      setInfo(await skillApi.getSkillInfo(selectedId));
      await reloadList();
    } catch (error) {
      toast.error(`刷新 Skill 信息失败：${errText(error)}`);
    }
  };

  const forkSkill = async () => {
    if (!selectedId || !forkName.trim() || !forkVersion) return;
    setForking(true);
    try {
      const resourceId = await skillApi.forkSkill({
        resourceId: selectedId,
        forkedResourceName: forkName.trim(),
        forkedResourceVersion: Number(forkVersion),
      });
      toast.success("Skill Fork 成功");
      setForkOpen(false);
      await reloadList();
      selectSkill(resourceId);
    } catch (error) {
      toast.error(`Fork 失败：${errText(error)}`);
    } finally {
      setForking(false);
    }
  };

  const publish = async () => {
    if (!selectedId) return;
    setPublishing(true);
    try {
      await skillApi.publishSkillVersion(selectedId);
      toast.success(`草稿 v${selection.version} 已发布`);
      setPublishOpen(false);
      setEntries([]);
      await loadResource(selectedId);
      await reloadList();
    } catch (error) {
      toast.error(`发布失败：${errText(error)}`);
    } finally {
      setPublishing(false);
    }
  };

  const removeSkill = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await resourceApi.removeResources([selectedId]);
      toast.success("Skill 资源已删除");
      setDeleteOpen(false);
      setSelectedId(null);
      setInfo(null);
      setBundle(null);
      setEntries([]);
      await reloadList();
    } catch (error) {
      toast.error(`删除失败：${errText(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const editing = selection.kind === "draft";
  const coreReady = Boolean(
    bundle?.assets.some(
      (asset) =>
        asset.path === "/" &&
        asset.name === "SKILL.md" &&
        asset.uploadStatus === "AVAILABLE",
    ),
  );
  const pendingAssets = bundle?.assets.filter((asset) => asset.uploadStatus !== "AVAILABLE").length ?? 0;
  const publishReady = editing && Boolean(bundle) && coreReady && pendingAssets === 0;
  const draftVersion = info ? info.skillInfo.version + 1 : selection.version;

  return (
    <div className="flex h-full">
      <SkillListPanel
        skills={skills}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={selectSkill}
        onReload={reloadList}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {info && selectedId ? (
          <ResourceWorkbenchHeader
            title={info.resourceInfo.resourceName || info.skillInfo.name || "未命名 Skill"}
            resourceId={selectedId}
            publishedVersion={info.skillInfo.version}
            draftVersion={draftVersion}
            selection={selection}
            loading={infoLoading || bundleLoading}
            onVersionChange={changeVersion}
            status={
              editing ? (
                <div className="flex items-center gap-2">
                  <Badge tone={coreReady ? "green" : "red"}>
                    {coreReady ? "SKILL.md 已就绪" : "缺少 /SKILL.md"}
                  </Badge>
                  <Badge tone={pendingAssets === 0 ? "green" : "yellow"}>
                    {pendingAssets === 0 ? "文件已就绪" : `${pendingAssets} 个文件上传中`}
                  </Badge>
                </div>
              ) : (
                <Badge tone="gray">只读快照</Badge>
              )
            }
            actions={
              <>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<GitFork size={14} />}
                  disabled={info.skillInfo.version <= 0}
                  onClick={() => {
                    setForkName(`${info.resourceInfo.resourceName || info.skillInfo.name}-副本`);
                    setForkVersion(String(info.skillInfo.version));
                    setForkOpen(true);
                  }}
                >
                  Fork
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  icon={<Trash2 size={14} />}
                  onClick={() => setDeleteOpen(true)}
                >
                  删除
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<Rocket size={14} />}
                  disabled={!publishReady}
                  onClick={() => setPublishOpen(true)}
                >
                  发布草稿
                </Button>
              </>
            }
          />
        ) : (
          <div className="flex h-12 shrink-0 items-center border-b border-line bg-bg-elev px-4 text-sm font-semibold">
            Skill 资源
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] px-6 py-5">
            {!selectedId && <EmptyState icon={<Wand2 size={36} />} title="选择或创建 Skill" />}
            {selectedId && infoLoading && !info && (
              <div className="flex justify-center py-16"><Spinner size={20} /></div>
            )}
            {selectedId && !infoLoading && !info && (
              <EmptyState
                title="Skill 信息加载失败"
                action={<Button onClick={() => void loadResource(selectedId)}>重试</Button>}
              />
            )}
            {selectedId && info && (
              <>
                <Tabs
                  tabs={[
                    { key: "files", label: "文件" },
                    { key: "info", label: "基本信息" },
                  ]}
                  active={tab}
                  onChange={setTab}
                  className="mb-4"
                />
                {tab === "files" && (
                  <AssetWorkspaceCard
                    resourceId={selectedId}
                    draftVersion={draftVersion}
                    bundle={bundle}
                    loading={bundleLoading}
                    editable={editing}
                    entries={entries}
                    onEntriesChange={setEntries}
                    onRefresh={reloadBundle}
                  />
                )}
                {tab === "info" && (
                  <SkillInfoCard info={info} onSaved={refreshInfo} />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title="Fork Skill"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setForkOpen(false)}>取消</Button>
            <Button variant="primary" loading={forking} onClick={() => void forkSkill()}>Fork</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="新资源标题">
            <Input value={forkName} autoFocus onChange={(event) => setForkName(event.target.value)} />
          </Field>
          <Field label="来源版本">
            <Select
              value={forkVersion}
              options={Array.from({ length: info?.skillInfo.version ?? 0 }, (_, index) => {
                const version = (info?.skillInfo.version ?? 0) - index;
                return { value: String(version), label: `已发布 v${version}` };
              })}
              onChange={(event) => setForkVersion(event.target.value)}
            />
          </Field>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除 Skill 资源"
        message={`确定删除「${info?.resourceInfo.resourceName || info?.skillInfo.name || "当前 Skill"}」吗？资源会立即从业务列表移除。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void removeSkill()}
      />

      <ConfirmModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={`发布 Skill v${draftVersion}`}
        message={`发布后 v${draftVersion} 将成为当前版本，并自动创建草稿 v${draftVersion + 1}。`}
        confirmText="发布"
        loading={publishing}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
