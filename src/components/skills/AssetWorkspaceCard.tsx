import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Eye, FilePlus2, FolderOpen, Layers, Pencil, RefreshCw, Trash2, Upload } from "lucide-react";
import { skillApi } from "../../api/asset";
import { storageApi } from "../../api/storage";
import { validateAssetLocation } from "../../lib/assetPath";
import { formatBytes } from "../../lib/format";
import type { AssetInfo, AssetResourceType, AssetUploadTicket, SkillVersionBundle } from "../../lib/types";
import { toast } from "../../stores/toastStore";
import { ConfirmModal, Modal } from "../Modal";
import { Badge, Button, EmptyState, IconButton, SectionCard, Spinner, Textarea } from "../ui";
import {
  REFERENCE_TEMPLATE,
  SKILL_MD_TEMPLATE,
  TYPE_OPTIONS,
  errText,
  guessAssetType,
  nextKey,
  type WorkspaceEntry,
} from "./workspace";

export function AssetWorkspaceCard({
  resourceId,
  draftVersion,
  bundle,
  loading,
  editable,
  entries,
  onEntriesChange,
  onRefresh,
}: {
  resourceId: string;
  draftVersion: number;
  bundle: SkillVersionBundle | null;
  loading: boolean;
  editable: boolean;
  entries: WorkspaceEntry[];
  onEntriesChange: (entries: WorkspaceEntry[]) => void;
  onRefresh: () => void;
}) {
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [loadingAssetId, setLoadingAssetId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ asset: AssetInfo; content: string } | null>(null);

  useEffect(() => {
    setSelectedAssetIds(new Set());
  }, [bundle]);

  const patchEntry = (key: string, patch: Partial<WorkspaceEntry>) =>
    onEntriesChange(entries.map((entry) => (entry.key === key ? { ...entry, ...patch } : entry)));

  const loadStructure = async () => {
    if (!bundle) return;
    setLoadingStructure(true);
    try {
      const nextEntries = await Promise.all(
        bundle.assets.map(async (asset) => ({
          key: nextKey(),
          name: asset.name,
          path: asset.path,
          assetResourceType: asset.assetResourceType,
          content: await storageApi.loadText(asset.objectKey),
          remote: asset.id,
        })),
      );
      onEntriesChange(nextEntries);
      toast.success(`已载入 ${bundle.assets.length} 个远端文件及正文`);
    } catch (error) {
      toast.error(`载入远端文件失败：${errText(error)}`);
    } finally {
      setLoadingStructure(false);
    }
  };

  const loadRemoteAsset = async (asset: AssetInfo, mode: "view" | "edit") => {
    setLoadingAssetId(asset.id);
    try {
      const content = await storageApi.loadText(asset.objectKey);
      if (mode === "view") {
        setPreview({ asset, content });
        return;
      }
      const nextEntry: WorkspaceEntry = {
        key: nextKey(),
        name: asset.name,
        path: asset.path,
        assetResourceType: asset.assetResourceType,
        content,
        remote: asset.id,
      };
      const existing = entries.find((entry) => entry.remote === asset.id);
      onEntriesChange(
        existing
          ? entries.map((entry) =>
              entry.remote === asset.id ? { ...entry, ...nextEntry, key: entry.key } : entry,
            )
          : [...entries, nextEntry],
      );
      toast.success(`已将 ${asset.name} 载入本地工作区`);
    } catch (error) {
      toast.error(`读取远端文件失败：${errText(error)}`);
    } finally {
      setLoadingAssetId(null);
    }
  };

  const addSkillMd = () =>
    onEntriesChange([
      ...entries,
      {
        key: nextKey(),
        name: "SKILL.md",
        path: "/",
        assetResourceType: "MD",
        content: SKILL_MD_TEMPLATE,
      },
    ]);

  const addReference = () =>
    onEntriesChange([
      ...entries,
      {
        key: nextKey(),
        name: "reference.md",
        path: "/references",
        assetResourceType: "MD",
        content: REFERENCE_TEMPLATE,
      },
    ]);

  const importLocal = async () => {
    setImporting(true);
    try {
      const picked = await openDialog({
        title: "选择要导入的文件",
        multiple: false,
        filters: [
          {
            name: "文本文件",
            extensions: ["md", "markdown", "txt", "py", "json", "yaml", "yml", "toml"],
          },
        ],
      });
      if (!picked) return;
      const content = await invoke<string>("read_text_file", { path: picked, maxBytes: null });
      const base = picked.replace(/\\/g, "/").split("/").pop() ?? "file.txt";
      onEntriesChange([
        ...entries,
        {
          key: nextKey(),
          name: base,
          path: "/",
          assetResourceType: guessAssetType(base),
          content,
        },
      ]);
      toast.success(`已导入 ${base}`);
    } catch (error) {
      toast.error(`导入失败：${errText(error)}`);
    } finally {
      setImporting(false);
    }
  };

  const upload = async () => {
    const targets = entries.filter((entry) => entry.content.length > 0);
    if (targets.length === 0) {
      toast.info("没有需要上传的文件内容");
      return;
    }
    for (const entry of targets) {
      const locationError = validateAssetLocation(entry.path.trim(), entry.name.trim());
      if (locationError) {
        toast.error(`${entry.name || "未命名文件"}：${locationError}`);
        return;
      }
    }
    setUploading(true);
    try {
      const assets: Array<{
        name: string;
        path: string;
        assetResourceType: AssetResourceType;
        md5: string;
        expectedSize: number;
      }> = [];
      for (const entry of targets) {
        assets.push({
          name: entry.name.trim(),
          path: entry.path.trim(),
          assetResourceType: entry.assetResourceType,
          md5: await invoke<string>("text_md5", { content: entry.content }),
          expectedSize: new TextEncoder().encode(entry.content).length,
        });
      }
      const response = await skillApi.initUploadSkillAssets({ resourceId, draftVersion, assets });
      for (const ticket of response.assetUploadTickets) {
        if (ticket.flashUploaded) continue;
        const entry = matchEntry(targets, ticket);
        if (!entry) throw new Error(`上传票据 ${ticket.path}/${ticket.name} 无法匹配文件`);
        await invoke("oss_put_text", {
          putUrl: ticket.putUrl,
          callbackHeader: ticket.callbackHeader || null,
          content: entry.content,
        });
      }
      toast.success(`已上传 ${targets.length} 个文件到草稿 v${draftVersion}`);
      onRefresh();
    } catch (error) {
      toast.error(`上传失败：${errText(error)}`);
    } finally {
      setUploading(false);
    }
  };

  const deleteRemote = async () => {
    if (selectedAssetIds.size === 0) return;
    setDeletingAssets(true);
    try {
      await skillApi.deleteSkillAssets(resourceId, draftVersion, [...selectedAssetIds]);
      toast.success(`已删除 ${selectedAssetIds.size} 个草稿文件`);
      setDeleteOpen(false);
      onRefresh();
    } catch (error) {
      toast.error(`删除失败：${errText(error)}`);
    } finally {
      setDeletingAssets(false);
    }
  };

  if (loading && !bundle) {
    return <div className="flex justify-center py-16"><Spinner size={20} /></div>;
  }
  if (!bundle) {
    return <EmptyState title="版本文件加载失败" action={<Button onClick={onRefresh}>重新加载</Button>} />;
  }

  return (
    <>
      <SectionCard
        title={`文件 · v${bundle.version}`}
        description={editable ? "草稿文件" : "已发布版本快照（只读）"}
        actions={
          <>
            <IconButton title="刷新版本" onClick={onRefresh}><RefreshCw size={14} /></IconButton>
            {editable && (
              <Button
                size="sm"
                variant="primary"
                icon={<Upload size={14} />}
                loading={uploading}
                onClick={() => void upload()}
              >
                上传工作区
              </Button>
            )}
          </>
        }
        bodyClassName="p-0"
      >
        <div className="border-b border-line">
          <div className="flex min-h-11 items-center gap-2 px-4 py-2">
            <span className="text-[13px] font-medium text-fg">远端文件</span>
            <Badge tone="gray">{bundle.assets.length}</Badge>
            {editable && selectedAssetIds.size > 0 && (
              <Button
                size="xs"
                variant="danger"
                icon={<Trash2 size={12} />}
                className="ml-auto"
                onClick={() => setDeleteOpen(true)}
              >
                删除所选（{selectedAssetIds.size}）
              </Button>
            )}
          </div>
          {bundle.assets.length === 0 ? (
            <EmptyState title="该版本暂无文件" className="min-h-[120px]" />
          ) : (
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[680px] text-xs">
                <thead className="bg-bg-sunken text-left text-fg-faint">
                  <tr>
                    {editable && <th className="w-10 px-4 py-2 font-medium" />}
                    <th className="px-3 py-2 font-medium">文件</th>
                    <th className="px-3 py-2 font-medium">类型</th>
                    <th className="px-3 py-2 font-medium">大小</th>
                    <th className="px-3 py-2 font-medium">状态</th>
                    <th className="w-20 px-3 py-2 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {bundle.assets.map((asset) => (
                    <tr key={asset.id}>
                      {editable && (
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            aria-label={`选择 ${asset.name}`}
                            className="h-3.5 w-3.5 cursor-pointer accent-accent"
                            checked={selectedAssetIds.has(asset.id)}
                            onChange={(event) =>
                              setSelectedAssetIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked) next.add(asset.id);
                                else next.delete(asset.id);
                                return next;
                              })
                            }
                          />
                        </td>
                      )}
                      <td className="px-3 py-2 font-mono text-[11px] text-fg">
                        {asset.path === "/" ? "/" : `${asset.path}/`}{asset.name}
                      </td>
                      <td className="px-3 py-2"><Badge>{asset.assetResourceType}</Badge></td>
                      <td className="px-3 py-2 text-fg-muted">{formatBytes(asset.size)}</td>
                      <td className="px-3 py-2">
                        <Badge tone={asset.uploadStatus === "AVAILABLE" ? "green" : "yellow"}>
                          {asset.uploadStatus === "AVAILABLE" ? "可用" : "上传中"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <IconButton
                            title="查看内容"
                            disabled={asset.uploadStatus !== "AVAILABLE" || loadingAssetId === asset.id}
                            onClick={() => void loadRemoteAsset(asset, "view")}
                          >
                            <Eye size={13} />
                          </IconButton>
                          {editable && (
                            <IconButton
                              title="载入工作区编辑"
                              disabled={asset.uploadStatus !== "AVAILABLE" || loadingAssetId === asset.id}
                              onClick={() => void loadRemoteAsset(asset, "edit")}
                            >
                              <Pencil size={13} />
                            </IconButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {editable && (
          <div>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2">
              <span className="mr-1 text-[13px] font-medium text-fg">本地工作区</span>
              <Button
                size="xs"
                variant="outline"
                icon={<Layers size={12} />}
                loading={loadingStructure}
                onClick={() => void loadStructure()}
              >
                载入远端内容
              </Button>
              <Button size="xs" variant="outline" icon={<FilePlus2 size={12} />} onClick={addSkillMd}>
                新建 SKILL.md
              </Button>
              <Button size="xs" variant="outline" icon={<FilePlus2 size={12} />} onClick={addReference}>
                新建参考文件
              </Button>
              <Button
                size="xs"
                variant="outline"
                icon={<FolderOpen size={12} />}
                loading={importing}
                onClick={() => void importLocal()}
              >
                导入文件
              </Button>
            </div>
            <div className="space-y-3 p-4">
              {entries.length === 0 ? (
                <EmptyState title="本地工作区为空" className="min-h-[120px]" />
              ) : (
                entries.map((entry) => (
                  <div key={entry.key} className="overflow-hidden rounded-lg border border-line">
                    <div className="flex items-center gap-2 border-b border-line bg-bg-sunken px-2.5 py-1.5">
                      <input
                        value={entry.name}
                        placeholder="文件名"
                        spellCheck={false}
                        className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg-elev px-2 font-mono text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                        onChange={(event) => patchEntry(entry.key, { name: event.target.value })}
                      />
                      <input
                        value={entry.path}
                        placeholder="目录，如 / 或 /references"
                        title="远端目录路径"
                        spellCheck={false}
                        className="h-7 w-48 shrink-0 rounded-md border border-line bg-bg-elev px-2 font-mono text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                        onChange={(event) => patchEntry(entry.key, { path: event.target.value })}
                      />
                      <select
                        value={entry.assetResourceType}
                        className="h-7 w-32 shrink-0 cursor-pointer rounded-md border border-line bg-bg-elev px-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                        onChange={(event) =>
                          patchEntry(entry.key, {
                            assetResourceType: event.target.value as WorkspaceEntry["assetResourceType"],
                          })
                        }
                      >
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      {entry.remote && <Badge tone="blue">远端结构</Badge>}
                      <IconButton
                        title="移除工作区条目"
                        className="hover:text-danger"
                        onClick={() => onEntriesChange(entries.filter((item) => item.key !== entry.key))}
                      >
                        <Trash2 size={13} />
                      </IconButton>
                    </div>
                    <textarea
                      value={entry.content}
                      placeholder="文件内容"
                      spellCheck={false}
                      rows={8}
                      className="w-full resize-y border-0 bg-bg-elev px-3 py-2 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-faint focus:outline-none"
                      onChange={(event) => patchEntry(entry.key, { content: event.target.value })}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </SectionCard>

      <Modal
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview ? `${preview.asset.path}/${preview.asset.name}`.replace(/\/+/g, "/") : "文件内容"}
        width="max-w-4xl"
        footer={<Button onClick={() => setPreview(null)}>关闭</Button>}
      >
        <Textarea
          value={preview?.content ?? ""}
          readOnly
          rows={24}
          className="font-mono text-xs"
          spellCheck={false}
        />
      </Modal>

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除草稿文件"
        message={`确定从草稿 v${draftVersion} 删除所选 ${selectedAssetIds.size} 个文件吗？`}
        confirmText="删除"
        danger
        loading={deletingAssets}
        onConfirm={() => void deleteRemote()}
      />
    </>
  );
}

function matchEntry(targets: WorkspaceEntry[], ticket: AssetUploadTicket): WorkspaceEntry | undefined {
  return targets.find((entry) => entry.name.trim() === ticket.name && entry.path.trim() === ticket.path);
}
