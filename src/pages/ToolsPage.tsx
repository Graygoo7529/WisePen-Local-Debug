import { Fragment, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight,
  Plus,
  RefreshCw,
  Server,
  Settings2,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  IconButton,
  Input,
  PageHeader,
  Spinner,
  Switch,
  Tabs,
  Textarea,
  type BadgeTone,
} from "../components/ui";
import { ConfirmModal, Modal } from "../components/Modal";
import { JsonView } from "../components/JsonView";
import { chatApi, previewUserMcpServerWithTimeout } from "../api/chat";
import { toast } from "../stores/toastStore";
import { useSettingsStore } from "../stores/settingsStore";
import { cn } from "../lib/cn";
import type {
  McpPreviewResult,
  McpToolSnapshot,
  McpToolStatus,
  ToolInfo,
  UserMcpServer,
} from "../lib/types";

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ============ 键值对编辑器（headers / secret_config 等） ============
interface KVPair {
  key: string;
  value: string;
}

function pairsToRecord(pairs: KVPair[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const { key, value } of pairs) {
    const k = key.trim();
    if (k) out[k] = value;
  }
  return out;
}

function KeyValueEditor({
  pairs,
  onChange,
  addLabel,
  secret,
  keyPlaceholder = "键",
  valuePlaceholder = "值",
}: {
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  addLabel: string;
  /** value 用密码输入框（密钥只提交不回显） */
  secret?: boolean;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const update = (i: number, patch: Partial<KVPair>) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  return (
    <div className="space-y-2">
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            className="flex-1 font-mono text-xs"
            value={p.key}
            placeholder={keyPlaceholder}
            spellCheck={false}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <Input
            className="flex-1 font-mono text-xs"
            type={secret ? "password" : "text"}
            value={p.value}
            placeholder={valuePlaceholder}
            spellCheck={false}
            onChange={(e) => update(i, { value: e.target.value })}
          />
          <IconButton title="删除" onClick={() => onChange(pairs.filter((_, idx) => idx !== i))}>
            <X size={13} />
          </IconButton>
        </div>
      ))}
      <Button
        size="xs"
        variant="outline"
        icon={<Plus size={12} />}
        onClick={() => onChange([...pairs, { key: "", value: "" }])}
      >
        {addLabel}
      </Button>
    </div>
  );
}

// ============ MCP 预览状态徽标 ============
const statusMeta: Record<McpToolStatus, { tone: BadgeTone; label: string }> = {
  available: { tone: "green", label: "连接成功" },
  invalid_schema: { tone: "yellow", label: "Schema 异常" },
  never: { tone: "gray", label: "未探测" },
};

const metaOf = (status: McpToolStatus) =>
  statusMeta[status] ?? { tone: "gray" as BadgeTone, label: status };

