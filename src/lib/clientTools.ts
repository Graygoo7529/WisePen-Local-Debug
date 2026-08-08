import type { ClientToolCapability } from "./types";

export const CLIENT_TOOL_CAPABILITIES: ClientToolCapability[] = [
  {
    name: "local_debug_echo",
    description: "在 WisePen-Local 中回显一段文本，用于验证客户端工具调用和恢复链路。",
    input_schema: {
      type: "object",
      properties: {
        text: { type: "string", description: "需要原样回显的文本" },
      },
      required: ["text"],
      additionalProperties: false,
    },
  },
  {
    name: "local_debug_runtime",
    description: "读取 WisePen-Local 当前 WebView 的安全调试信息。",
    input_schema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const CLIENT_TOOL_NAMES = new Set(CLIENT_TOOL_CAPABILITIES.map((tool) => tool.name));

export function isClientTool(name: string): boolean {
  return CLIENT_TOOL_NAMES.has(name);
}

export async function executeClientTool(name: string, input: unknown): Promise<unknown> {
  if (name === "local_debug_echo") {
    const args = asRecord(input);
    if (typeof args.text !== "string") {
      throw new Error("local_debug_echo.text 必须是字符串");
    }
    return {
      echo: args.text,
      executed_at: new Date().toISOString(),
    };
  }

  if (name === "local_debug_runtime") {
    return {
      language: navigator.language,
      online: navigator.onLine,
      user_agent: navigator.userAgent,
      executed_at: new Date().toISOString(),
    };
  }

  throw new Error(`不允许执行未注册的客户端工具：${name}`);
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}
