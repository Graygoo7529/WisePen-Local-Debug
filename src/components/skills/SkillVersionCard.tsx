import { Badge, Button, Field, Input, SectionCard } from "../ui";
import { formatBytes } from "../../lib/format";
import type { SkillVersionBundle } from "../../lib/types";

/** 版本卡：draftVersion 输入（贯穿上传/删除/查草稿）+ 已发布 / 草稿版本查询与资产表格。 */
export function SkillVersionCard({
  draftVersion,
  onDraftVersionChange,
  publishedBundle,
  draftBundle,
  queryingPublished,
  queryingDraft,
  onQueryPublished,
  onQueryDraft,
}: {
  draftVersion: number;
  onDraftVersionChange: (v: number) => void;
  publishedBundle: SkillVersionBundle | null;
  draftBundle: SkillVersionBundle | null;
  queryingPublished: boolean;
  queryingDraft: boolean;
  onQueryPublished: () => void;
  onQueryDraft: () => void;
}) {
  return (
    <SectionCard
      title="版本信息"
      description="目标草稿版本贯穿上传资产、删除远端资产与草稿查询；修改草稿号后需重新查询草稿。"
      actions={
        <>
          <Button size="sm" variant="outline" loading={queryingPublished} onClick={onQueryPublished}>
            查询已发布
          </Button>
          <Button size="sm" variant="outline" loading={queryingDraft} onClick={onQueryDraft}>
            查询草稿
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field
          label="目标草稿版本（draftVersion）"
          hint="默认为当前发布版本 +1"
          className="w-44"
        >
          <Input
            type="number"
            min={1}
            value={draftVersion}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              onDraftVersionChange(Number.isNaN(v) || v < 1 ? 1 : v);
            }}
          />
        </Field>

        {!publishedBundle && !draftBundle && (
          <div className="rounded-lg border border-dashed border-line px-3 py-4 text-center text-xs text-fg-faint">
            点击右上角「查询已发布」或「查询草稿」查看版本与资产明细
          </div>
        )}
        {publishedBundle && <BundleView bundle={publishedBundle} />}
        {draftBundle && <BundleView bundle={draftBundle} />}
      </div>
    </SectionCard>
  );
}

function BundleView({ bundle }: { bundle: SkillVersionBundle }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-bg-sunken px-3 py-2">
        <Badge tone="accent">v{bundle.version}</Badge>
        <Badge tone={bundle.status === "PUBLISHED" ? "green" : "yellow"}>
          {bundle.status === "PUBLISHED" ? "已发布" : "草稿"}
        </Badge>
        <span className="text-xs text-fg-faint">{bundle.assets.length} 个资产</span>
      </div>
      {bundle.assets.length === 0 ? (
        <div className="px-3 py-3 text-xs text-fg-faint">该版本暂无资产</div>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-fg-faint">
              <th className="border-b border-line px-3 py-1.5 font-medium">名称</th>
              <th className="border-b border-line px-3 py-1.5 font-medium">路径</th>
              <th className="border-b border-line px-3 py-1.5 font-medium">类型</th>
              <th className="border-b border-line px-3 py-1.5 font-medium">大小</th>
              <th className="border-b border-line px-3 py-1.5 font-medium">状态</th>
            </tr>
          </thead>
          <tbody>
            {bundle.assets.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0">
                <td className="px-3 py-1.5 text-fg">{a.name}</td>
                <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted">{a.path}</td>
                <td className="px-3 py-1.5">
                  <Badge>{a.assetResourceType}</Badge>
                </td>
                <td className="px-3 py-1.5 text-fg-muted">{formatBytes(a.size)}</td>
                <td className="px-3 py-1.5">
                  <Badge tone={a.uploadStatus === "AVAILABLE" ? "green" : "yellow"}>
                    {a.uploadStatus === "AVAILABLE" ? "可用" : "上传中"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
