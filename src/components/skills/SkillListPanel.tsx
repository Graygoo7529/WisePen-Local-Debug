import { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { cn } from "../../lib/cn";
import { Button, EmptyState, Field, Input, Spinner, Textarea } from "../ui";
import { Modal } from "../Modal";
import { skillApi } from "../../api/asset";
import { resourceApi } from "../../api/resource";
import { toast } from "../../stores/toastStore";
import { errText } from "./workspace";
import type { ResourceItem } from "../../lib/types";

/** 左栏：Skill 列表（搜索过滤 / 刷新 / 创建 / 手动按 resourceId 加载）。 */
export function SkillListPanel({
  skills,
  loading,
  selectedId,
  onSelect,
  onReload,
}: {
  skills: ResourceItem[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (resourceId: string) => void;
  onReload: () => Promise<void>;
}) {
  const [keyword, setKeyword] = useState("");
  const [manualId, setManualId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: "", name: "", description: "" });

  const kw = keyword.trim().toLowerCase();
  const filtered = kw
    ? skills.filter(
        (s) =>
          s.resourceName?.toLowerCase().includes(kw) ||
          s.resourceId.toLowerCase().includes(kw),
      )
    : skills;

  const openCreate = () => {
    setForm({ title: "", name: "", description: "" });
    setCreateOpen(true);
  };

  const doCreate = async () => {
    const title = form.title.trim();
    const name = form.name.trim();
    const description = form.description.trim();
    if (!title) {
      toast.error("资源标题不能为空");
      return;
    }
    setCreating(true);
    try {
      await resourceApi.getTagTree();
      const resourceId = await skillApi.createSkill({
        title,
        name: name || title,
        description,
      });
      toast.success("Skill 创建成功");
      setCreateOpen(false);
      await onReload();
      onSelect(resourceId);
    } catch (e) {
      toast.error(`创建失败：${errText(e)}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex w-72 shrink-0 flex-col border-r border-line bg-bg-elev">
      <div className="space-y-2 border-b border-line p-3">
        <Button variant="primary" className="w-full" icon={<Plus size={15} />} onClick={openCreate}>
          创建 Skill
        </Button>
        <div className="flex items-center gap-1.5">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="按名称 / resourceId 过滤"
            spellCheck={false}
          />
          <Button
            size="sm"
            variant="outline"
            icon={<RefreshCw size={13} />}
            loading={loading}
            onClick={() => void onReload()}
            title="刷新列表"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading && skills.length === 0 && (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <EmptyState
            title={skills.length === 0 ? "暂无 Skill" : "没有匹配的 Skill"}
            description={skills.length === 0 ? "点击上方「创建 Skill」新建，或在下方按 resourceId 手动加载" : "换个关键字试试"}
          />
        )}
        <div className="space-y-0.5">
          {filtered.map((s) => {
            const active = s.resourceId === selectedId;
            return (
              <div
                key={s.resourceId}
                onClick={() => onSelect(s.resourceId)}
                className={cn(
                  "cursor-pointer rounded-lg px-2.5 py-2 transition-colors",
                  active ? "bg-accent-soft" : "hover:bg-bg-hover",
                )}
              >
                <div
                  className={cn(
                    "truncate text-[13px] font-medium",
                    active ? "text-accent" : "text-fg",
                  )}
                >
                  {s.resourceName || "（未命名）"}
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-fg-faint">
                  {s.resourceId}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-1.5 border-t border-line p-3">
        <div className="text-xs font-medium text-fg-muted">手动加载</div>
        <div className="flex items-center gap-1.5">
          <Input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="输入 resourceId"
            className="font-mono"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === "Enter" && manualId.trim()) onSelect(manualId.trim());
            }}
          />
          <Button size="sm" variant="outline" disabled={!manualId.trim()} onClick={() => onSelect(manualId.trim())}>
            加载
          </Button>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="创建 Skill"
        width="max-w-md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button variant="primary" loading={creating} onClick={() => void doCreate()}>
              创建
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="资源标题">
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="如：周报写作助手"
              autoFocus
            />
          </Field>
          <Field label="Skill 内部名称（可选）" hint="留空时与资源标题一致">
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="如：weekly-report-writer"
              spellCheck={false}
            />
          </Field>
          <Field label="描述（可选）">
            <Textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="一句话描述该技能的用途与适用场景"
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
