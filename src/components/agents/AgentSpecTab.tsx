import { useEffect, useState } from "react";
import { agentApi } from "../../api/asset";
import { prettyJson } from "../../lib/format";
import type { AgentSpec, AgentVersionBundle } from "../../lib/types";
import { toast } from "../../stores/toastStore";
import { Badge, Button, EmptyState, SectionCard, Spinner, Textarea } from "../ui";
import { JsonView } from "../JsonView";

/** Spec 编辑 Tab：systemPrompt 大文本框与整体 JSON 编辑器双向同步。 */
export function AgentSpecTab({
  resourceId,
  draftVersion,
  bundle,
  loading,
  viewing,
  onSaved,
}: {
  resourceId: string;
  draftVersion: number;
  bundle: AgentVersionBundle | null;
  loading: boolean;
  viewing: "draft" | "published";
  onSaved: () => void;
}) {
  const [spec, setSpec] = useState<AgentSpec | null>(bundle?.spec ?? null);
  const [specText, setSpecText] = useState(bundle ? prettyJson(bundle.spec) : "");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setSpec(bundle?.spec ?? null);
    setSpecText(bundle ? prettyJson(bundle.spec) : "");
    setJsonError(null);
  }, [bundle]);

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
        description={`草稿 v${draftVersion} 可能尚未创建；首次保存 Spec 或上传资产后会生成草稿。可点击顶部「查草稿」重试。`}
      />
    );
  }

  const onPromptChange = (v: string) => {
    if (!spec) return;
    const next = { ...spec, systemPrompt: v };
    setSpec(next);
    setSpecText(prettyJson(next));
    setJsonError(null);
  };

  const onTextChange = (v: string) => {
    setSpecText(v);
    try {
      const parsed = JSON.parse(v) as AgentSpec;
      setSpec(parsed);
      setJsonError(null);
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async () => {
    let parsed: AgentSpec;
    try {
      parsed = JSON.parse(specText) as AgentSpec;
    } catch (e) {
      toast.error(`JSON 格式错误，无法保存：${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    setSaving(true);
    try {
      await agentApi.updateAgentSpec(resourceId, draftVersion, parsed);
      toast.success(`Spec 已保存到草稿 v${draftVersion}`);
      onSaved();
    } catch (e) {
      toast.error(`保存失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const policySource = spec ?? bundle.spec;

  return (
    <div className="space-y-4">
      {viewing === "published" && (
        <div className="rounded-lg border border-line bg-bg-sunken px-3 py-2 text-xs text-fg-muted">
          当前查看的是已发布版本 v{bundle.version} 的内容；点击「保存 Spec」将把修改写入草稿 v
          {draftVersion}。
        </div>
      )}

      <SectionCard title="System Prompt" description="与下方整体 JSON 编辑器双向同步">
        <Textarea
          value={spec?.systemPrompt ?? ""}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={10}
          className="font-mono text-[13px]"
          placeholder="填写 Agent 的系统提示词…"
          spellCheck={false}
        />
      </SectionCard>

      <SectionCard
        title="整体 Spec（JSON）"
        description="直接编辑完整 AgentSpec，保存前会做 JSON 格式校验"
        actions={
          <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
            保存 Spec（到草稿 v{draftVersion}）
          </Button>
        }
      >
        <Textarea
          value={specText}
          onChange={(e) => onTextChange(e.target.value)}
          rows={16}
          className="font-mono text-xs"
          spellCheck={false}
        />
        {jsonError && <div className="mt-2 text-xs text-danger">JSON 格式错误：{jsonError}</div>}
      </SectionCard>

      <SectionCard
        title="策略配置（只读）"
        description="modelPolicy / toolAndSkillPolicy / memoryPolicy 请在上方整体 JSON 中修改"
      >
        <div className="space-y-3">
          <div>
            <Badge tone="gray">modelPolicy</Badge>
            <JsonView data={policySource.modelPolicy} className="mt-1.5" />
          </div>
          <div>
            <Badge tone="gray">toolAndSkillPolicy</Badge>
            <JsonView data={policySource.toolAndSkillPolicy} className="mt-1.5" />
          </div>
          <div>
            <Badge tone="gray">memoryPolicy</Badge>
            <JsonView data={policySource.memoryPolicy} className="mt-1.5" />
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
