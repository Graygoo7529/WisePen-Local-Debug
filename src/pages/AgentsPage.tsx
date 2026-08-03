import { useCallback, useEffect, useState } from "react";
import { Bot, GitFork, Rocket } from "lucide-react";
import { agentApi } from "../api/asset";
import { resourceApi } from "../api/resource";
import { AgentAssetsTab } from "../components/agents/AgentAssetsTab";
import { AgentInfoTab } from "../components/agents/AgentInfoTab";
import { AgentListPanel } from "../components/agents/AgentListPanel";
import { AgentSpecTab } from "../components/agents/AgentSpecTab";
import { ConfirmModal, Modal } from "../components/Modal";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Spinner,
  Tabs,
  Textarea,
} from "../components/ui";
import type { AgentResourceInfoResponse, AgentVersionBundle, ResourceItem } from "../lib/types";
import { toast } from "../stores/toastStore";

export default function AgentsPage() {
  // 左侧列表
  const [agents, setAgents] = useState<ResourceItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 右侧详情
  const [info, setInfo] = useState<AgentResourceInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [bundle, setBundle] = useState<AgentVersionBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [draftVersion, setDraftVersion] = useState(1);
  const [viewing, setViewing] = useState<"draft" | "published">("draft");
  const [tab, setTab] = useState("info");

  // 新建 / Fork / 发布
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [forkName, setForkName] = useState("");
  const [forkVersion, setForkVersion] = useState("");
  const [forking, setForking] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const r = await resourceApi.listResources({ resourceType: "AGENT", size: 50 });
      setAgents(r.list);
    } catch (e) {
      toast.error(`加载 Agent 列表失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  /** 加载版本包；version 缺省 = 当前已发布版。silent 用于自动加载（草稿可能不存在）。 */
  const loadBundle = useCallback(
    async (resourceId: string, version?: number, silent = false) => {
      setBundleLoading(true);
      try {
        setBundle(await agentApi.getAgentVersionBundleInfo(resourceId, version));
      } catch (e) {
        setBundle(null);
        if (!silent) {
          toast.error(`加载版本包失败：${e instanceof Error ? e.message : String(e)}`);
        }
      } finally {
        setBundleLoading(false);
      }
    },
    [],
  );

  const loadInfo = useCallback(
    async (resourceId: string) => {
      setInfoLoading(true);
      try {
        const r = await agentApi.getAgentInfo(resourceId);
        setInfo(r);
        const dv = r.agentInfo.version + 1;
        setDraftVersion(dv);
        setViewing("draft");
        await loadBundle(resourceId, dv, true);
      } catch (e) {
        setInfo(null);
        setBundle(null);
        toast.error(`加载 Agent 信息失败：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setInfoLoading(false);
      }
    },
    [loadBundle],
  );

  const selectAgent = (resourceId: string) => {
    setSelectedId(resourceId);
    void loadInfo(resourceId);
  };

  const reloadViewedBundle = () => {
    if (!selectedId) return;
    void loadBundle(selectedId, viewing === "draft" ? draftVersion : undefined, true);
  };

  const createAgent = async () => {
    if (!createName.trim()) {
      toast.error("请填写名称");
      return;
    }
    setCreating(true);
    try {
      const id = await agentApi.createAgent({
        title: createName.trim(),
        name: createName.trim(),
        description: createDesc,
      });
      toast.success("Agent 已创建");
      setCreateOpen(false);
      setCreateName("");
      setCreateDesc("");
      await loadList();
      selectAgent(id);
    } catch (e) {
      toast.error(`创建失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCreating(false);
    }
  };

  const forkAgent = async () => {
    if (!selectedId || !forkName.trim()) {
      toast.error("请填写 Fork 后的名称");
      return;
    }
    setForking(true);
    try {
      const version = forkVersion.trim() ? Number(forkVersion.trim()) : undefined;
      const id = await agentApi.forkAgent({
        resourceId: selectedId,
        forkedResourceName: forkName.trim(),
        ...(version !== undefined && !Number.isNaN(version)
          ? { forkedResourceVersion: version }
          : {}),
      });
      toast.success("Fork 成功");
      setForkOpen(false);
      await loadList();
      selectAgent(id);
    } catch (e) {
      toast.error(`Fork 失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setForking(false);
    }
  };

  const publish = async () => {
    if (!selectedId) return;
    setPublishing(true);
    try {
      await agentApi.publishAgentVersion(selectedId);
      toast.success("发布成功");
      setPublishOpen(false);
      await loadInfo(selectedId);
      void loadList();
    } catch (e) {
      toast.error(`发布失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="flex h-full">
      <AgentListPanel
        agents={agents}
        loading={listLoading}
        selectedId={selectedId}
        onSelect={selectAgent}
        onRefresh={() => void loadList()}
        onCreate={() => setCreateOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶部操作条 */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-bg-elev px-4">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="truncate text-sm font-semibold">
              {info ? info.agentInfo.name || "未命名 Agent" : "Agent 配置"}
            </span>
            {info && <Badge tone="accent">已发布 v{info.agentInfo.version}</Badge>}
            {bundle && (
              <Badge tone={bundle.status === "PUBLISHED" ? "green" : "yellow"}>
                {bundle.status === "PUBLISHED" ? "已发布" : "草稿"} v{bundle.version}
              </Badge>
            )}
            {infoLoading && <Spinner size={14} />}
          </div>
          {info && selectedId && (
            <>
              <span className="text-xs text-fg-faint">草稿版本</span>
              <Input
                type="number"
                min={1}
                value={draftVersion}
                onChange={(e) => setDraftVersion(Math.max(1, Number(e.target.value) || 1))}
                className="h-8 w-20 px-2 text-xs"
              />
              <Button
                size="sm"
                variant={viewing === "draft" ? "secondary" : "ghost"}
                loading={bundleLoading && viewing === "draft"}
                onClick={() => {
                  setViewing("draft");
                  void loadBundle(selectedId, draftVersion);
                }}
              >
                查草稿
              </Button>
              <Button
                size="sm"
                variant={viewing === "published" ? "secondary" : "ghost"}
                loading={bundleLoading && viewing === "published"}
                onClick={() => {
                  setViewing("published");
                  void loadBundle(selectedId, undefined);
                }}
              >
                查已发布
              </Button>
              <Button
                size="sm"
                variant="outline"
                icon={<GitFork size={14} />}
                onClick={() => {
                  setForkName(`${info.agentInfo.name}-副本`);
                  setForkVersion("");
                  setForkOpen(true);
                }}
              >
                Fork
              </Button>
              <Button
                size="sm"
                variant="primary"
                icon={<Rocket size={14} />}
                onClick={() => setPublishOpen(true)}
              >
                发布
              </Button>
            </>
          )}
        </div>

        {/* 内容区 */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] px-6 py-6">
            {!selectedId && (
              <EmptyState
                icon={<Bot size={36} />}
                title="选择一个 Agent"
                description="从左侧列表选择 Agent 查看与编辑配置，或点击「新建 Agent」创建。"
              />
            )}
            {selectedId && infoLoading && !info && (
              <div className="flex justify-center py-16">
                <Spinner size={20} />
              </div>
            )}
            {selectedId && !infoLoading && !info && (
              <EmptyState
                title="Agent 信息加载失败"
                description="请检查后端服务与身份凭据后重试"
                action={<Button onClick={() => void loadInfo(selectedId)}>重试</Button>}
              />
            )}
            {selectedId && info && (
              <>
                <Tabs
                  tabs={[
                    { key: "info", label: "基本信息" },
                    { key: "spec", label: "Spec 编辑" },
                    { key: "assets", label: "资产" },
                  ]}
                  active={tab}
                  onChange={setTab}
                  className="mb-4"
                />
                {tab === "info" && (
                  <AgentInfoTab info={info} onSaved={() => void loadInfo(selectedId)} />
                )}
                {tab === "spec" && (
                  <AgentSpecTab
                    resourceId={selectedId}
                    draftVersion={draftVersion}
                    bundle={bundle}
                    loading={bundleLoading}
                    viewing={viewing}
                    onSaved={() => {
                      setViewing("draft");
                      void loadBundle(selectedId, draftVersion, true);
                    }}
                  />
                )}
                {tab === "assets" && (
                  <AgentAssetsTab
                    resourceId={selectedId}
                    draftVersion={draftVersion}
                    bundle={bundle}
                    loading={bundleLoading}
                    onReload={reloadViewedBundle}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* 新建 Agent */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建 Agent"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" loading={creating} onClick={() => void createAgent()}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="名称">
            <Input
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder="例如：会议纪要助手"
              autoFocus
            />
          </Field>
          <Field label="描述">
            <Textarea
              value={createDesc}
              onChange={(e) => setCreateDesc(e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </Modal>

      {/* Fork Agent */}
      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title="Fork Agent"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setForkOpen(false)}>取消</Button>
            <Button variant="primary" loading={forking} onClick={() => void forkAgent()}>
              Fork
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Fork 后的名称">
            <Input value={forkName} onChange={(e) => setForkName(e.target.value)} autoFocus />
          </Field>
          <Field label="Fork 来源版本" hint="留空 = 当前已发布版本">
            <Input
              type="number"
              min={1}
              value={forkVersion}
              onChange={(e) => setForkVersion(e.target.value)}
              placeholder="留空 = 当前已发布版本"
            />
          </Field>
        </div>
      </Modal>

      {/* 发布确认 */}
      <ConfirmModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="发布 Agent"
        message={`确定将草稿 v${draftVersion} 发布吗？发布后当前已发布版本 v${info?.agentInfo.version ?? "-"} 将被替换为新版本。`}
        confirmText="发布"
        loading={publishing}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
