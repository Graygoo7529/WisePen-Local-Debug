import { useEffect, useState } from "react";
import { Badge, Button, CopyButton, Field, Input, SectionCard } from "../ui";
import { skillApi } from "../../api/asset";
import { toast } from "../../stores/toastStore";
import { errText } from "./workspace";
import type { SkillResourceInfoResponse } from "../../lib/types";

/** 信息卡：resourceInfo / skillInfo 展示，名称与描述可编辑保存。 */
export function SkillInfoCard({
  info,
  onSaved,
}: {
  info: SkillResourceInfoResponse;
  onSaved: () => Promise<void>;
}) {
  const { resourceInfo, skillInfo } = info;
  const [name, setName] = useState(skillInfo.name);
  const [description, setDescription] = useState(skillInfo.description);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(info.skillInfo.name);
    setDescription(info.skillInfo.description);
  }, [info]);

  const dirty = name !== skillInfo.name || description !== skillInfo.description;

  const save = async () => {
    if (!name.trim()) {
      toast.error("名称不能为空");
      return;
    }
    setSaving(true);
    try {
      await skillApi.changeSkillInfo({
        resourceId: resourceInfo.resourceId,
        name: name.trim(),
        description,
      });
      toast.success("已保存 Skill 信息");
      await onSaved();
    } catch (e) {
      toast.error(`保存失败：${errText(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Skill 信息"
      actions={
        <Button
          size="sm"
          variant="primary"
          loading={saving}
          disabled={!dirty}
          onClick={() => void save()}
        >
          保存
        </Button>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="text-fg-faint">resourceId</span>
          <code className="rounded bg-code-bg px-1.5 py-0.5 font-mono text-[11px] text-fg-muted">
            {resourceInfo.resourceId}
          </code>
          <CopyButton text={resourceInfo.resourceId} />
          <Badge tone="accent">已发布 v{skillInfo.version}</Badge>
          <Badge tone={skillInfo.sourceType === "BY_AGENT" ? "blue" : "gray"}>
            {skillInfo.sourceType === "BY_AGENT" ? "Agent 生成" : "手动创建"}
          </Badge>
          <span className="text-fg-faint">资源标题：{resourceInfo.resourceName || "-"}</span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} />
          </Field>
          <Field label="描述" className="md:col-span-1">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </div>
    </SectionCard>
  );
}
