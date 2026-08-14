import { useEffect, useMemo, useState } from "react";
import { Modal } from "../Modal";
import { Badge, Button, EmptyState, Input } from "../ui";

export interface CapabilityOption {
  id: string;
  name: string;
  description?: string;
  unavailable?: boolean;
}

export function CapabilityPickerModal({
  open,
  title,
  items,
  selected,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  items: CapabilityOption[];
  selected: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setChecked(selected);
  }, [open, selected]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.name} ${item.id} ${item.description ?? ""}`.toLowerCase().includes(keyword),
    );
  }, [items, query]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-xl"
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
      <div className="mb-3">
        <Input
          value={query}
          placeholder="搜索名称或 ID"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {filtered.length === 0 ? (
        <EmptyState title="没有匹配项" className="min-h-[160px]" />
      ) : (
        <div className="max-h-[420px] space-y-1 overflow-y-auto">
          {filtered.map((item) => (
            <label
              key={item.id}
              className="flex cursor-pointer items-start gap-2.5 rounded-md px-2.5 py-2 hover:bg-bg-hover"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-3.5 w-3.5 accent-accent"
                checked={checked.includes(item.id)}
                onChange={(event) =>
                  setChecked((current) =>
                    event.target.checked
                      ? [...new Set([...current, item.id])]
                      : current.filter((value) => value !== item.id),
                  )
                }
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium text-fg">{item.name}</span>
                  {item.unavailable && <Badge tone="yellow">当前不可用</Badge>}
                </div>
                <div className="truncate font-mono text-[11px] text-fg-faint">{item.id}</div>
                {item.description && (
                  <div className="mt-0.5 line-clamp-2 text-xs text-fg-muted">{item.description}</div>
                )}
              </div>
            </label>
          ))}
        </div>
      )}
    </Modal>
  );
}
