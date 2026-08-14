import { useEffect, useState } from "react";
import { agentApi } from "../../api/asset";
import { resourceApi } from "../../api/resource";
import type { AgentResourceInfoResponse } from "../../lib/types";
import { toast } from "../../stores/toastStore";
import { Badge, Button, CopyButton, Field, Input, SectionCard, Textarea } from "../ui";

/** 基本信息 Tab：getAgentInfo 展示 + name/description 编辑保存。 */
export function AgentInfoTab({
  info,
  onSaved,
}: {
  info: AgentResourceInfoResponse;
  onSaved: () => void;
}) {
  const [name, setName] = useState(info.agentInfo.name);
  const [resourceName, setResourceName] = useState(info.resourceInfo.resourceName);
  const [description, setDescription] = useState(info.agentInfo.description);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(info.agentInfo.name);
    setResourceName(info.resourceInfo.resourceName);
    setDescription(info.agentInfo.description);
  }, [info]);

  const dirty =
    name !== info.agentInfo.name ||
    resourceName !== info.resourceInfo.resourceName ||
    description !== info.agentInfo.description;

  const save = async () => {
    if (!resourceName.trim()) {
      toast.error("资源标题不能为空");
      return;
    }
    setSaving(true);
    try {
      if (resourceName !== info.resourceInfo.resourceName) {
        await resourceApi.renameResource(info.resourceInfo.resourceId, resourceName.trim());
      }
      if (name !== info.agentInfo.name || description !== info.agentInfo.description) {
        await agentApi.changeAgentInfo({
          resourceId: info.resourceInfo.resourceId,
          name: name.trim(),
          description,
        });
      }
      toast.success("基本信息已保存");
      onSaved();
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="基本信息"
        actions={
          <Button
            size="sm"
            variant="primary"
            disabled={!dirty}
            loading={saving}
            onClick={() => void save()}
          >
            保存修改
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="资源标题">
            <Input value={resourceName} onChange={(e) => setResourceName(e.target.value)} />
          </Field>
          <Field label="Agent 内部名称">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="资源 ID" className="md:col-span-2">
            <div className="flex items-center gap-1">
              <Input
                value={info.resourceInfo.resourceId}
                readOnly
                className="font-mono text-xs"
              />
              <CopyButton text={info.resourceInfo.resourceId} />
            </div>
          </Field>
          <Field label="描述" className="md:col-span-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="版本与来源">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-fg-muted">
          <span>当前已发布版本</span>
          <Badge tone="accent">v{info.agentInfo.version}</Badge>
          <span>来源</span>
          <Badge tone={info.agentInfo.sourceType === "MANUAL" ? "gray" : "blue"}>
            {info.agentInfo.sourceType}
          </Badge>
          <span>Owner</span>
          <span className="font-mono text-xs">{info.resourceInfo.ownerId}</span>
        </div>
      </SectionCard>
    </div>
  );
}
