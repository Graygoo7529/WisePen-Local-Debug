import type { AgentSpec } from "./types";

export const DEFAULT_AGENT_SPEC: AgentSpec = {
  systemPrompt: "",
  autoGenerateTitle: true,
  modelPolicy: {
    defaultModelId: "",
    defaultProviderId: "",
    allowRequestOverride: true,
  },
  toolAndSkillPolicy: {
    enableUseTool: true,
    toolSelectionDefaultEnabled: true,
    toolSelectionOverrides: {},
    enableUseSkill: true,
    onDemandSkillIds: [],
    skillMatchTopK: 20,
  },
  memoryPolicy: {
    enableChatMemory: true,
    enablePersistenceChatMemory: true,
    enableChatMemorySummary: true,
    highWatermarkRatio: 0.8,
    lowWatermarkRatio: 0.5,
    summaryPrompt: "",
    enableLongTermMemory: false,
    longTermMemoryLimit: 10,
    longTermMemoryScoreThreshold: 0.6,
  },
};

export function normalizeAgentSpec(spec?: Partial<AgentSpec> | null): AgentSpec {
  return {
    systemPrompt: spec?.systemPrompt ?? DEFAULT_AGENT_SPEC.systemPrompt,
    autoGenerateTitle: spec?.autoGenerateTitle ?? DEFAULT_AGENT_SPEC.autoGenerateTitle,
    modelPolicy: {
      defaultModelId: spec?.modelPolicy?.defaultModelId ?? "",
      defaultProviderId: spec?.modelPolicy?.defaultProviderId ?? "",
      allowRequestOverride:
        spec?.modelPolicy?.allowRequestOverride ??
        DEFAULT_AGENT_SPEC.modelPolicy.allowRequestOverride,
    },
    toolAndSkillPolicy: {
      enableUseTool:
        spec?.toolAndSkillPolicy?.enableUseTool ??
        DEFAULT_AGENT_SPEC.toolAndSkillPolicy.enableUseTool,
      toolSelectionDefaultEnabled:
        spec?.toolAndSkillPolicy?.toolSelectionDefaultEnabled ??
        DEFAULT_AGENT_SPEC.toolAndSkillPolicy.toolSelectionDefaultEnabled,
      toolSelectionOverrides: {
        ...(spec?.toolAndSkillPolicy?.toolSelectionOverrides ?? {}),
      },
      enableUseSkill:
        spec?.toolAndSkillPolicy?.enableUseSkill ??
        DEFAULT_AGENT_SPEC.toolAndSkillPolicy.enableUseSkill,
      onDemandSkillIds: [...(spec?.toolAndSkillPolicy?.onDemandSkillIds ?? [])],
      skillMatchTopK:
        spec?.toolAndSkillPolicy?.skillMatchTopK ??
        DEFAULT_AGENT_SPEC.toolAndSkillPolicy.skillMatchTopK,
    },
    memoryPolicy: {
      enableChatMemory:
        spec?.memoryPolicy?.enableChatMemory ?? DEFAULT_AGENT_SPEC.memoryPolicy.enableChatMemory,
      enablePersistenceChatMemory:
        spec?.memoryPolicy?.enablePersistenceChatMemory ??
        DEFAULT_AGENT_SPEC.memoryPolicy.enablePersistenceChatMemory,
      enableChatMemorySummary:
        spec?.memoryPolicy?.enableChatMemorySummary ??
        DEFAULT_AGENT_SPEC.memoryPolicy.enableChatMemorySummary,
      highWatermarkRatio:
        spec?.memoryPolicy?.highWatermarkRatio ??
        DEFAULT_AGENT_SPEC.memoryPolicy.highWatermarkRatio,
      lowWatermarkRatio:
        spec?.memoryPolicy?.lowWatermarkRatio ??
        DEFAULT_AGENT_SPEC.memoryPolicy.lowWatermarkRatio,
      summaryPrompt: spec?.memoryPolicy?.summaryPrompt ?? "",
      enableLongTermMemory:
        spec?.memoryPolicy?.enableLongTermMemory ??
        DEFAULT_AGENT_SPEC.memoryPolicy.enableLongTermMemory,
      longTermMemoryLimit:
        spec?.memoryPolicy?.longTermMemoryLimit ??
        DEFAULT_AGENT_SPEC.memoryPolicy.longTermMemoryLimit,
      longTermMemoryScoreThreshold:
        spec?.memoryPolicy?.longTermMemoryScoreThreshold ??
        DEFAULT_AGENT_SPEC.memoryPolicy.longTermMemoryScoreThreshold,
    },
  };
}
