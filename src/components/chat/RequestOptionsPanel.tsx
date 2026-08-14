import { useEffect, useState } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import { Badge, Button, Field, Input, Select, Switch, Textarea } from "../ui";
import { Modal } from "../Modal";
import { chatApi } from "../../api/chat";
import { resourceApi } from "../../api/resource";
import { toast } from "../../stores/toastStore";
import { useChatStore } from "../../stores/chatStore";
import type { AvailableModels, FrontendState, ModelInfo, ResourceItem } from "../../lib/types";

/** 字符串数组输入：回车/逗号成 chip。 */
function TagInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const commit = () => {
    const v = text.trim().replace(/,+$/, "");
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-lg border border-line bg-bg-elev px-2 py-1.5 focus-within:border-accent">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-bg-hover px-1.5 py-0.5 font-mono text-xs text-fg"
        >
          {tag}
          <button
            className="cursor-pointer text-fg-faint hover:text-danger"
            disabled={disabled}
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-fg-faint"
        value={text}
        disabled={disabled}
        placeholder={value.length === 0 ? placeholder : ""}
        onChange={(e) => {
          if (e.target.value.includes(",")) {
            const parts = e.target.value.split(",");
            const adds = parts.slice(0, -1).map((p) => p.trim()).filter(Boolean);
            if (adds.length > 0) onChange([...new Set([...value, ...adds])]);
            setText(parts[parts.length - 1]);
          } else {
            setText(e.target.value);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && text === "" && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={commit}
      />
    </div>
  );
}

/** 对话请求参数面板：模型、Skill、工具名单、frontend_states 上下文模拟、runtime_options。 */
export function RequestOptionsPanel() {
  const options = useChatStore((s) => s.options);
  const currentSession = useChatStore((s) => s.currentSession);
  const setOptions = useChatStore((s) => s.setOptions);
  const agentBaseline = useChatStore((s) => s.agentRequestBaseline);
  const applyAgentBaseline = useChatStore((s) => s.applyAgentRequestBaseline);
  const [models, setModels] = useState<AvailableModels | null>(null);
  const [agents, setAgents] = useState<ResourceItem[]>([]);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);

  useEffect(() => {
    chatApi
      .listAvailableModels()
      .then(setModels)
      .catch(() => {
        /* 服务未启动时静默，发送时再报错 */
      });
  }, []);

  useEffect(() => {
    resourceApi
      .listResources({ resourceType: "AGENT", size: 50 })
      .then((page) => setAgents(page.list))
      .catch(() => {
        /* Agent 列表不可用时仍可手工输入 Agent ID */
      });
  }, []);

  const allModels: ModelInfo[] = models
    ? [...models.system_models, ...models.user_models]
    : [];
  const selectedModel = allModels.find((m) => m.id === options.model);
  const mappings = selectedModel?.mappings ?? [];
  const sessionAgentId = currentSession?.agent_id ?? "";
  const agentValue = currentSession ? sessionAgentId : options.agentId;
  const agentOptions = [
    { value: "", label: "默认 Agent" },
    ...agents.map((agent) => ({
      value: agent.resourceId,
      label: `${agent.resourceName}（${agent.resourceId.slice(0, 8)}…）`,
    })),
    ...(agentValue && !agents.some((agent) => agent.resourceId === agentValue)
      ? [{ value: agentValue, label: `手工 Agent（${agentValue}）` }]
      : []),
  ];
  const hasAgentOverride = agentBaseline
    ? options.model !== agentBaseline.model ||
      options.providerId !== agentBaseline.providerId ||
      !sameValues(options.allowToolNames, agentBaseline.allowToolNames) ||
      !sameValues(options.denyToolNames, agentBaseline.denyToolNames) ||
      !sameValues(options.onDemandSkillIds, agentBaseline.onDemandSkillIds)
    : false;
  const modelOverrideDisabled = Boolean(agentBaseline && !agentBaseline.allowModelOverride);
  const toolOverrideDisabled = Boolean(agentBaseline && !agentBaseline.enableUseTool);
  const skillOverrideDisabled = Boolean(agentBaseline && !agentBaseline.enableUseSkill);

  const addState = (preset?: FrontendState) => {
    setOptions({
      frontendStates: [...options.frontendStates, preset ?? { key: "", value: "", disabled: false }],
    });
  };
  const patchState = (i: number, patch: Partial<FrontendState>) => {
    setOptions({
      frontendStates: options.frontendStates.map((s, idx) => (idx === i ? { ...s, ...patch } : s)),
    });
  };

  return (
    <div className="space-y-3 border-t border-line bg-bg-elev px-4 py-3">
      <div className="grid grid-cols-2 gap-3">
        <Field
          label={currentSession ? "会话 Agent" : "新会话 Agent"}
          hint={currentSession ? "会话创建后版本固定" : "也可在新建会话弹窗中选择"}
        >
          <Select
            value={agentValue}
            disabled={Boolean(currentSession)}
            onChange={(e) => setOptions({ agentId: e.target.value })}
            options={agentOptions}
          />
        </Field>
        <Field label="Agent ID" hint="资源列表没有结果时可直接输入">
          <Input
            value={agentValue}
            disabled={Boolean(currentSession)}
            onChange={(e) => setOptions({ agentId: e.target.value.trim() })}
            placeholder="留空使用默认 Agent"
            spellCheck={false}
          />
        </Field>
      </div>

      {currentSession?.agent_id && (
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span>
            当前绑定版本：<span className="font-mono text-accent">v{currentSession.agent_version ?? "-"}</span>
          </span>
          {agentBaseline && <Badge tone="green">Agent 参数已载入</Badge>}
          {hasAgentOverride && <Badge tone="yellow">存在临时覆盖</Badge>}
          {agentBaseline && hasAgentOverride && (
            <Button
              size="xs"
              variant="ghost"
              icon={<RotateCcw size={12} />}
              onClick={applyAgentBaseline}
            >
              恢复 Agent 配置
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="模型"
          hint={modelOverrideDisabled ? "Agent 配置不允许请求覆盖模型" : undefined}
        >
          <Select
            value={options.model}
            disabled={modelOverrideDisabled}
            onChange={(e) => setOptions({ model: e.target.value, providerId: "" })}
            options={[
              { value: "", label: "服务端默认" },
              ...allModels.map((m) => ({
                value: m.id,
                label: `${m.display_name}（${m.scope === "SYSTEM" ? "系统" : "用户"}）`,
              })),
              ...(options.model && !selectedModel
                ? [{ value: options.model, label: `自定义：${options.model}` }]
                : []),
            ]}
          />
        </Field>
        <Field label="Provider 映射" hint="缺省用首选映射">
          <Select
            value={options.providerId}
            disabled={modelOverrideDisabled}
            onChange={(e) => setOptions({ providerId: e.target.value })}
            options={[
              { value: "", label: "缺省（首选）" },
              ...mappings.map((mp) => ({
                value: mp.provider_id,
                label: `${mp.provider_name ?? mp.provider_id.slice(0, 8)} → ${mp.provider_model_name}${mp.is_preferred ? "（首选）" : ""}`,
              })),
            ]}
          />
        </Field>
      </div>

      <Field
        label="按需 Skill（user_defined_on_demand_skill_ids）"
        hint={skillOverrideDisabled ? "当前 Agent 已关闭 Skill" : undefined}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {options.onDemandSkillIds.map((id) => (
            <Badge key={id} tone="accent" className="font-mono">
              {id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
              <button
                className="cursor-pointer hover:text-danger"
                title="移除"
                disabled={skillOverrideDisabled}
                onClick={() =>
                  setOptions({ onDemandSkillIds: options.onDemandSkillIds.filter((x) => x !== id) })
                }
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
          <Button
            size="xs"
            variant="outline"
            disabled={skillOverrideDisabled}
            onClick={() => setSkillPickerOpen(true)}
          >
            从资源选择
          </Button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="工具白名单（allow_tool_names）"
          hint={toolOverrideDisabled ? "当前 Agent 已关闭工具" : undefined}
        >
          <TagInput
            value={options.allowToolNames}
            disabled={toolOverrideDisabled}
            onChange={(v) => setOptions({ allowToolNames: v })}
            placeholder="回车添加工具名"
          />
        </Field>
        <Field label="工具黑名单（deny_tool_names）">
          <TagInput
            value={options.denyToolNames}
            disabled={toolOverrideDisabled}
            onChange={(v) => setOptions({ denyToolNames: v })}
            placeholder="回车添加工具名"
          />
        </Field>
      </div>

      <Field
        label="前端上下文模拟（frontend_states）"
        hint="模拟 WisePenView 的笔记上下文感知：仅 disabled≠true 且 value 非空的项会注入"
      >
        <div className="space-y-2">
          {options.frontendStates.map((st, i) => (
            <div key={i} className="flex items-start gap-2">
              <Input
                className="w-[180px] shrink-0 font-mono"
                placeholder="key"
                value={st.key}
                onChange={(e) => patchState(i, { key: e.target.value })}
              />
              <Textarea
                className="min-h-[36px] flex-1 font-mono text-xs"
                placeholder="value（任意内容，作为字符串注入）"
                value={typeof st.value === "string" ? st.value : JSON.stringify(st.value)}
                onChange={(e) => patchState(i, { value: e.target.value })}
              />
              <div className="flex shrink-0 items-center gap-1.5 pt-2">
                <span className="text-xs text-fg-faint">禁用</span>
                <Switch
                  checked={Boolean(st.disabled)}
                  onChange={(v) => patchState(i, { disabled: v })}
                />
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() =>
                    setOptions({ frontendStates: options.frontendStates.filter((_, idx) => idx !== i) })
                  }
                >
                  <X size={12} />
                </Button>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button size="xs" variant="outline" icon={<Plus size={12} />} onClick={() => addState()}>
              添加状态
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() => addState({ key: "selected_text", value: "（在此粘贴编辑器选中文本）", disabled: false })}
            >
              模拟选中文本
            </Button>
          </div>
        </div>
      </Field>

      <Field label="runtime_options（JSON，按 Provider manifest 校验）">
        <Textarea
          className="min-h-[56px] font-mono text-xs"
          placeholder='{"temperature": 0.7}'
          value={options.runtimeOptionsText}
          onChange={(e) => setOptions({ runtimeOptionsText: e.target.value })}
          spellCheck={false}
        />
      </Field>

      <SkillPickerModal
        open={skillPickerOpen}
        onClose={() => setSkillPickerOpen(false)}
        selected={options.onDemandSkillIds}
        onConfirm={(ids) => setOptions({ onDemandSkillIds: ids })}
      />
    </div>
  );
}

function sameValues(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Skill 资源选择器：列出资源服务中的 SKILL 资源供勾选。 */
export function SkillPickerModal({
  open,
  onClose,
  selected,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  selected: string[];
  onConfirm: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<ResourceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setChecked(selected);
    setLoading(true);
    resourceApi
      .listResources({ resourceType: "SKILL", size: 50 })
      .then((page) => setItems(page.list))
      .catch((e) => toast.error(`加载 Skill 列表失败：${e instanceof Error ? e.message : e}`))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="选择 Skill"
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="primary"
            onClick={() => {
              onConfirm(checked);
              onClose();
            }}
          >
            确定（{checked.length}）
          </Button>
        </>
      }
    >
      {loading && <div className="py-6 text-center text-sm text-fg-faint">加载中…</div>}
      {!loading && items.length === 0 && (
        <div className="py-6 text-center text-sm text-fg-faint">
          未查询到 SKILL 资源（可在「Skill 工坊」创建）
        </div>
      )}
      <div className="space-y-1">
        {items.map((item) => (
          <label
            key={item.resourceId}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-bg-hover"
          >
            <input
              type="checkbox"
              className="accent-(--color-accent)"
              checked={checked.includes(item.resourceId)}
              onChange={(e) =>
                setChecked(
                  e.target.checked
                    ? [...checked, item.resourceId]
                    : checked.filter((x) => x !== item.resourceId),
                )
              }
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{item.resourceName}</div>
              <div className="truncate font-mono text-[11px] text-fg-faint">{item.resourceId}</div>
            </div>
          </label>
        ))}
      </div>
    </Modal>
  );
}
