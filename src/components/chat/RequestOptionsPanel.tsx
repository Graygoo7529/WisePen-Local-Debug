import { useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
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
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
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
            onClick={() => onChange(value.filter((t) => t !== tag))}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] outline-none placeholder:text-fg-faint"
        value={text}
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
  const setOptions = useChatStore((s) => s.setOptions);
  const [models, setModels] = useState<AvailableModels | null>(null);
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);

  useEffect(() => {
    chatApi
      .listAvailableModels()
      .then(setModels)
      .catch(() => {
        /* 服务未启动时静默，发送时再报错 */
      });
  }, []);

  const allModels: ModelInfo[] = models
    ? [...models.system_models, ...models.user_models]
    : [];
  const selectedModel = allModels.find((m) => m.id === options.model);
  const mappings = selectedModel?.mappings ?? [];

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
        <Field label="模型">
          <Select
            value={options.model}
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

      <Field label="按需 Skill（user_defined_on_demand_skill_ids）">
        <div className="flex flex-wrap items-center gap-1.5">
          {options.onDemandSkillIds.map((id) => (
            <Badge key={id} tone="accent" className="font-mono">
              {id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id}
              <button
                className="cursor-pointer hover:text-danger"
                title="移除"
                onClick={() =>
                  setOptions({ onDemandSkillIds: options.onDemandSkillIds.filter((x) => x !== id) })
                }
              >
                <X size={11} />
              </button>
            </Badge>
          ))}
          <Button size="xs" variant="outline" onClick={() => setSkillPickerOpen(true)}>
            从资源选择
          </Button>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="工具白名单（allow_tool_names）">
          <TagInput
            value={options.allowToolNames}
            onChange={(v) => setOptions({ allowToolNames: v })}
            placeholder="回车添加工具名"
          />
        </Field>
        <Field label="工具黑名单（deny_tool_names）">
          <TagInput
            value={options.denyToolNames}
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
