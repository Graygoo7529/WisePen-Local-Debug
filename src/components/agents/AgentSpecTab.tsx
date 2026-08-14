import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { agentApi } from "../../api/asset";
import { chatApi } from "../../api/chat";
import { normalizeAgentSpec } from "../../lib/agentSpec";
import { prettyJson } from "../../lib/format";
import type { AgentSpec, AgentVersionBundle, AvailableModels } from "../../lib/types";
import { toast } from "../../stores/toastStore";
import {
  Button,
  EmptyState,
  Field,
  Input,
  SectionCard,
  Select,
  Spinner,
  Switch,
  Tabs,
  Textarea,
} from "../ui";

type EditorMode = "form" | "json";

export function AgentSpecTab({
  resourceId,
  draftVersion,
  bundle,
  loading,
  editable,
  onSaved,
}: {
  resourceId: string;
  draftVersion: number;
  bundle: AgentVersionBundle | null;
  loading: boolean;
  editable: boolean;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<EditorMode>("form");
  const [spec, setSpec] = useState<AgentSpec>(normalizeAgentSpec(bundle?.spec));
  const [specText, setSpecText] = useState(prettyJson(normalizeAgentSpec(bundle?.spec)));
  const [savedText, setSavedText] = useState(specText);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<AvailableModels | null>(null);

  useEffect(() => {
    const next = normalizeAgentSpec(bundle?.spec);
    const text = prettyJson(next);
    setSpec(next);
    setSpecText(text);
    setSavedText(text);
    setJsonError(null);
  }, [bundle]);

  useEffect(() => {
    chatApi.listAvailableModels().then(setModels).catch(() => setModels(null));
  }, []);

  if (loading && !bundle) {
    return (
      <div className="flex justify-center py-16">
        <Spinner size={20} />
      </div>
    );
  }
  if (!bundle) {
    return <EmptyState title="版本配置加载失败" action={<Button onClick={onSaved}>重新加载</Button>} />;
  }

  const updateSpec = (next: AgentSpec) => {
    setSpec(next);
    setSpecText(prettyJson(next));
    setJsonError(null);
  };

  const updateList = (
    field: keyof Pick<
      AgentSpec["toolAndSkillPolicy"],
      "allowToolNames" | "denyToolNames" | "onDemandSkillIds" | "forceEnabledSkillIds"
    >,
    value: string,
  ) => {
    const items = Array.from(
      new Set(
        value
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    );
    const nextPolicy = { ...spec.toolAndSkillPolicy, [field]: items };
    if (field === "allowToolNames") {
      nextPolicy.denyToolNames = nextPolicy.denyToolNames.filter((item) => !items.includes(item));
    } else if (field === "denyToolNames") {
      nextPolicy.allowToolNames = nextPolicy.allowToolNames.filter((item) => !items.includes(item));
    } else if (field === "onDemandSkillIds") {
      nextPolicy.forceEnabledSkillIds = nextPolicy.forceEnabledSkillIds.filter(
        (item) => !items.includes(item),
      );
    } else {
      nextPolicy.onDemandSkillIds = nextPolicy.onDemandSkillIds.filter(
        (item) => !items.includes(item),
      );
    }
    updateSpec({
      ...spec,
      toolAndSkillPolicy: nextPolicy,
    });
  };

  const onTextChange = (value: string) => {
    setSpecText(value);
    try {
      const parsed = normalizeAgentSpec(JSON.parse(value) as Partial<AgentSpec>);
      setSpec(parsed);
      setJsonError(null);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : String(error));
    }
  };

  const save = async () => {
    let payload: AgentSpec;
    try {
      payload = mode === "json"
        ? normalizeAgentSpec(JSON.parse(specText) as Partial<AgentSpec>)
        : spec;
    } catch (error) {
      toast.error(`JSON 格式错误：${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (payload.memoryPolicy.lowWatermarkRatio >= payload.memoryPolicy.highWatermarkRatio) {
      toast.error("记忆低水位必须小于高水位");
      return;
    }
    if (
      payload.memoryPolicy.highWatermarkRatio < 0 ||
      payload.memoryPolicy.highWatermarkRatio > 1 ||
      payload.memoryPolicy.lowWatermarkRatio < 0 ||
      payload.memoryPolicy.lowWatermarkRatio > 1 ||
      payload.memoryPolicy.longTermMemoryScoreThreshold < 0 ||
      payload.memoryPolicy.longTermMemoryScoreThreshold > 1 ||
      payload.memoryPolicy.longTermMemoryLimit < 1
    ) {
      toast.error("记忆策略参数超出有效范围");
      return;
    }
    setSaving(true);
    try {
      await agentApi.updateAgentSpec(resourceId, draftVersion, payload);
      const nextText = prettyJson(payload);
      setSpec(payload);
      setSpecText(nextText);
      setSavedText(nextText);
      toast.success(`Agent 配置已保存到草稿 v${draftVersion}`);
      onSaved();
    } catch (error) {
      toast.error(`保存失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const dirty = specText !== savedText;
  const disabled = !editable;
  const policy = spec.toolAndSkillPolicy;
  const memory = spec.memoryPolicy;
  const modelOptions = (models ? [...models.system_models, ...models.user_models] : []).flatMap(
    (model) => {
      const mappings = model.mappings?.filter((mapping) => mapping.is_active) ?? [];
      if (mappings.length === 0) {
        return [{ value: `${model.id}::`, label: model.display_name }];
      }
      return mappings.map((mapping) => ({
        value: `${model.id}::${mapping.provider_id}`,
        label: `${model.display_name} · ${mapping.provider_name ?? mapping.provider_id}`,
      }));
    },
  );
  const selectedModelValue = `${spec.modelPolicy.defaultModelId}::${spec.modelPolicy.defaultProviderId}`;
  if (
    spec.modelPolicy.defaultModelId &&
    !modelOptions.some((option) => option.value === selectedModelValue)
  ) {
    modelOptions.unshift({
      value: selectedModelValue,
      label: `${spec.modelPolicy.defaultModelId} · ${spec.modelPolicy.defaultProviderId || "默认 Provider"}`,
    });
  }

  return (
    <SectionCard
      title={`运行配置 · v${bundle.version}`}
      description={editable ? "草稿配置" : "已发布版本快照（只读）"}
      actions={
        <>
          <Tabs
            tabs={[
              { key: "form", label: "表单" },
              { key: "json", label: "JSON" },
            ]}
            active={mode}
            onChange={(key) => setMode(key as EditorMode)}
          />
          {editable && (
            <Button
              size="sm"
              variant="primary"
              icon={<Save size={14} />}
              loading={saving}
              disabled={!dirty || Boolean(jsonError)}
              onClick={() => void save()}
            >
              保存草稿
            </Button>
          )}
        </>
      }
      bodyClassName="p-0"
    >
      {mode === "json" ? (
        <div className="p-4">
          <Textarea
            value={specText}
            readOnly={disabled}
            rows={28}
            className="font-mono text-xs"
            spellCheck={false}
            onChange={(event) => onTextChange(event.target.value)}
          />
          {jsonError && <div className="mt-2 text-xs text-danger">JSON 格式错误：{jsonError}</div>}
        </div>
      ) : (
        <div className="divide-y divide-line">
          <div className="space-y-4 p-4">
            <Field label="System Prompt" hint="发布 Agent 前必须填写">
              <Textarea
                value={spec.systemPrompt}
                readOnly={disabled}
                rows={10}
                className="font-mono text-[13px]"
                spellCheck={false}
                onChange={(event) => updateSpec({ ...spec, systemPrompt: event.target.value })}
              />
            </Field>
            <SettingSwitch
              label="自动生成会话标题"
              checked={spec.autoGenerateTitle}
              disabled={disabled}
              onChange={(value) => updateSpec({ ...spec, autoGenerateTitle: value })}
            />
          </div>

          <div className="space-y-4 p-4">
            <SectionTitle title="模型策略" />
            <Field label="默认模型">
              {modelOptions.length > 0 ? (
                <Select
                  value={selectedModelValue}
                  disabled={disabled}
                  options={[
                    { value: "::", label: "跟随系统默认" },
                    ...modelOptions,
                  ]}
                  onChange={(event) => {
                    const [defaultModelId, defaultProviderId] = event.target.value.split("::");
                    updateSpec({
                      ...spec,
                      modelPolicy: { ...spec.modelPolicy, defaultModelId, defaultProviderId },
                    });
                  }}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Input
                    value={spec.modelPolicy.defaultModelId}
                    readOnly={disabled}
                    placeholder="Model ID"
                    spellCheck={false}
                    onChange={(event) =>
                      updateSpec({
                        ...spec,
                        modelPolicy: { ...spec.modelPolicy, defaultModelId: event.target.value },
                      })
                    }
                  />
                  <Input
                    value={spec.modelPolicy.defaultProviderId}
                    readOnly={disabled}
                    placeholder="Provider ID"
                    spellCheck={false}
                    onChange={(event) =>
                      updateSpec({
                        ...spec,
                        modelPolicy: { ...spec.modelPolicy, defaultProviderId: event.target.value },
                      })
                    }
                  />
                </div>
              )}
            </Field>
            <SettingSwitch
              label="允许请求覆盖模型配置"
              checked={spec.modelPolicy.allowRequestOverride}
              disabled={disabled}
              onChange={(value) =>
                updateSpec({
                  ...spec,
                  modelPolicy: { ...spec.modelPolicy, allowRequestOverride: value },
                })
              }
            />
          </div>

          <div className="space-y-4 p-4">
            <SectionTitle title="工具与 Skill" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingSwitch
                label="启用工具"
                checked={policy.enableUseTool}
                disabled={disabled}
                onChange={(value) =>
                  updateSpec({
                    ...spec,
                    toolAndSkillPolicy: { ...policy, enableUseTool: value },
                  })
                }
              />
              <SettingSwitch
                label="启用 Skill"
                checked={policy.enableUseSkill}
                disabled={disabled}
                onChange={(value) =>
                  updateSpec({
                    ...spec,
                    toolAndSkillPolicy: { ...policy, enableUseSkill: value },
                  })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <ListField
                label="允许的工具名"
                values={policy.allowToolNames}
                disabled={disabled || !policy.enableUseTool}
                onChange={(value) => updateList("allowToolNames", value)}
              />
              <ListField
                label="禁用的工具名"
                values={policy.denyToolNames}
                disabled={disabled || !policy.enableUseTool}
                onChange={(value) => updateList("denyToolNames", value)}
              />
              <ListField
                label="按需 Skill ID"
                values={policy.onDemandSkillIds}
                disabled={disabled || !policy.enableUseSkill}
                onChange={(value) => updateList("onDemandSkillIds", value)}
              />
              <ListField
                label="固定启用 Skill ID"
                values={policy.forceEnabledSkillIds}
                disabled={disabled || !policy.enableUseSkill}
                onChange={(value) => updateList("forceEnabledSkillIds", value)}
              />
            </div>
          </div>

          <div className="space-y-4 p-4">
            <SectionTitle title="记忆策略" />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <SettingSwitch
                label="启用会话记忆"
                checked={memory.enableChatMemory}
                disabled={disabled}
                onChange={(value) =>
                  updateSpec({ ...spec, memoryPolicy: { ...memory, enableChatMemory: value } })
                }
              />
              <SettingSwitch
                label="持久化会话记忆"
                checked={memory.enablePersistenceChatMemory}
                disabled={disabled || !memory.enableChatMemory}
                onChange={(value) =>
                  updateSpec({
                    ...spec,
                    memoryPolicy: { ...memory, enablePersistenceChatMemory: value },
                  })
                }
              />
              <SettingSwitch
                label="启用记忆摘要"
                checked={memory.enableChatMemorySummary}
                disabled={disabled || !memory.enableChatMemory}
                onChange={(value) =>
                  updateSpec({
                    ...spec,
                    memoryPolicy: { ...memory, enableChatMemorySummary: value },
                  })
                }
              />
              <SettingSwitch
                label="启用长期记忆"
                checked={memory.enableLongTermMemory}
                disabled={disabled}
                onChange={(value) =>
                  updateSpec({ ...spec, memoryPolicy: { ...memory, enableLongTermMemory: value } })
                }
              />
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <NumberField
                label="摘要高水位"
                value={memory.highWatermarkRatio}
                min={0.5}
                max={0.95}
                step={0.05}
                disabled={disabled || !memory.enableChatMemorySummary}
                onChange={(value) =>
                  updateSpec({ ...spec, memoryPolicy: { ...memory, highWatermarkRatio: value } })
                }
              />
              <NumberField
                label="摘要低水位"
                value={memory.lowWatermarkRatio}
                min={0.1}
                max={0.8}
                step={0.05}
                disabled={disabled || !memory.enableChatMemorySummary}
                onChange={(value) =>
                  updateSpec({ ...spec, memoryPolicy: { ...memory, lowWatermarkRatio: value } })
                }
              />
              <NumberField
                label="长期记忆召回数"
                value={memory.longTermMemoryLimit}
                min={1}
                max={50}
                step={1}
                disabled={disabled || !memory.enableLongTermMemory}
                onChange={(value) =>
                  updateSpec({
                    ...spec,
                    memoryPolicy: { ...memory, longTermMemoryLimit: Math.round(value) },
                  })
                }
              />
            </div>
            <NumberField
              label="长期记忆分数阈值"
              value={memory.longTermMemoryScoreThreshold}
              min={0}
              max={1}
              step={0.05}
              disabled={disabled || !memory.enableLongTermMemory}
              onChange={(value) =>
                updateSpec({
                  ...spec,
                  memoryPolicy: { ...memory, longTermMemoryScoreThreshold: value },
                })
              }
            />
            <Field label="记忆摘要 Prompt">
              <Textarea
                value={memory.summaryPrompt}
                readOnly={disabled}
                disabled={!memory.enableChatMemorySummary}
                rows={4}
                onChange={(event) =>
                  updateSpec({
                    ...spec,
                    memoryPolicy: { ...memory, summaryPrompt: event.target.value },
                  })
                }
              />
            </Field>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="text-[13px] font-semibold text-fg">{title}</h2>;
}

function SettingSwitch({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <span className="text-[13px] text-fg-muted">{label}</span>
      <Switch checked={checked} disabled={disabled} onChange={onChange} />
    </div>
  );
}

function ListField({
  label,
  values,
  disabled,
  onChange,
}: {
  label: string;
  values: string[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} hint="每行一个值，也可用逗号分隔">
      <Textarea
        value={values.join("\n")}
        disabled={disabled}
        rows={3}
        className="font-mono text-xs"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Field label={label}>
      <Input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </Field>
  );
}
