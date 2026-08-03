import { Fragment, useCallback, useEffect, useState } from "react";
import {
  ChevronRight,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Unlink,
} from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  SectionCard,
  Select,
  Spinner,
  Switch,
  Tabs,
} from "../components/ui";
import { ConfirmModal, Modal } from "../components/Modal";
import { JsonView } from "../components/JsonView";
import { chatApi } from "../api/chat";
import { toast } from "../stores/toastStore";
import { cn } from "../lib/cn";
import type {
  AvailableModels,
  ModelFamily,
  ModelInfo,
  ProviderInfo,
  ProviderType,
} from "../lib/types";

// ============ 常量与小工具 ============
const MODEL_FAMILY_OPTIONS: ModelFamily[] = ["QWEN", "GPT", "CLAUDE", "GEMINI", "GENERIC"];
const PROVIDER_TYPE_OPTIONS: ProviderType[] = [
  "ALIBABA",
  "OPENAI",
  "ANTHROPIC",
  "GOOGLE",
  "OPENAI_COMPATIBLE",
];

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function fmtNum(n?: number | null): string {
  return n === null || n === undefined ? "-" : n.toLocaleString();
}

function ScopeBadge({ scope }: { scope: ModelInfo["scope"] }) {
  return scope === "SYSTEM" ? <Badge tone="accent">系统</Badge> : <Badge tone="blue">用户</Badge>;
}

function ActiveBadge({ active }: { active: boolean }) {
  return active ? <Badge tone="green">启用</Badge> : <Badge tone="gray">停用</Badge>;
}

/** 能力徽标：支持的能力高亮，不支持的置灰。 */
function CapabilityBadges({ model }: { model: ModelInfo }) {
  const caps = [
    { on: model.support_thinking, label: "思考" },
    { on: model.support_vision, label: "视觉" },
    { on: model.support_tools, label: "工具" },
  ];
  return (
    <div className="flex flex-wrap gap-1">
      {caps.map((c) => (
        <Badge key={c.label} tone={c.on ? "blue" : "gray"} className={c.on ? undefined : "opacity-45"}>
          {c.label}
        </Badge>
      ))}
    </div>
  );
}