// ============ 内置工具：配置 Modal ============
function ToolConfigModal({
  tool,
  onClose,
  onSaved,
}: {
  tool: ToolInfo;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [configText, setConfigText] = useState("");
  const [secrets, setSecrets] = useState<KVPair[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const savedSecretKeys = Object.keys(tool.secret_fingerprints ?? {});

  const save = async () => {
    const text = configText.trim();
    let config: Record<string, unknown> | null = null;
    if (text) {
      try {
        const parsed: unknown = JSON.parse(text);
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          toast.error("config 必须是 JSON 对象");
          return;
        }
        config = parsed as Record<string, unknown>;
      } catch {
        toast.error("config 不是合法的 JSON");
        return;
      }
    }
    const secretConfig = pairsToRecord(secrets);
    setSaving(true);
    try {
      await chatApi.updateUserToolConfig({
        tool_name: tool.name,
        config,
        secret_config: Object.keys(secretConfig).length > 0 ? secretConfig : null,
      });
      toast.success("工具配置已保存");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(`保存失败：${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      await chatApi.deleteUserToolConfig(tool.name);
      toast.success(`已删除 ${tool.name} 的配置`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(`删除失败：${errText(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        title={
          <span>
            配置工具 <span className="font-mono">{tool.name}</span>
          </span>
        }
        footer={
          <div className="flex w-full items-center justify-between">
            <div>
              {tool.configured && (
                <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
                  删除配置
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={onClose}>取消</Button>
              <Button variant="primary" loading={saving} onClick={() => void save()}>
                保存
              </Button>
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-[13px] font-medium text-fg-muted">配置 schema 参考</div>
            <JsonView data={tool.config_schema} defaultExpandDepth={2} />
          </div>
          <Field label="config（JSON 对象）" hint="保存时按 JSON 解析；留空表示不修改现有 config">
            <Textarea
              className="font-mono text-xs"
              rows={6}
              value={configText}
              placeholder='{"key": "value"}'
              spellCheck={false}
              onChange={(e) => setConfigText(e.target.value)}
            />
          </Field>
          <Field label="secret_config（密钥）" hint="密钥只提交不回显，服务端仅保存指纹">
            <KeyValueEditor
              pairs={secrets}
              onChange={setSecrets}
              addLabel="添加密钥"
              secret
              keyPlaceholder="密钥名"
              valuePlaceholder="密钥值"
            />
          </Field>
          {savedSecretKeys.length > 0 && (
            <div className="text-xs text-fg-faint">
              已保存的密钥：{savedSecretKeys.join("、")}
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void doDelete()}
        title="删除工具配置"
        message={
          <span>
            确定删除 <span className="font-mono">{tool.name}</span>{" "}
            的全部配置（含已保存密钥）吗？删除后该工具回到未配置状态。
          </span>
        }
        confirmText="删除"
        danger
        loading={deleting}
      />
    </>
  );
}

// ============ 内置工具 Tab ============
function BuiltinToolsTab() {
  const [tools, setTools] = useState<ToolInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [configTool, setConfigTool] = useState<ToolInfo | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chatApi.listUserTools();
      setTools(res.tools ?? []);
    } catch (e) {
      toast.error(`加载工具列表失败：${errText(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (tool: ToolInfo, enabled: boolean) => {
    setToggling(tool.name);
    // 乐观更新，失败回滚
    setTools((prev) => prev?.map((t) => (t.name === tool.name ? { ...t, enabled } : t)) ?? prev);
    try {
      await chatApi.updateUserToolConfig({ tool_name: tool.name, enabled });
    } catch (e) {
      setTools(
        (prev) => prev?.map((t) => (t.name === tool.name ? { ...t, enabled: !enabled } : t)) ?? prev,
      );
      toast.error(`更新失败：${errText(e)}`);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-fg-faint">
          {tools ? `共 ${tools.length} 个内置工具` : "加载中…"}
        </div>
        <Button
          size="sm"
          variant="outline"
          icon={<RefreshCw size={13} />}
          loading={loading}
          onClick={() => void load()}
        >
          刷新
        </Button>
      </div>

      {tools === null ? (
        loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={20} />
          </div>
        ) : (
          <EmptyState
            title="工具列表加载失败"
            action={
              <Button variant="outline" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        )
      ) : tools.length === 0 ? (
        <EmptyState icon={<Wrench size={32} />} title="暂无内置工具" description="后端未返回任何内置工具。" />
      ) : (
        <div className="space-y-3">
          {tools.map((tool) => (
            <Card key={tool.name} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-sm font-semibold text-fg">{tool.name}</span>
                    {tool.requires_config &&
                      (tool.configured ? (
                        <Badge tone="green">已配置</Badge>
                      ) : (
                        <Badge tone="yellow">需要配置</Badge>
                      ))}
                    {tool.missing_config_keys.map((k) => (
                      <Badge key={k} tone="yellow">
                        缺少 {k}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-5 text-fg-muted">
                    {tool.description || "（无描述）"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <Switch
                    checked={tool.enabled}
                    disabled={toggling === tool.name}
                    onChange={(v) => void toggleEnabled(tool, v)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    icon={<Settings2 size={13} />}
                    onClick={() => setConfigTool(tool)}
                  >
                    配置
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {configTool && (
        <ToolConfigModal
          tool={configTool}
          onClose={() => setConfigTool(null)}
          onSaved={() => void load()}
        />
      )}
    </div>
  );
}

// ============ MCP：预览结果面板 ============
interface PreviewState {
  open: boolean;
  loading: boolean;
  result?: McpPreviewResult;
  error?: string;
}

function McpToolItem({ tool }: { tool: McpToolSnapshot }) {
  const [open, setOpen] = useState(false);
  const meta = metaOf(tool.status);
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-bg-hover"
        onClick={() => setOpen((v) => !v)}
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-fg-faint transition-transform", open && "rotate-90")}
        />
        <span className="shrink-0 font-mono text-[13px] text-fg">{tool.name}</span>
        <span className="min-w-0 flex-1 truncate text-xs text-fg-muted">{tool.description}</span>
        {tool.status !== "available" && <Badge tone={meta.tone}>{meta.label}</Badge>}
      </button>
      {open && (
        <div className="px-3 pb-3">
          <JsonView data={tool.input_schema} defaultExpandDepth={2} />
        </div>
      )}
    </div>
  );
}

function PreviewPanel({ state, onClose }: { state: PreviewState; onClose: () => void }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-fg-muted">连接预览</span>
        {state.loading ? (
          <Spinner size={13} />
        ) : state.error ? (
          <Badge tone="red">请求失败</Badge>
        ) : state.result ? (
          <Badge tone={metaOf(state.result.status).tone}>{metaOf(state.result.status).label}</Badge>
        ) : null}
        <div className="flex-1" />
        <IconButton title="关闭" onClick={onClose}>
          <X size={13} />
        </IconButton>
      </div>
      {state.error && <div className="text-xs leading-5 text-danger">{state.error}</div>}
      {state.result?.error && (
        <div className="text-xs leading-5 text-danger">{state.result.error}</div>
      )}
      {state.result && state.result.tools.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line bg-bg-elev">
          {state.result.tools.map((t) => (
            <McpToolItem key={t.name} tool={t} />
          ))}
        </div>
      )}
      {state.result && state.result.tools.length === 0 && !state.result.error && (
        <div className="text-xs text-fg-faint">未从服务器获取到工具。</div>
      )}
    </div>
  );
}

// ============ MCP：新建 / 编辑 Modal ============
function McpServerModal({
  initial,
  onClose,
  onSaved,
}: {
  /** null 表示新建；编辑时直接用列表行数据填充（不调 getUserMcpServer） */
  initial: UserMcpServer | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [displayName, setDisplayName] = useState(initial?.display_name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [headers, setHeaders] = useState<KVPair[]>(() =>
    Object.entries(initial?.headers ?? {}).map(([key, value]) => ({ key, value })),
  );
  const [secretHeaders, setSecretHeaders] = useState<KVPair[]>([]);
  const [toolNames, setToolNames] = useState((initial?.enabled_tool_names ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  const savedSecretKeys = Object.keys(initial?.secret_header_fingerprints ?? {});

  const save = async () => {
    const name = displayName.trim();
    const u = url.trim();
    if (!name) {
      toast.error("请填写显示名称");
      return;
    }
    if (!u) {
      toast.error("请填写服务器 URL");
      return;
    }
    const enabledToolNames = toolNames
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const body: Record<string, unknown> & { url: string } = {
      url: u,
      display_name: name,
      enabled,
      headers: pairsToRecord(headers),
      enabled_tool_names: enabledToolNames,
    };
    if (initial) body.server_id = initial.server_id;
    const secret = pairsToRecord(secretHeaders);
    if (Object.keys(secret).length > 0) body.secret_headers = secret;

    setSaving(true);
    try {
      await chatApi.upsertUserMcpServer(body);
      toast.success(initial ? "MCP 服务器已保存" : "MCP 服务器已创建");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(`保存失败：${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={initial ? "编辑 MCP 服务器" : "新建 MCP 服务器"}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" loading={saving} onClick={() => void save()}>
            保存
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="显示名称" hint="必填">
          <Input
            value={displayName}
            placeholder="例如：本地文件系统"
            spellCheck={false}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </Field>
        <Field label="服务器 URL" hint="必填">
          <Input
            value={url}
            placeholder="http://127.0.0.1:8000/mcp"
            spellCheck={false}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-fg-muted">启用</div>
          <Switch checked={enabled} onChange={setEnabled} />
        </div>
        <Field label="headers（请求头）">
          <KeyValueEditor
            pairs={headers}
            onChange={setHeaders}
            addLabel="添加请求头"
            keyPlaceholder="Header 名"
            valuePlaceholder="Header 值"
          />
        </Field>
        <Field label="secret_headers（密钥请求头）" hint="密钥只提交不回显，服务端仅保存指纹">
          <KeyValueEditor
            pairs={secretHeaders}
            onChange={setSecretHeaders}
            addLabel="添加密钥"
            secret
            keyPlaceholder="Header 名"
            valuePlaceholder="密钥值"
          />
        </Field>
        {savedSecretKeys.length > 0 && (
          <div className="text-xs text-fg-faint">
            已保存的密钥请求头：{savedSecretKeys.join("、")}
          </div>
        )}
        <Field label="enabled_tool_names" hint="允许使用的工具名，多个用英文逗号分隔">
          <Input
            value={toolNames}
            placeholder="tool_a, tool_b"
            spellCheck={false}
            onChange={(e) => setToolNames(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ============ MCP 服务器 Tab ============
function McpServersTab() {
  const [servers, setServers] = useState<UserMcpServer[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ target: UserMcpServer | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserMcpServer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await chatApi.listUserMcpServers();
      setServers(res.servers ?? []);
    } catch (e) {
      toast.error(`加载 MCP 服务器失败：${errText(e)}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleEnabled = async (s: UserMcpServer, enabled: boolean) => {
    setToggling(s.server_id);
    try {
      await chatApi.upsertUserMcpServer({
        server_id: s.server_id,
        display_name: s.display_name,
        url: s.url,
        enabled,
        headers: s.headers,
        enabled_tool_names: s.enabled_tool_names,
      });
      setServers(
        (prev) => prev?.map((x) => (x.server_id === s.server_id ? { ...x, enabled } : x)) ?? prev,
      );
    } catch (e) {
      toast.error(`更新失败：${errText(e)}`);
    } finally {
      setToggling(null);
    }
  };

  const runPreview = async (s: UserMcpServer) => {
    setPreviews((prev) => ({ ...prev, [s.server_id]: { open: true, loading: true } }));
    try {
      // 带上 server_id，便于服务端合并已保存的 secret_headers
      const result = await previewUserMcpServerWithTimeout({
        server_id: s.server_id,
        url: s.url,
        headers: s.headers,
        enabled_tool_names: s.enabled_tool_names,
      });
      setPreviews((prev) => ({ ...prev, [s.server_id]: { open: true, loading: false, result } }));
    } catch (e) {
      setPreviews((prev) => ({
        ...prev,
        [s.server_id]: { open: true, loading: false, error: errText(e) },
      }));
    }
  };

  const closePreview = (serverId: string) =>
    setPreviews((prev) => {
      const cur = prev[serverId];
      if (!cur) return prev;
      return { ...prev, [serverId]: { ...cur, open: false } };
    });

  const doDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await chatApi.deleteUserMcpServer(deleteTarget.server_id);
      toast.success(`已删除 ${deleteTarget.display_name || deleteTarget.url}`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      toast.error(`删除失败：${errText(e)}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-xs text-fg-faint">
          {servers ? `共 ${servers.length} 个 MCP 服务器` : "加载中…"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw size={13} />}
            loading={loading}
            onClick={() => void load()}
          >
            刷新
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Plus size={13} />}
            onClick={() => setEditor({ target: null })}
          >
            新建服务器
          </Button>
        </div>
      </div>

      {servers === null ? (
        loading ? (
          <div className="flex justify-center py-12">
            <Spinner size={20} />
          </div>
        ) : (
          <EmptyState
            title="MCP 服务器列表加载失败"
            action={
              <Button variant="outline" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        )
      ) : servers.length === 0 ? (
        <EmptyState
          icon={<Server size={32} />}
          title="还没有 MCP 服务器"
          description="新建 MCP 服务器后可先预览连接、查看工具列表，再在对话中使用。"
          action={
            <Button variant="primary" icon={<Plus size={14} />} onClick={() => setEditor({ target: null })}>
              新建服务器
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-faint">
                <th className="px-4 py-2.5 font-medium">名称</th>
                <th className="px-4 py-2.5 font-medium">URL</th>
                <th className="px-4 py-2.5 font-medium">启用</th>
                <th className="px-4 py-2.5 font-medium">工具</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => {
                const pv = previews[s.server_id];
                return (
                  <Fragment key={s.server_id}>
                    <tr className="border-b border-line last:border-0">
                      <td className="px-4 py-3">
                        <span className="font-medium text-fg">{s.display_name || "（未命名）"}</span>
                      </td>
                      <td className="max-w-[240px] px-4 py-3">
                        <div className="truncate font-mono text-xs text-fg-muted" title={s.url}>
                          {s.url}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Switch
                          checked={s.enabled}
                          disabled={toggling === s.server_id}
                          onChange={(v) => void toggleEnabled(s, v)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span title={s.enabled_tool_names.join("、") || undefined}>
                          <Badge tone="gray">{s.enabled_tool_names.length} 个</Badge>
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="xs"
                            variant="ghost"
                            loading={pv?.loading}
                            onClick={() => void runPreview(s)}
                          >
                            预览
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => setEditor({ target: s })}>
                            编辑
                          </Button>
                          <IconButton
                            title="删除"
                            className="hover:text-danger"
                            onClick={() => setDeleteTarget(s)}
                          >
                            <Trash2 size={13} />
                          </IconButton>
                        </div>
                      </td>
                    </tr>
                    {pv?.open && (
                      <tr className="border-b border-line last:border-0">
                        <td colSpan={5} className="bg-bg-sunken px-4 py-3">
                          <PreviewPanel state={pv} onClose={() => closePreview(s.server_id)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}

      {editor && (
        <McpServerModal
          key={editor.target?.server_id ?? "new"}
          initial={editor.target}
          onClose={() => setEditor(null)}
          onSaved={() => void load()}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void doDelete()}
        title="删除 MCP 服务器"
        message={
          deleteTarget && (
            <span>
              确定删除 MCP 服务器「{deleteTarget.display_name || deleteTarget.url}」吗？
            </span>
          )
        }
        confirmText="删除"
        danger
        loading={deleting}
      />
    </div>
  );
}

// ============ 页面 ============
export default function ToolsPage() {
  const [tab, setTab] = useState("builtin");
  const fromSource = useSettingsStore((s) => s.fromSource);
  const userId = useSettingsStore((s) => s.userId);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1100px] px-6 py-6">
        <PageHeader
          title="工具与 MCP"
          description="管理内置工具的开关与配置，以及用户自定义 MCP 服务器。"
        />
        {!fromSource || !userId ? (
          <Card>
            <EmptyState
              icon={<Wrench size={32} />}
              title="尚未配置身份凭据"
              description="请先在设置页填写 X-From-Source 与 X-User-Id，或从 wisepen-local.config.json 配置文件导入。"
              action={
                <Link to="/settings">
                  <Button variant="primary">前往设置</Button>
                </Link>
              }
            />
          </Card>
        ) : (
          <>
            <Tabs
              className="mb-4"
              tabs={[
                { key: "builtin", label: "内置工具" },
                { key: "mcp", label: "MCP 服务器" },
              ]}
              active={tab}
              onChange={setTab}
            />
            {tab === "builtin" ? <BuiltinToolsTab /> : <McpServersTab />}
          </>
        )}
      </div>
    </div>
  );
}
