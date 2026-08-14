import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FilePlus2, FolderOpen, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { agentApi } from "../../api/asset";
import { validateAssetLocation } from "../../lib/assetPath";
import { formatBytes } from "../../lib/format";
import type { AgentVersionBundle, AssetInfo, AssetResourceType } from "../../lib/types";
import { toast } from "../../stores/toastStore";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  IconButton,
  Input,
  SectionCard,
  Select,
  Spinner,
  Textarea,
} from "../ui";
import { ConfirmModal, Modal } from "../Modal";

const TYPE_OPTIONS: AssetResourceType[] = ["MD", "PYTHON_SCRIPT", "TEXT", "JSON", "YAML", "TOML"];

interface AssetDraft {
  mode: "create" | "edit";
  name: string;
  path: string;
  assetResourceType: AssetResourceType;
  content: string;
}

function guessType(fileName: string): AssetResourceType {
  const ext = fileName.includes(".") ? (fileName.split(".").pop() ?? "").toLowerCase() : "";
  if (ext === "md") return "MD";
  if (ext === "py") return "PYTHON_SCRIPT";
  if (ext === "json") return "JSON";
  if (ext === "yaml" || ext === "yml") return "YAML";
  if (ext === "toml") return "TOML";
  return "TEXT";
}

/** 资产 Tab：草稿版本工作区文件的新建 / 导入 / 编辑（覆盖上传）/ 删除。 */
export function AgentAssetsTab({
  resourceId,
  draftVersion,
  bundle,
  loading,
  editable,
  onReload,
}: {
  resourceId: string;
  draftVersion: number;
  bundle: AgentVersionBundle | null;
  loading: boolean;
  editable: boolean;
  onReload: () => void;
}) {
  const [draft, setDraft] = useState<AssetDraft | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState<AssetInfo | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const upload = async () => {
    if (!draft) return;
    const locationError = validateAssetLocation(draft.path.trim(), draft.name.trim());
    if (locationError) {
      toast.error(locationError);
      return;
    }
    setUploading(true);
    try {
      const md5 = await invoke<string>("text_md5", { content: draft.content });
      const expectedSize = new TextEncoder().encode(draft.content).length;
      const resp = await agentApi.initUploadAgentAssets({
        resourceId,
        draftVersion,
        assets: [
          {
            name: draft.name.trim(),
            path: draft.path.trim(),
            assetResourceType: draft.assetResourceType,
            md5,
            expectedSize,
          },
        ],
      });
      for (const t of resp.assetUploadTickets) {
        if (!t.flashUploaded) {
          await invoke("oss_put_text", {
            putUrl: t.putUrl,
            callbackHeader: t.callbackHeader,
            content: draft.content,
          });
        }
      }
      toast.success(draft.mode === "edit" ? "资产内容已更新" : "资产已上传");
      setDraft(null);
      onReload();
    } catch (e) {
      toast.error(`上传失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setUploading(false);
    }
  };

  const importFile = async () => {
    try {
      const picked = await openDialog({ title: "选择要导入的文件", multiple: false });
      if (!picked) return;
      const content = await invoke<string>("read_text_file", { path: picked, maxBytes: null });
      const base = picked.split(/[\\/]/).pop() ?? "asset.md";
      setDraft({
        mode: "create",
        name: base,
        path: `/${base}`,
        assetResourceType: guessType(base),
        content,
      });
    } catch (e) {
      toast.error(`读取文件失败：${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await agentApi.deleteAgentAssets(resourceId, draftVersion, [deleting.id]);
      toast.success(`已删除资产「${deleting.name}」`);
      setDeleting(null);
      onReload();
    } catch (e) {
      toast.error(`删除失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading && !bundle) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={20} />
      </div>
    );
  }
  if (!bundle) {
    return (
      <EmptyState
        title="未加载到版本包"
        description="无法读取当前选择的版本。"
        action={<Button onClick={onReload}>重试</Button>}
      />
    );
  }

  const assets = bundle.assets;

  return (
    <>
      <SectionCard
        title={`资产 · v${bundle.version}（${assets.length}）`}
        description={editable ? "草稿资产" : "已发布版本快照（只读）"}
        actions={
          <>
            {editable && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  icon={<FolderOpen size={14} />}
                  onClick={() => void importFile()}
                >
                  导入文件
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  icon={<FilePlus2 size={14} />}
                  onClick={() =>
                    setDraft({ mode: "create", name: "", path: "/", assetResourceType: "MD", content: "" })
                  }
                >
                  新建资产
                </Button>
              </>
            )}
            <IconButton title="刷新" onClick={onReload}>
              <RefreshCw size={14} />
            </IconButton>
          </>
        }
      >
        {assets.length === 0 ? (
          <EmptyState
            title="暂无资产"
            description={editable ? "可新建或导入草稿资产" : "该版本没有附加资产"}
          />
        ) : (
          <div className="divide-y divide-line rounded-lg border border-line">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13px] font-medium text-fg">{a.name}</span>
                    <Badge tone="gray">{a.assetResourceType}</Badge>
                    <Badge tone={a.uploadStatus === "AVAILABLE" ? "green" : "yellow"}>
                      {a.uploadStatus === "AVAILABLE" ? "已上传" : "上传中"}
                    </Badge>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">
                    {a.path} · {formatBytes(a.size)}
                  </div>
                </div>
                {editable && (
                  <>
                    <IconButton
                      title="编辑（重新上传内容）"
                      onClick={() =>
                        setDraft({
                          mode: "edit",
                          name: a.name,
                          path: a.path,
                          assetResourceType: a.assetResourceType,
                          content: "",
                        })
                      }
                    >
                      <Pencil size={13} />
                    </IconButton>
                    <IconButton title="删除" className="hover:text-danger" onClick={() => setDeleting(a)}>
                      <Trash2 size={13} />
                    </IconButton>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Modal
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.mode === "edit" ? `编辑资产：${draft.name}` : "新建资产"}
        footer={
          <>
            <Button onClick={() => setDraft(null)}>取消</Button>
            <Button variant="primary" loading={uploading} onClick={() => void upload()}>
              上传
            </Button>
          </>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="名称">
                <Input
                  value={draft.name}
                  disabled={draft.mode === "edit"}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </Field>
              <Field label="类型">
                <Select
                  value={draft.assetResourceType}
                  disabled={draft.mode === "edit"}
                  onChange={(e) =>
                    setDraft({ ...draft, assetResourceType: e.target.value as AssetResourceType })
                  }
                  options={TYPE_OPTIONS.map((t) => ({ value: t, label: t }))}
                />
              </Field>
            </div>
            <Field label="目录路径" hint="例如 / 或 /prompts；文件名在上方单独填写">
              <Input
                value={draft.path}
                disabled={draft.mode === "edit"}
                className="font-mono text-xs"
                onChange={(e) => setDraft({ ...draft, path: e.target.value })}
              />
            </Field>
            <Field
              label="内容"
              hint={
                draft.mode === "edit"
                  ? "后端未提供资产内容下载端点，请粘贴完整新内容，上传后整体覆盖原文件"
                  : undefined
              }
            >
              <Textarea
                value={draft.content}
                rows={12}
                className="font-mono text-xs"
                spellCheck={false}
                onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="删除资产"
        message={`确定从草稿 v${draftVersion} 删除资产「${deleting?.name}」（${deleting?.path}）吗？`}
        confirmText="删除"
        danger
        loading={deleteLoading}
        onConfirm={() => void remove()}
      />
    </>
  );
}
