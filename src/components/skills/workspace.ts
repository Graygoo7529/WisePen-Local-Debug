import type { AssetResourceType } from "../../lib/types";

/** 资产工作区条目：本地编辑态；remote 为载入远端结构时记录的 assetId。 */
export interface WorkspaceEntry {
  key: string;
  name: string;
  path: string;
  assetResourceType: AssetResourceType;
  content: string;
  /** 远端资产 id（自某个版本载入结构而来）；本地新建的条目无此字段 */
  remote?: string;
}

let keySeq = 0;
export const nextKey = () => `entry-${++keySeq}`;

/** 提取未知错误的可读信息。 */
export const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const TYPE_OPTIONS: Array<{ value: AssetResourceType; label: string }> = [
  { value: "MD", label: "Markdown" },
  { value: "PYTHON_SCRIPT", label: "Python 脚本" },
  { value: "TEXT", label: "纯文本" },
  { value: "JSON", label: "JSON" },
  { value: "YAML", label: "YAML" },
  { value: "TOML", label: "TOML" },
];

/** 按文件扩展名猜测资产类型。 */
export function guessAssetType(fileName: string): AssetResourceType {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "md":
    case "markdown":
      return "MD";
    case "py":
      return "PYTHON_SCRIPT";
    case "json":
      return "JSON";
    case "yaml":
    case "yml":
      return "YAML";
    case "toml":
      return "TOML";
    default:
      return "TEXT";
  }
}

/** 新建 SKILL.md 时的中文技能模板。 */
export const SKILL_MD_TEMPLATE = `---
name: 技能名称
description: 简要描述该技能在何时被调用，帮助模型判断使用时机
---

# 技能名称

## 何时使用
- 当用户提出……类请求时使用本技能。

## 执行步骤
1. 第一步：……
2. 第二步：……

## 输出要求
- 输出格式与注意事项……

## 参考资料
- 细节参见 /references 目录下的文件。
`;

/** 新建 references 文件时的预填内容。 */
export const REFERENCE_TEMPLATE = `# 参考资料

在此补充供技能引用的详细资料、示例或规范。
`;
