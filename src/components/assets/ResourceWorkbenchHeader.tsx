import type { ReactNode } from "react";
import { CopyButton, Select, Spinner } from "../ui";

export type ResourceVersionSelection =
  | { kind: "draft"; version: number }
  | { kind: "published"; version: number };

export function versionSelectionKey(selection: ResourceVersionSelection): string {
  return `${selection.kind}:${selection.version}`;
}

export function parseVersionSelection(value: string): ResourceVersionSelection {
  const [kind, versionText] = value.split(":");
  return {
    kind: kind === "draft" ? "draft" : "published",
    version: Number(versionText),
  };
}

export function ResourceWorkbenchHeader({
  title,
  resourceId,
  publishedVersion,
  draftVersion,
  selection,
  loading,
  status,
  actions,
  onVersionChange,
}: {
  title: string;
  resourceId: string;
  publishedVersion: number;
  draftVersion: number;
  selection: ResourceVersionSelection;
  loading: boolean;
  status?: ReactNode;
  actions?: ReactNode;
  onVersionChange: (selection: ResourceVersionSelection) => void;
}) {
  const versionOptions = [
    { value: `draft:${draftVersion}`, label: `草稿 v${draftVersion}（可编辑）` },
    ...Array.from({ length: publishedVersion }, (_, index) => publishedVersion - index).map(
      (version) => ({
        value: `published:${version}`,
        label: `已发布 v${version}（只读）`,
      }),
    ),
  ];

  return (
    <div className="shrink-0 border-b border-line bg-bg-elev">
      <div className="flex min-h-14 items-center gap-3 px-4 py-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h1 className="truncate text-sm font-semibold text-fg">{title}</h1>
            {loading && <Spinner size={14} />}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-faint">
            <code className="truncate font-mono">{resourceId}</code>
            <CopyButton text={resourceId} />
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      <div className="flex min-h-10 items-center gap-3 border-t border-line px-4 py-1.5">
        <span className="shrink-0 text-xs font-medium text-fg-muted">版本</span>
        <Select
          value={versionSelectionKey(selection)}
          options={versionOptions}
          className="h-8 w-52 text-xs"
          onChange={(event) => onVersionChange(parseVersionSelection(event.target.value))}
        />
        <div className="min-w-0 flex-1">{status}</div>
      </div>
    </div>
  );
}
