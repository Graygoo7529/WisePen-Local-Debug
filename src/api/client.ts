import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, type ServiceKey } from "../stores/settingsStore";

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: number,
    public rawBody?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RestResponse {
  status: number;
  body: unknown;
  elapsed_ms: number;
}

/** 统一 R<T> 响应信封。 */
export interface R<T> {
  code: number;
  msg: string;
  data: T;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  /** 以 / 开头的服务内路径，如 /chat/session/listSessions */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** 附加请求头（覆盖默认身份头） */
  headers?: Record<string, string>;
  timeoutSecs?: number;
}

function baseUrlFor(service: ServiceKey): string {
  const s = useSettingsStore.getState();
  return s[`${service}BaseUrl`].replace(/\/+$/, "");
}

/** 构造各服务的身份请求头。 */
export function buildHeaders(service: ServiceKey): Record<string, string> {
  const s = useSettingsStore.getState();
  const h: Record<string, string> = {
    "X-From-Source": s.fromSource,
    "X-User-Id": s.userId,
  };
  // Chat 服务也会继续调用 Java 服务，必须保留完整身份上下文。
  if (s.identityType) h["X-Identity-Type"] = s.identityType;
  if (s.groupRoleMap) h["X-Group-Role-Map"] = s.groupRoleMap;
  if (s.developer) h["developer"] = s.developer;
  if (s.xDeveloper) h["X-Developer"] = s.xDeveloper;
  return h;
}

function cleanQuery(
  query?: Record<string, string | number | boolean | undefined>,
): Record<string, string> | undefined {
  if (!query) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") out[k] = String(v);
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 原始请求：不解包 R<T>，返回完整响应（端点探索器用）。 */
export async function requestRaw(
  service: ServiceKey,
  opts: RequestOptions,
): Promise<RestResponse> {
  const url = baseUrlFor(service) + opts.path;
  const headers = { ...buildHeaders(service), ...opts.headers };
  return await invoke<RestResponse>("rest_request", {
    method: opts.method ?? "GET",
    url,
    headers,
    query: cleanQuery(opts.query),
    body: opts.body ?? null,
    timeoutSecs: opts.timeoutSecs ?? null,
  });
}

/** 业务请求：校验 HTTP 状态并解包 R<T>。 */
export async function request<T>(service: ServiceKey, opts: RequestOptions): Promise<T> {
  const resp = await requestRaw(service, opts);
  if (resp.status === 404) {
    throw new ApiError(
      "HTTP 404：服务未启动、路径错误或 X-From-Source 不匹配",
      resp.status,
      undefined,
      resp.body,
    );
  }
  if (resp.status >= 400) {
    throw new ApiError(`HTTP ${resp.status}`, resp.status, undefined, resp.body);
  }
  const body = resp.body as Partial<R<T>> & { _text?: string };
  if (body && typeof body === "object" && typeof body.code === "number") {
    if (body.code === 200) return body.data as T;
    throw new ApiError(body.msg || `业务错误 code=${body.code}`, resp.status, body.code, body);
  }
  // 未包裹 R<T> 的响应原样返回
  return resp.body as T;
}

export const get = <T>(service: ServiceKey, path: string, query?: RequestOptions["query"]) =>
  request<T>(service, { method: "GET", path, query });
export const post = <T>(service: ServiceKey, path: string, body?: unknown, query?: RequestOptions["query"]) =>
  request<T>(service, { method: "POST", path, body, query });
export const del = <T>(service: ServiceKey, path: string, query?: RequestOptions["query"]) =>
  request<T>(service, { method: "DELETE", path, query });
