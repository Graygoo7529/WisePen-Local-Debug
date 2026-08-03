import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import {
  FilePlus2,
  FolderOpen,
  GitFork,
  Layers,
  Rocket,
  Trash2,
  Upload,
} from "lucide-react";
import { Badge, Button, Field, IconButton, Input, SectionCard } from "../ui";
import { ConfirmModal, Modal } from "../Modal";
import { skillApi } from "../../api/asset";
import { toast } from "../../stores/toastStore";
import {
  REFERENCE_TEMPLATE,
  SKILL_MD_TEMPLATE,
  TYPE_OPTIONS,
  errText,
  guessAssetType,
  nextKey,
  type WorkspaceEntry,
} from "./workspace";
import type { AssetResourceType, AssetUploadTicket, SkillVersionBundle } from "../../lib/types";

/** 资产工作区：本地编辑条目 → 上传到草稿；支持载入远端结构、发布、Fork、删除远端资产。 */
export function AssetWorkspaceCard({
  resourceId,
  draftVersion,
  entries,
  onEntriesChange,
  ensureBundle,
  onRefreshDraft,
  onAfterPublish,
  onForked,
}: {
  resourceId: string;
  draftVersion: number;
  entries: WorkspaceEntry[];
  onEntriesChange: (entries: WorkspaceEntry[]) => void;
  ensureBundle: (kind: "draft" | "published") => Promise<SkillVersionBundle | null>;
  onRefreshDraft: () => Promise<void>;
  onAfterPublish: () => Promise<void>;
  onForked: (resourceId: string) => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [loadingStructure, setLoadingStructure] = useState<"draft" | "published" | null>(null);
  const [importing, setImporting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkName, setForkName] = useState("");
  const [forkVersion, setForkVersion] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingAssets, setDeletingAssets] = useState(false);

  const patchEntry = (key: string, patch: Partial<WorkspaceEntry>) =>
    onEntriesChange(entries.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  const removeEntry = (key: string) => {
    onEntriesChange(entries.filter((e) => e.key !== key));
    setChecked((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // ---- 载入远端结构 ----
  const loadStructure = async (kind: "draft" | "published") => {
    setLoadingStructure(kind);
    try {
      const bundle = await ensureBundle(kind);
      if (!bundle) return;
      onEntriesChange(
        bundle.assets.map((a) => ({
          key: nextKey(),
          name: a.name,
          path: a.path,
          assetResourceType: a.assetResourceType,
          content: "",
          remote: a.id,
        })),
      );
      setChecked(new Set());
      toast.success(`已载入 ${bundle.assets.length} 个资产结构（内容未拉取，填入后可上传覆盖）`);
    } finally {
      setLoadingStructure(null);
    }
  };

  // ---- 新建条目 ----
  const addSkillMd = () =>
    onEntriesChange([
      ...entries,
      { key: nextKey(), name: "SKILL.md", path: "/", assetResourceType: "MD", content: SKILL_MD_TEMPLATE },
    ]);

  const addReference = () =>
    onEntriesChange([
      ...entries,
      { key: nextKey(), name: "", path: "/references/", assetResourceType: "MD", content: REFERENCE_TEMPLATE },
    ]);

  // ---- 从本地导入 ----
  const importLocal = async () => {
    setImporting(true);
    try {
      const picked = await openDialog({
        title: "选择要导入的文件",
        multiple: false,
        filters: [
          { name: "文本文件", extensions: ["md", "markdown", "txt", "py", "json", "yaml", "yml", "toml"] },
        ],
      });
      if (!picked) return;
      const content = await invoke<string>("read_text_file", { path: picked, maxBytes: null });
      const base = picked.replace(/\\/g, "/").split("/").pop() ?? "file.txt";
      onEntriesChange([
        ...entries,
        { key: nextKey(), name: base, path: "/", assetResourceType: guessAssetType(base), content },
      ]);
      toast.success(`已导入 ${base}`);
    } catch (e) {
      toast.error(`导入失败：${errText(e)}`);
    } finally {
      setImporting(false);
    }
  };

  // ---- 上传资产 ----
  const upload = async () => {
    const targets = entries.filter((e) => e.content.trim().length > 0);
    if (targets.length === 0) {
      toast.info("没有需要上传的资产（所有条目内容均为空）");
      return;
    }
    for (const e of targets) {
      if (!e.name.trim() || !e.path.trim()) {
        toast.error("存在未填写名称或路径的资产，请补全后再上传");
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
      for (const e of targets) {
        const md5 = await invoke<string>("text_md5", { content: e.content });
        const expectedSize = new TextEncoder().encode(e.content).length;
        assets.push({
          name: e.name.trim(),
          path: e.path.trim(),
          assetResourceType: e.assetResourceType,
          md5,
          expectedSize,
        });
      }
      const resp = await skillApi.initUploadSkillAssets({ resourceId, draftVersion, assets });
      for (const ticket of resp.assetUploadTickets) {
        if (ticket.flashUploaded) continue;
        const entry = matchEntry(targets, ticket);
        if (!entry) {
          throw new Error(`上传票据 ${ticket.path}${ticket.name} 无法匹配工作区条目`);
        }
        await invoke("oss_put_text", {
          putUrl: ticket.putUrl,
          callbackHeader: ticket.callbackHeader || null,
          content: entry.content,
        });
      }
      toast.success(`已上传 ${targets.length} 个资产到草稿 v${draftVersion}`);
      await onRefreshDraft();
    } catch (e) {
      toast.error(`上传失败：${errText(e)}`);
    } finally {
      setUploading(false);
    }
  };

  // ---- 发布 ----
  const publish = async () => {
    setPublishing(true);
    try {
      await skillApi.publishSkillVersion(resourceId);
      toast.success("发布成功");
      setPublishOpen(false);
      await onAfterPublish();
    } catch (e) {
      toast.error(`发布失败：${errText(e)}`);
    } finally {
      setPublishing(false);
    }
  };

  // ---- Fork ----
  const fork = async () => {
    const name = forkName.trim();
    if (!name) {
      toast.error("请填写 Fork 后的资源名称");
      return;
    }
    const vText = forkVersion.trim();
    const version = vText ? parseInt(vText, 10) : undefined;
    if (version !== undefined && (Number.isNaN(version) || version < 1)) {
      toast.error("Fork 版本号必须是正整数");
      return;
    }
    setForking(true);
    try {
      const newId = await skillApi.forkSkill({
        resourceId,
        forkedResourceName: name,
        ...(version !== undefined ? { forkedResourceVersion: version } : {}),
      });
      toast.success("Fork 成功");
      setForkOpen(false);
      setForkName("");
      setForkVersion("");
      onForked(newId);
    } catch (e) {
      toast.error(`Fork 失败：${errText(e)}`);
    } finally {
      setForking(false);
    }
  };

  // ---- 删除远端资产 ----
  const checkedRemote = entries.filter((e) => e.remote && checked.has(e.key));
  const deleteRemote = async () => {
    const assetIds = checkedRemote.map((e) => e.remote!);
    if (assetIds.length === 0) return;
    setDeletingAssets(true);
    try {
      await skillApi.deleteSkillAssets(resourceId, draftVersion, assetIds);
      toast.success(`已删除 ${assetIds.length} 个远端资产`);
      setDeleteOpen(false);
      setChecked(new Set());
      onEntriesChange(
        entries.map((e) => (checked.has(e.key) ? { ...e, remote: undefined } : e)),
      );
      await onRefreshDraft();
    } catch (e) {
      toast.error(`删除远端资产失败：${errText(e)}`);
    } finally {
      setDeletingAssets(false);
    }
  };

  return (
    <SectionCard
      title="资产工作区"
      description={`本地编辑后上传到草稿 v${draftVersion}；内容留空的条目不会被上传。`}
      actions={
        <>
          <Button
            size="sm"
            variant="outline"
            icon={<GitFork size={13} />}
            onClick={() => {
              setForkName("");
              setForkVersion("");
              setForkOpen(true);
            }}
          >
            Fork
          </Button>
          <Button
            size="sm"
            variant="outline"
            icon={<Rocket size={13} />}
            onClick={() => setPublishOpen(true)}
          >
            发布当前草稿
          </Button>
          <Button
            size="sm"
            variant="primary"
            icon={<Upload size={13} />}
            loading={uploading}
            onClick={() => void upload()}
          >
            上传资产
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {/* 工具栏 */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="xs"
            variant="outline"
            icon={<Layers size={12} />}
            loading={loadingStructure === "draft"}
            onClick={() => void loadStructure("draft")}
          >
            从草稿载入结构
          </Button>
          <Button
            size="xs"
            variant="outline"
            icon={<Layers size={12} />}
            loading={loadingStructure === "published"}
            onClick={() => void loadStructure("published")}
          >
            从已发布载入结构
          </Button>
          <Button size="xs" variant="outline" icon={<FilePlus2 size={12} />} onClick={addSkillMd}>
            新建 SKILL.md
          </Button>
          <Button size="xs" variant="outline" icon={<FilePlus2 size={12} />} onClick={addReference}>
            新建 references 文件
          </Button>
          <Button
            size="xs"
            variant="outline"
            icon={<FolderOpen size={12} />}
            loading={importing}
            onClick={() => void importLocal()}
          >
            从本地导入
          </Button>
          {checkedRemote.length > 0 && (
            <Button
              size="xs"
              variant="danger"
              icon={<Trash2 size={12} />}
              className="ml-auto"
              onClick={() => setDeleteOpen(true)}
            >
              删除所选远端资产（{checkedRemote.length}）
            </Button>
          )}
        </div>

        {/* 条目列表 */}
        {entries.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs leading-5 text-fg-faint">
            工作区为空。可「载入结构」从远端版本开始，或新建 / 导入文件；
            <br />
            每个 Skill 至少需要一个 /SKILL.md。
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => (
              <div key={e.key} className="overflow-hidden rounded-lg border border-line">
                <div className="flex items-center gap-2 border-b border-line bg-bg-sunken px-2.5 py-1.5">
                  {e.remote && (
                    <input
                      type="checkbox"
                      title="勾选后可批量删除远端资产"
                      className="h-3.5 w-3.5 shrink-0 cursor-pointer accent-accent"
                      checked={checked.has(e.key)}
                      onChange={(ev) =>
                        setChecked((prev) => {
                          const next = new Set(prev);
                          if (ev.target.checked) next.add(e.key);
                          else next.delete(e.key);
                          return next;
                        })
                      }
                    />
                  )}
                  <input
                    value={e.name}
                    onChange={(ev) => patchEntry(e.key, { name: ev.target.value })}
                    placeholder="文件名，如 SKILL.md"
                    spellCheck={false}
                    className="h-7 min-w-0 flex-1 rounded-md border border-line bg-bg-elev px-2 font-mono text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                  />
                  <input
                    value={e.path}
                    onChange={(ev) => patchEntry(e.key, { path: ev.target.value })}
                    placeholder="/"
                    title="远端目录路径"
                    spellCheck={false}
                    className="h-7 w-32 shrink-0 rounded-md border border-line bg-bg-elev px-2 font-mono text-xs text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none"
                  />
                  <select
                    value={e.assetResourceType}
                    onChange={(ev) =>
                      patchEntry(e.key, {
                        assetResourceType: ev.target.value as WorkspaceEntry["assetResourceType"],
                      })
                    }
                    className="h-7 w-32 shrink-0 cursor-pointer rounded-md border border-line bg-bg-elev px-1.5 text-xs text-fg focus:border-accent focus:outline-none"
                  >
                    {TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  {e.remote && <Badge tone="blue">远端</Badge>}
                  <IconButton title="删除该条目" className="hover:text-danger" onClick={() => removeEntry(e.key)}>
                    <Trash2 size={13} />
                  </IconButton>
                </div>
                <div className="p-2.5">
                  <textarea
                    value={e.content}
                    onChange={(ev) => patchEntry(e.key, { content: ev.target.value })}
                    placeholder={
                      e.remote
                        ? "（远端结构条目：内容未拉取；填入内容后可上传覆盖远端文件）"
                        : "在此编写文件内容"
                    }
                    spellCheck={false}
                    rows={7}
                    className="w-full resize-y rounded-lg border border-line bg-bg-elev px-3 py-2 font-mono text-xs leading-relaxed text-fg placeholder:text-fg-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        title="发布当前草稿"
        message={`确定将草稿 v${draftVersion} 发布为新版本吗？发布后已上传的资产将生效。`}
        confirmText="发布"
        loading={publishing}
        onConfirm={() => void publish()}
      />

      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="删除远端资产"
        message={`确定从草稿 v${draftVersion} 删除勾选的 ${checkedRemote.length} 个远端资产吗？此操作不可撤销。`}
        confirmText="删除"
        danger
        loading={deletingAssets}
        onConfirm={() => void deleteRemote()}
      />

      <Modal
        open={forkOpen}
        onClose={() => setForkOpen(false)}
        title="Fork Skill"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setForkOpen(false)}>取消</Button>
            <Button variant="primary" loading={forking} onClick={() => void fork()}>
              Fork
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="新资源名称" hint="必填，Fork 生成的 Skill 名称">
            <Input
              value={forkName}
              onChange={(e) => setForkName(e.target.value)}
              placeholder="如：weekly-report-writer-copy"
              autoFocus
              spellCheck={false}
            />
          </Field>
          <Field label="源版本号" hint="可选；留空则 Fork 最新版本">
            <Input
              type="number"
              min={1}
              value={forkVersion}
              onChange={(e) => setForkVersion(e.target.value)}
              placeholder="留空 = 最新版本"
            />
          </Field>
        </div>
      </Modal>
    </SectionCard>
  );
}

/** 按 name+path 匹配上传票据对应的工作区条目。 */
function matchEntry(targets: WorkspaceEntry[], ticket: AssetUploadTicket): WorkspaceEntry | undefined {
  return targets.find((e) => e.name.trim() === ticket.name && e.path.trim() === ticket.path);
}
