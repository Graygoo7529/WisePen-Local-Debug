import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, GitFork, MessageSquarePlus, Rocket, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { agentApi } from "../api/asset";
import { resourceApi } from "../api/resource";
import { AgentAssetsTab } from "../components/agents/AgentAssetsTab";
import { AgentInfoTab } from "../components/agents/AgentInfoTab";
import { AgentListPanel } from "../components/agents/AgentListPanel";
import { AgentSpecTab } from "../components/agents/AgentSpecTab";
import {
  ResourceWorkbenchHeader,
  type ResourceVersionSelection,
} from "../components/assets/ResourceWorkbenchHeader";
import { ConfirmModal, Modal } from "../components/Modal";
import { Badge, Button, EmptyState, Field, Input, Select, Spinner, Tabs, Textarea } from "../components/ui";
import type { AgentResourceInfoResponse, AgentVersionBundle, ResourceItem } from "../lib/types";
import { toast } from "../stores/toastStore";
import { useChatStore } from "../stores/chatStore";

export default function AgentsPage() {
  const navigate = useNavigate();
  const createChatSession = useChatStore((state) => state.createSession);
  const infoRequest = useRef(0);
  const bundleRequest = useRef(0);
  const [agents, setAgents] = useState<ResourceItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [info, setInfo] = useState<AgentResourceInfoResponse | null>(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [bundle, setBundle] = useState<AgentVersionBundle | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [selection, setSelection] = useState<ResourceVersionSelection>({ kind: "draft", version: 1 });
  const [tab, setTab] = useState("spec");

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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [startingChat, setStartingChat] = useState(false);

  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const response = await resourceApi.listResources({ resourceType: "AGENT", size: 50 });
      setAgents(response.list);
    } catch (error) {
      toast.error(`加载 Agent 列表失败：${errorText(error)}`);
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadBundle = useCallback(async (resourceId: string, target: ResourceVersionSelection) => {
    const requestId = ++bundleRequest.current;
    setBundleLoading(true);
    setBundle(null);
    try {
      const response = await agentApi.getAgentVersionBundleInfo(resourceId, target.version);
      if (requestId === bundleRequest.current) setBundle(response);
    } catch (error) {
      if (requestId === bundleRequest.current) {
        toast.error(`加载 v${target.version} 失败：${errorText(error)}`);
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
      const response = await agentApi.getAgentInfo(resourceId);
      if (requestId !== infoRequest.current) return;
      setInfo(response);
      const draft: ResourceVersionSelection = {
        kind: "draft",
        version: response.agentInfo.version + 1,
      };
      setSelection(draft);
      await loadBundle(resourceId, draft);
    } catch (error) {
      if (requestId === infoRequest.current) {
        toast.error(`加载 Agent 信息失败：${errorText(error)}`);
      }
    } finally {
      if (requestId === infoRequest.current) setInfoLoading(false);
    }
  }, [loadBundle]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectAgent = (resourceId: string) => {
    setSelectedId(resourceId);
    setTab("spec");
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
      setInfo(await agentApi.getAgentInfo(selectedId));
      await loadList();
    } catch (error) {
      toast.error(`刷新 Agent 信息失败：${errorText(error)}`);
    }
  };

  const createAgent = async () => {
    const name = createName.trim();
    if (!name) {
      toast.error("请填写 Agent 名称");
      return;
    }
    setCreating(true);
    try {
      await resourceApi.getTagTree();
      const resourceId = await agentApi.createAgent({ title: name, name, description: createDesc.trim() });
      toast.success("Agent 已创建");
      setCreateOpen(false);
      setCreateName("");
      setCreateDesc("");
      await loadList();
      selectAgent(resourceId);
    } catch (error) {
      toast.error(`创建失败：${errorText(error)}`);
    } finally {
      setCreating(false);
    }
  };

  const forkAgent = async () => {
    if (!selectedId || !forkName.trim() || !forkVersion) return;
    setForking(true);
    try {
      const resourceId = await agentApi.forkAgent({
        resourceId: selectedId,
        forkedResourceName: forkName.trim(),
        forkedResourceVersion: Number(forkVersion),
      });
      toast.success("Agent Fork 成功");
      setForkOpen(false);
      await loadList();
      selectAgent(resourceId);
    } catch (error) {
      toast.error(`Fork 失败：${errorText(error)}`);
    } finally {
      setForking(false);
    }
  };

  const publish = async () => {
    if (!selectedId) return;
    setPublishing(true);
    try {
      await agentApi.publishAgentVersion(selectedId);
      toast.success(`草稿 v${selection.version} 已发布`);
      setPublishOpen(false);
      await loadResource(selectedId);
      await loadList();
    } catch (error) {
      toast.error(`发布失败：${errorText(error)}`);
    } finally {
      setPublishing(false);
    }
  };

  const useAgentInChat = async () => {
    if (!selectedId || !info || info.agentInfo.version <= 0) return;
    setStartingChat(true);
    const session = await createChatSession(undefined, selectedId);
    setStartingChat(false);
    if (session) navigate("/chat");
  };

  const removeAgent = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await resourceApi.removeResources([selectedId]);
      toast.success("Agent 资源已删除");
      setDeleteOpen(false);
      setSelectedId(null);
      setInfo(null);
      setBundle(null);
      await loadList();
    } catch (error) {
      toast.error(`删除失败：${errorText(error)}`);
    } finally {
      setDeleting(false);
    }
  };

  const editing = selection.kind === "draft";
  const pendingAssets = bundle?.assets.filter((asset) => asset.uploadStatus !== "AVAILABLE").length ?? 0;
  const hasPrompt = Boolean(bundle?.spec?.systemPrompt?.trim());
  const publishReady = editing && Boolean(bundle) && hasPrompt && pendingAssets === 0;
  const draftVersion = info ? info.agentInfo.version + 1 : selection.version;

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
        {info && selectedId ? (
          <ResourceWorkbenchHeader
            title={info.resourceInfo.resourceName || info.agentInfo.name || "未命名 Agent"}
            resourceId={selectedId}
            publishedVersion={info.agentInfo.version}
            draftVersion={draftVersion}
            selection={selection}
            loading={infoLoading || bundleLoading}
            onVersionChange={changeVersion}
            status={
              editing ? (
                <div className="flex items-center gap-2">
                  <Badge tone={hasPrompt ? "green" : "red"}>
                    {hasPrompt ? "System Prompt 已配置" : "缺少 System Prompt"}
                  </Badge>
                  <Badge tone={pendingAssets === 0 ? "green" : "yellow"}>
                    {pendingAssets === 0 ? "资产已就绪" : `${pendingAssets} 个资产上传中`}
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
                  icon={<MessageSquarePlus size={14} />}
                  loading={startingChat}
                  disabled={info.agentInfo.version <= 0}
                  onClick={() => void useAgentInChat()}
                >
                  用于对话
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<GitFork size={14} />}
                  disabled={info.agentInfo.version <= 0}
                  onClick={() => {
                    setForkName(`${info.resourceInfo.resourceName || info.agentInfo.name}-副本`);
                    setForkVersion(String(info.agentInfo.version));
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
            Agent 资源
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1100px] px-6 py-5">
            {!selectedId && (
              <EmptyState icon={<Bot size={36} />} title="选择或创建 Agent" />
            )}
            {selectedId && infoLoading && !info && (
              <div className="flex justify-center py-16"><Spinner size={20} /></div>
            )}
            {selectedId && !infoLoading && !info && (
              <EmptyState
                title="Agent 信息加载失败"
                action={<Button onClick={() => void loadResource(selectedId)}>重试</Button>}
              />
            )}
            {selectedId && info && (
              <>
                <Tabs
                  tabs={[
                    { key: "spec", label: "运行配置" },
                    { key: "assets", label: "资产" },
                    { key: "info", label: "基本信息" },
                  ]}
                  active={tab}
                  onChange={setTab}
                  className="mb-4"
                />
                {tab === "spec" && (
                  <AgentSpecTab
                    resourceId={selectedId}
                    draftVersion={draftVersion}
                    bundle={bundle}
                    loading={bundleLoading}
                    editable={editing}
                    onSaved={reloadBundle}
                  />
                )}
                {tab === "assets" && (
                  <AgentAssetsTab
                    resourceId={selectedId}
                    draftVersion={draftVersion}
                    bundle={bundle}
                    loading={bundleLoading}
                    editable={editing}
                    onReload={reloadBundle}
                  />
                )}
                {tab === "info" && <AgentInfoTab info={info} onSaved={() => void refreshInfo()} />}
              </>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="新建 Agent"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" loading={creating} onClick={() => void createAgent()}>创建</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Agent 名称">
            <Input value={createName} autoFocus onChange={(event) => setCreateName(event.target.value)} />
          </Field>
          <Field label="描述">
            <Textarea value={createDesc} rows={3} onChange={(event) => setCreateDesc(event.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title="Fork Agent"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setForkOpen(false)}>取消</Button>
            <Button variant="primary" loading={forking} onClick={() => void forkAgent()}>Fork</Button>
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
              options={Array.from({ length: info?.agentInfo.version ?? 0 }, (_, index) => {
                const version = (info?.agentInfo.version ?? 0) - index;
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
        title="删除 Agent 资源"
        message={`确定删除「${info?.resourceInfo.resourceName || info?.agentInfo.name || "当前 Agent"}」吗？资源会立即从业务列表移除。`}
        confirmText="删除"
        danger
        loading={deleting}
        onConfirm={() => void removeAgent()}
      />

      <ConfirmModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title={`发布 Agent v${draftVersion}`}
        message={`发布后 v${draftVersion} 将成为当前版本，并自动创建草稿 v${draftVersion + 1}。`}
        confirmText="发布"
        loading={publishing}
        onConfirm={() => void publish()}
      />
    </div>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