// ============ 模型 Tab ============
function ModelsTab() {
  const [data, setData] = useState<AvailableModels | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ModelInfo | null>(null);
  const [deleting, setDeleting] = useState<ModelInfo | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await chatApi.listAvailableModels());
    } catch (e) {
      toast.error(`加载模型列表失败：${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleRow = (id: string) => setExpandedId((cur) => (cur === id ? null : id));

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await chatApi.deleteUserModel(deleting.id);
      toast.success(`已删除模型「${deleting.display_name}」`);
      setDeleting(null);
      void load();
    } catch (e) {
      toast.error(`删除模型失败：${errMsg(e)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const tableProps = { expandedId, onToggle: toggleRow };

  return (
    <div className="space-y-4">
      <SectionCard
        title="系统模型"
        description="平台内置模型，只读；点击行可展开 Provider 映射明细。"
        bodyClassName="p-0"
      >
        {loading && !data ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : (
          <ModelTable models={data?.system_models ?? []} user={false} {...tableProps} />
        )}
      </SectionCard>

      <SectionCard
        title="用户模型"
        description="当前用户自定义模型，可编辑、删除；点击行可展开 Provider 映射明细。"
        bodyClassName="p-0"
        actions={
          <>
            <IconButton title="刷新" onClick={() => void load()}>
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </IconButton>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              新建用户模型
            </Button>
          </>
        }
      >
        {loading && !data ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : (
          <ModelTable
            models={data?.user_models ?? []}
            user
            {...tableProps}
            onEdit={(m) => {
              setEditing(m);
              setFormOpen(true);
            }}
            onDelete={setDeleting}
          />
        )}
      </SectionCard>

      <ModelFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="删除用户模型"
        message={`确定删除用户模型「${deleting?.display_name ?? ""}」吗？其全部 Provider 绑定关系将一并移除，且不可恢复。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

function ModelTable({
  models,
  user,
  expandedId,
  onToggle,
  onEdit,
  onDelete,
}: {
  models: ModelInfo[];
  user: boolean;
  expandedId: string | null;
  onToggle: (id: string) => void;
  onEdit?: (m: ModelInfo) => void;
  onDelete?: (m: ModelInfo) => void;
}) {
  const colCount = user ? 9 : 8;
  if (models.length === 0) {
    return (
      <EmptyState
        title={user ? "还没有用户模型" : "暂无系统模型"}
        description={user ? "点击右上角「新建用户模型」创建第一个自定义模型。" : undefined}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left text-xs whitespace-nowrap text-fg-faint">
            <th className="w-7 px-2 py-2" />
            <th className="px-3 py-2 font-medium">名称</th>
            <th className="px-3 py-2 font-medium">范围</th>
            <th className="px-3 py-2 font-medium">模型族</th>
            <th className="px-3 py-2 font-medium">能力</th>
            <th className="px-3 py-2 font-medium">计费倍率</th>
            <th className="px-3 py-2 font-medium">上下文窗口</th>
            <th className="px-3 py-2 font-medium">状态</th>
            {user && <th className="px-3 py-2 text-right font-medium">操作</th>}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => {
            const expanded = expandedId === m.id;
            return (
              <Fragment key={m.id}>
                <tr
                  className="cursor-pointer border-b border-line transition-colors hover:bg-bg-hover"
                  onClick={() => onToggle(m.id)}
                >
                  <td className="px-2 py-2 text-fg-faint">
                    <ChevronRight
                      size={14}
                      className={cn("transition-transform", expanded && "rotate-90")}
                    />
                  </td>
                  <td className="px-3 py-2 font-medium text-fg">{m.display_name}</td>
                  <td className="px-3 py-2">
                    <ScopeBadge scope={m.scope} />
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{m.model_family}</td>
                  <td className="px-3 py-2">
                    <CapabilityBadges model={m} />
                  </td>
                  <td className="px-3 py-2 text-fg-muted">{m.billing_ratio}</td>
                  <td className="px-3 py-2 text-fg-muted">{fmtNum(m.context_window_tokens)}</td>
                  <td className="px-3 py-2">
                    <ActiveBadge active={m.is_active} />
                  </td>
                  {user && (
                    <td className="px-3 py-2">
                      <div
                        className="flex items-center justify-end gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <IconButton title="编辑" onClick={() => onEdit?.(m)}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton title="删除" onClick={() => onDelete?.(m)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </td>
                  )}
                </tr>
                {expanded && (
                  <tr className="border-b border-line">
                    <td colSpan={colCount} className="bg-bg-sunken px-4 py-3">
                      <MappingDetail mappings={m.mappings} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 模型的 Provider 映射明细。 */
function MappingDetail({ mappings }: { mappings: ModelInfo["mappings"] }) {
  if (!mappings || mappings.length === 0) {
    return <div className="text-xs text-fg-faint">该模型尚未绑定任何 Provider。</div>;
  }
  return (
    <div>
      <div className="mb-2 text-xs font-medium text-fg-muted">Provider 映射（{mappings.length}）</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-line text-left whitespace-nowrap text-fg-faint">
            <th className="px-2 py-1.5 font-medium">Provider</th>
            <th className="px-2 py-1.5 font-medium">Provider 模型名</th>
            <th className="px-2 py-1.5 font-medium">首选</th>
            <th className="px-2 py-1.5 font-medium">启用</th>
            <th className="px-2 py-1.5 font-medium">优先级</th>
            <th className="px-2 py-1.5 font-medium">Runtime Options</th>
          </tr>
        </thead>
        <tbody>
          {mappings.map((mp) => (
            <tr key={mp.provider_id} className="border-b border-line last:border-0">
              <td className="px-2 py-1.5 text-fg">{mp.provider_name || mp.provider_id}</td>
              <td className="px-2 py-1.5 font-mono text-fg-muted">{mp.provider_model_name}</td>
              <td className="px-2 py-1.5">
                {mp.is_preferred ? <Badge tone="accent">首选</Badge> : <span className="text-fg-faint">-</span>}
              </td>
              <td className="px-2 py-1.5">
                <ActiveBadge active={mp.is_active} />
              </td>
              <td className="px-2 py-1.5 text-fg-muted">{mp.priority}</td>
              <td className="px-2 py-1.5">
                {Object.keys(mp.support_runtime_options ?? {}).length > 0 ? (
                  <JsonView
                    data={mp.support_runtime_options}
                    defaultExpandDepth={1}
                    className="max-w-[420px]"
                  />
                ) : (
                  <span className="text-fg-faint">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ 模型新建 / 编辑表单 ============
interface ModelFormState {
  display_name: string;
  model_family: ModelFamily;
  billing_ratio: string;
  support_thinking: boolean;
  support_vision: boolean;
  support_tools: boolean;
  context_window_tokens: string;
  max_output_tokens: string;
}

function emptyModelForm(): ModelFormState {
  return {
    display_name: "",
    model_family: "GENERIC",
    billing_ratio: "1",
    support_thinking: false,
    support_vision: false,
    support_tools: true,
    context_window_tokens: "",
    max_output_tokens: "",
  };
}

function ModelFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: ModelInfo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ModelFormState>(emptyModelForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        display_name: editing.display_name,
        model_family: editing.model_family,
        billing_ratio: String(editing.billing_ratio),
        support_thinking: editing.support_thinking,
        support_vision: editing.support_vision,
        support_tools: editing.support_tools,
        context_window_tokens:
          editing.context_window_tokens != null ? String(editing.context_window_tokens) : "",
        max_output_tokens:
          editing.max_output_tokens != null ? String(editing.max_output_tokens) : "",
      });
    } else {
      setForm(emptyModelForm());
    }
  }, [open, editing]);

  const patch = (p: Partial<ModelFormState>) => setForm((f) => ({ ...f, ...p }));

  const submit = async () => {
    const name = form.display_name.trim();
    if (!name) {
      toast.error("请填写模型名称");
      return;
    }
    const ratio = Number(form.billing_ratio);
    if (!Number.isInteger(ratio) || ratio < 0) {
      toast.error("计费倍率必须是非负整数");
      return;
    }
    const ctxText = form.context_window_tokens.trim();
    const outText = form.max_output_tokens.trim();
    const ctxNum = ctxText === "" ? null : Number(ctxText);
    const outNum = outText === "" ? null : Number(outText);
    if (ctxNum !== null && (!Number.isInteger(ctxNum) || ctxNum <= 0)) {
      toast.error("上下文窗口必须是正整数");
      return;
    }
    if (outNum !== null && (!Number.isInteger(outNum) || outNum <= 0)) {
      toast.error("最大输出 Token 必须是正整数");
      return;
    }

    const body: Record<string, unknown> & { display_name: string } = {
      display_name: name,
      model_family: form.model_family,
      billing_ratio: ratio,
      support_thinking: form.support_thinking,
      support_vision: form.support_vision,
      support_tools: form.support_tools,
    };
    // 留空则不携带该字段：创建时由后端取默认值，编辑时保持原值不变
    if (ctxNum !== null) body.context_window_tokens = ctxNum;
    if (outNum !== null) body.max_output_tokens = outNum;

    setSaving(true);
    try {
      if (editing) {
        await chatApi.updateUserModel({ ...body, model_id: editing.id });
        toast.success("模型已更新");
      } else {
        await chatApi.createUserModel(body);
        toast.success("用户模型已创建");
      }
      onClose();
      onSaved();
    } catch (e) {
      toast.error(`${editing ? "更新" : "创建"}模型失败：${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `编辑模型「${editing.display_name}」` : "新建用户模型"}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="模型名称" hint="展示名称，必填">
          <Input
            value={form.display_name}
            onChange={(e) => patch({ display_name: e.target.value })}
            placeholder="如：我的 Qwen-Max"
            spellCheck={false}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="模型族">
            <Select
              value={form.model_family}
              onChange={(e) => patch({ model_family: e.target.value as ModelFamily })}
              options={MODEL_FAMILY_OPTIONS.map((f) => ({ value: f, label: f }))}
            />
          </Field>
          <Field label="计费倍率" hint="非负整数，默认 1">
            <Input
              type="number"
              min={0}
              step={1}
              value={form.billing_ratio}
              onChange={(e) => patch({ billing_ratio: e.target.value })}
            />
          </Field>
        </div>
        <Field label="能力">
          <div className="flex items-center gap-6 pt-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
              <Switch
                checked={form.support_thinking}
                onChange={(v) => patch({ support_thinking: v })}
              />
              思考
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
              <Switch
                checked={form.support_vision}
                onChange={(v) => patch({ support_vision: v })}
              />
              视觉
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[13px] text-fg-muted">
              <Switch checked={form.support_tools} onChange={(v) => patch({ support_tools: v })} />
              工具
            </label>
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="上下文窗口（Token）" hint="正整数，可留空">
            <Input
              type="number"
              min={1}
              step={1}
              value={form.context_window_tokens}
              onChange={(e) => patch({ context_window_tokens: e.target.value })}
              placeholder="如 131072"
            />
          </Field>
          <Field label="最大输出（Token）" hint="正整数，可留空">
            <Input
              type="number"
              min={1}
              step={1}
              value={form.max_output_tokens}
              onChange={(e) => patch({ max_output_tokens: e.target.value })}
              placeholder="如 8192"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ============ Provider Tab ============
function ProvidersTab() {
  const [providers, setProviders] = useState<ProviderInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [boundModels, setBoundModels] = useState<ModelInfo[]>([]);
  const [boundLoading, setBoundLoading] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [unbindingId, setUnbindingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ProviderInfo | null>(null);
  const [deleting, setDeleting] = useState<ProviderInfo | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await chatApi.listUserProviders();
      setProviders(resp.providers);
    } catch (e) {
      toast.error(`加载 Provider 列表失败：${errMsg(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadBound = useCallback(async (providerId: string) => {
    setBoundLoading(true);
    try {
      const resp = await chatApi.listUserModelsByProviderId(providerId);
      setBoundModels(resp.models);
    } catch (e) {
      toast.error(`加载绑定模型失败：${errMsg(e)}`);
    } finally {
      setBoundLoading(false);
    }
  }, []);

  const toggleExpand = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setBoundModels([]);
    } else {
      setExpandedId(id);
      setBoundModels([]);
      void loadBound(id);
    }
  };

  const toggleActive = async (p: ProviderInfo, v: boolean) => {
    setTogglingId(p.id);
    // 乐观更新，失败时重新拉取还原
    setProviders((prev) => prev?.map((x) => (x.id === p.id ? { ...x, is_active: v } : x)) ?? prev);
    try {
      await chatApi.updateUserProvider({ provider_id: p.id, is_active: v });
      toast.success(v ? `已启用「${p.name}」` : `已停用「${p.name}」`);
    } catch (e) {
      toast.error(`更新启停状态失败：${errMsg(e)}`);
      void load();
    } finally {
      setTogglingId(null);
    }
  };

  const unbind = async (modelId: string) => {
    if (!expandedId) return;
    setUnbindingId(modelId);
    try {
      await chatApi.unbindModelProvider(modelId, expandedId);
      toast.success("已解绑");
      void loadBound(expandedId);
    } catch (e) {
      toast.error(`解绑失败：${errMsg(e)}`);
    } finally {
      setUnbindingId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await chatApi.deleteUserProvider(deleting.id);
      toast.success(`已删除 Provider「${deleting.name}」`);
      if (deleting.id === expandedId) {
        setExpandedId(null);
        setBoundModels([]);
      }
      setDeleting(null);
      void load();
    } catch (e) {
      toast.error(`删除 Provider 失败：${errMsg(e)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  const expandedProvider = providers?.find((p) => p.id === expandedId) ?? null;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Provider"
        description="当前用户的模型服务提供方；展开行可查看、绑定或解绑模型。"
        bodyClassName="p-0"
        actions={
          <>
            <IconButton title="刷新" onClick={() => void load()}>
              <RefreshCw size={14} className={cn(loading && "animate-spin")} />
            </IconButton>
            <Button
              size="sm"
              variant="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              新建 Provider
            </Button>
          </>
        }
      >
        {loading && !providers ? (
          <div className="flex justify-center py-10">
            <Spinner size={20} />
          </div>
        ) : !providers || providers.length === 0 ? (
          <EmptyState
            title="还没有 Provider"
            description="点击右上角「新建 Provider」接入你的模型服务。"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-xs whitespace-nowrap text-fg-faint">
                  <th className="px-3 py-2 font-medium">名称</th>
                  <th className="px-3 py-2 font-medium">类型</th>
                  <th className="px-3 py-2 font-medium">Base URL</th>
                  <th className="px-3 py-2 font-medium">启用</th>
                  <th className="px-3 py-2 font-medium">API Key 指纹</th>
                  <th className="px-3 py-2 font-medium">Token 用量</th>
                  <th className="px-3 py-2 text-right font-medium">操作</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((p) => {
                  const expanded = expandedId === p.id;
                  return (
                    <Fragment key={p.id}>
                      <tr className="border-b border-line">
                        <td className="px-3 py-2 font-medium text-fg">{p.name}</td>
                        <td className="px-3 py-2">
                          <Badge tone="gray">{p.type}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div
                            className="max-w-[220px] truncate font-mono text-xs text-fg-muted"
                            title={p.base_url ?? undefined}
                          >
                            {p.base_url || "-"}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Switch
                            checked={p.is_active}
                            disabled={togglingId === p.id}
                            onChange={(v) => void toggleActive(p, v)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-fg-muted">
                          {p.api_key_fingerprint || "-"}
                        </td>
                        <td
                          className="px-3 py-2 text-fg-muted"
                          title={`计费 Token：${p.billable_token_usage.toLocaleString()}`}
                        >
                          {p.token_usage.toLocaleString()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => toggleExpand(p.id)}
                            >
                              {expanded ? "收起" : "查看模型"}
                            </Button>
                            <IconButton
                              title="编辑"
                              onClick={() => {
                                setEditing(p);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil size={14} />
                            </IconButton>
                            <IconButton title="删除" onClick={() => setDeleting(p)}>
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="border-b border-line">
                          <td colSpan={7} className="bg-bg-sunken px-4 py-3">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-fg-muted">
                                绑定的模型{boundLoading ? "" : `（${boundModels.length}）`}
                              </span>
                              <Button
                                size="xs"
                                variant="outline"
                                icon={<Link2 size={12} />}
                                onClick={() => setBindOpen(true)}
                              >
                                绑定模型
                              </Button>
                            </div>
                            {boundLoading ? (
                              <div className="flex justify-center py-4">
                                <Spinner />
                              </div>
                            ) : boundModels.length === 0 ? (
                              <div className="text-xs text-fg-faint">尚未绑定任何模型。</div>
                            ) : (
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-line text-left whitespace-nowrap text-fg-faint">
                                    <th className="px-2 py-1.5 font-medium">模型</th>
                                    <th className="px-2 py-1.5 font-medium">模型族</th>
                                    <th className="px-2 py-1.5 font-medium">Provider 模型名</th>
                                    <th className="px-2 py-1.5 font-medium">状态</th>
                                    <th className="px-2 py-1.5 text-right font-medium">操作</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {boundModels.map((m) => {
                                    const mapping = m.mappings?.find(
                                      (mp) => mp.provider_id === p.id,
                                    );
                                    return (
                                      <tr key={m.id} className="border-b border-line last:border-0">
                                        <td className="px-2 py-1.5 text-fg">{m.display_name}</td>
                                        <td className="px-2 py-1.5 text-fg-muted">{m.model_family}</td>
                                        <td className="px-2 py-1.5 font-mono text-fg-muted">
                                          {mapping?.provider_model_name ?? "-"}
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <ActiveBadge active={m.is_active} />
                                        </td>
                                        <td className="px-2 py-1.5">
                                          <div className="flex justify-end">
                                            <Button
                                              size="xs"
                                              variant="ghost"
                                              icon={<Unlink size={12} />}
                                              loading={unbindingId === m.id}
                                              onClick={() => void unbind(m.id)}
                                            >
                                              解绑
                                            </Button>
                                          </div>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <ProviderFormModal
        open={formOpen}
        editing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => void load()}
      />
      <BindModelModal
        open={bindOpen}
        provider={expandedProvider}
        boundModelIds={boundModels.map((m) => m.id)}
        onClose={() => setBindOpen(false)}
        onBound={() => {
          if (expandedId) void loadBound(expandedId);
        }}
      />
      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        title="删除 Provider"
        message={`确定删除 Provider「${deleting?.name ?? ""}」吗？删除会级联解除其与所有模型的绑定关系，且不可恢复。`}
        confirmText="删除"
        danger
        loading={deleteLoading}
      />
    </div>
  );
}

// ============ Provider 新建 / 编辑表单 ============
interface ProviderFormState {
  name: string;
  type: ProviderType;
  api_key: string;
  base_url: string;
}

function ProviderFormModal({
  open,
  editing,
  onClose,
  onSaved,
}: {
  open: boolean;
  editing: ProviderInfo | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ProviderFormState>({
    name: "",
    type: "OPENAI_COMPATIBLE",
    api_key: "",
    base_url: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    // 密钥不回显：编辑时 api_key 始终为空，留空表示不更新
    setForm(
      editing
        ? { name: editing.name, type: editing.type, api_key: "", base_url: editing.base_url ?? "" }
        : { name: "", type: "OPENAI_COMPATIBLE", api_key: "", base_url: "" },
    );
  }, [open, editing]);

  const patch = (p: Partial<ProviderFormState>) => setForm((f) => ({ ...f, ...p }));

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("请填写 Provider 名称");
      return;
    }
    const apiKey = form.api_key.trim();
    if (!editing && !apiKey) {
      toast.error("请填写 API Key");
      return;
    }
    const baseUrl = form.base_url.trim();

    setSaving(true);
    try {
      if (editing) {
        const body: Record<string, unknown> & { provider_id: string } = {
          provider_id: editing.id,
          name,
          type: form.type,
        };
        if (apiKey) body.api_key = apiKey;
        if (baseUrl) body.base_url = baseUrl;
        await chatApi.updateUserProvider(body);
        toast.success("Provider 已更新");
      } else {
        await chatApi.createUserProvider({
          name,
          type: form.type,
          api_key: apiKey,
          base_url: baseUrl || null,
        });
        toast.success("Provider 已创建");
      }
      onClose();
      onSaved();
    } catch (e) {
      toast.error(`${editing ? "更新" : "创建"} Provider 失败：${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? `编辑 Provider「${editing.name}」` : "新建 Provider"}
      width="max-w-lg"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="名称" hint="展示名称，必填">
          <Input
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="如：我的阿里云百炼"
            spellCheck={false}
          />
        </Field>
        <Field label="类型">
          <Select
            value={form.type}
            onChange={(e) => patch({ type: e.target.value as ProviderType })}
            options={PROVIDER_TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
          />
        </Field>
        <Field
          label="API Key"
          hint={editing ? "留空表示不更新；密钥只提交不回显" : "必填；密钥只提交不回显"}
        >
          <Input
            type="password"
            value={form.api_key}
            onChange={(e) => patch({ api_key: e.target.value })}
            placeholder={editing ? "留空表示不更新" : "sk-..."}
            spellCheck={false}
          />
        </Field>
        <Field label="Base URL" hint="可留空，使用类型对应的默认地址">
          <Input
            value={form.base_url}
            onChange={(e) => patch({ base_url: e.target.value })}
            placeholder="https://..."
            spellCheck={false}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ============ 绑定模型到 Provider ============
function BindModelModal({
  open,
  provider,
  boundModelIds,
  onClose,
  onBound,
}: {
  open: boolean;
  provider: ProviderInfo | null;
  boundModelIds: string[];
  onClose: () => void;
  onBound: () => void;
}) {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelId, setModelId] = useState("");
  const [providerModelName, setProviderModelName] = useState("");
  const [isPreferred, setIsPreferred] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setModelId("");
    setProviderModelName("");
    setIsPreferred(true);
    setLoadingModels(true);
    chatApi
      .listAllUserModels()
      .then((resp) => setModels(resp.models))
      .catch((e) => toast.error(`加载用户模型失败：${errMsg(e)}`))
      .finally(() => setLoadingModels(false));
  }, [open]);

  const options = models
    .filter((m) => !boundModelIds.includes(m.id))
    .map((m) => ({ value: m.id, label: `${m.display_name}（${m.model_family}）` }));

  const submit = async () => {
    if (!provider) return;
    if (!modelId) {
      toast.error("请选择要绑定的模型");
      return;
    }
    const pmn = providerModelName.trim();
    if (!pmn) {
      toast.error("请填写 Provider 模型名");
      return;
    }
    setSaving(true);
    try {
      await chatApi.bindModelProvider({
        model_id: modelId,
        provider_id: provider.id,
        provider_model_name: pmn,
        is_preferred: isPreferred,
      });
      toast.success("绑定成功");
      onClose();
      onBound();
    } catch (e) {
      toast.error(`绑定失败：${errMsg(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`绑定模型到「${provider?.name ?? ""}」`}
      width="max-w-md"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            绑定
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="用户模型" hint="仅列出尚未绑定到该 Provider 的模型">
          {loadingModels ? (
            <div className="flex h-9 items-center">
              <Spinner size={14} />
            </div>
          ) : options.length === 0 ? (
            <div className="flex h-9 items-center text-[13px] text-fg-faint">
              没有可绑定的用户模型
            </div>
          ) : (
            <Select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              options={[{ value: "", label: "请选择模型", disabled: true }, ...options]}
            />
          )}
        </Field>
        <Field label="Provider 模型名" hint="该 Provider API 实际识别的模型名">
          <Input
            value={providerModelName}
            onChange={(e) => setProviderModelName(e.target.value)}
            placeholder="如 qwen-max"
            spellCheck={false}
          />
        </Field>
        <Field label="首选">
          <div className="flex items-center gap-2 pt-1">
            <Switch checked={isPreferred} onChange={setIsPreferred} />
            <span className="text-[13px] text-fg-muted">作为该模型的默认 Provider</span>
          </div>
        </Field>
      </div>
    </Modal>
  );
}

// ============ 页面 ============
export default function ModelsPage() {
  const [tab, setTab] = useState<"models" | "providers">("models");
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <PageHeader
          title="模型与 Provider"
          description="查看系统模型，管理自定义模型、第三方 Provider 及其绑定关系。"
        />
        <Tabs
          className="mb-4"
          tabs={[
            { key: "models", label: "模型" },
            { key: "providers", label: "Provider" },
          ]}
          active={tab}
          onChange={(k) => setTab(k as "models" | "providers")}
        />
        {tab === "models" ? <ModelsTab /> : <ProvidersTab />}
      </div>
    </div>
  );
}
