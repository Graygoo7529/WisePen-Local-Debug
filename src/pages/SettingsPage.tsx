import { useState } from "react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { Download, RefreshCw } from "lucide-react";
import {
  Button,
  Card,
  Field,
  Input,
  PageHeader,
  SectionCard,
  Select,
} from "../components/ui";
import {
  SERVICE_KEYS,
  SERVICE_LABELS,
  useSettingsStore,
  type ServiceKey,
} from "../stores/settingsStore";
import { requestRaw } from "../api/client";
import { toast } from "../stores/toastStore";
import { cn } from "../lib/cn";

interface PingResult {
  ok: boolean;
  detail: string;
  ms?: number;
}

export default function SettingsPage() {
  const settings = useSettingsStore();
  const [pinging, setPinging] = useState<string | null>(null);
  const [pingResults, setPingResults] = useState<Partial<Record<ServiceKey, PingResult>>>({});
  const [importing, setImporting] = useState(false);

  const urlField = (key: ServiceKey) => (
    <Field key={key} label={SERVICE_LABELS[key]}>
      <Input
        value={settings[`${key}BaseUrl`]}
        onChange={(e) => settings.set({ [`${key}BaseUrl`]: e.target.value })}
        spellCheck={false}
      />
    </Field>
  );

  const pingAll = async () => {
    setPinging("all");
    const results: Partial<Record<ServiceKey, PingResult>> = {};
    await Promise.all(
      SERVICE_KEYS.map(async (key) => {
        try {
          const resp = await requestRaw(key, { method: "GET", path: "/", timeoutSecs: 5 });
          // 任何 HTTP 响应都说明服务可达（404 只是根路径无路由）
          results[key] = { ok: true, detail: `HTTP ${resp.status}`, ms: resp.elapsed_ms };
        } catch (e) {
          results[key] = { ok: false, detail: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    setPingResults(results);
    setPinging(null);
  };

  const importConfig = async () => {
    setImporting(true);
    try {
      const picked = await openDialog({
        title: "选择 wisepen-local.config.json",
        filters: [{ name: "JSON", extensions: ["json"] }],
        multiple: false,
      });
      if (!picked) return;
      const text = await invoke<string>("read_text_file", { path: picked, maxBytes: null });
      const applied = settings.importConfigFile(text);
      if (applied.length === 0) {
        toast.info("未从配置文件中识别到可导入的字段（格式参考 wisepen-local.config.example.json）");
      } else {
        toast.success(`已导入：${applied.join("、")}`);
      }
    } catch (e) {
      toast.error(`导入失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[860px] px-6 py-6">
        <PageHeader
          title="设置"
          description="本地直连各后端服务的地址与身份凭据。凭据仅保存在本机，不会提交到任何仓库。"
          actions={
            <Button
              variant="outline"
              icon={<RefreshCw size={14} />}
              loading={pinging !== null}
              onClick={pingAll}
            >
              测试连通性
            </Button>
          }
        />

        <div className="space-y-4">
          <SectionCard
            title="服务地址"
            description="复制 wisepen-local.config.example.json 为 wisepen-local.config.json 填写后可一键导入（该文件已 gitignore）"
            actions={
              <Button
                size="sm"
                variant="outline"
                icon={<Download size={14} />}
                loading={importing}
                onClick={importConfig}
              >
                从配置文件导入
              </Button>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {SERVICE_KEYS.map(urlField)}
            </div>
            {Object.keys(pingResults).length > 0 && (
              <div className="mt-4 grid grid-cols-1 gap-1.5 md:grid-cols-2">
                {SERVICE_KEYS.map((key) => {
                  const r = pingResults[key];
                  if (!r) return null;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          r.ok ? "bg-success" : "bg-danger",
                        )}
                      />
                      <span className="text-fg-muted">{SERVICE_LABELS[key].split(" ")[0]}</span>
                      <span className={r.ok ? "text-success" : "text-danger"}>
                        {r.detail}
                        {r.ms !== undefined && ` · ${r.ms}ms`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="身份凭据"
            description="本地直连绕过网关登录，以请求头直接声明内部身份。X-From-Source 缺失或不匹配时服务端返回 404。"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="X-From-Source（内部来源凭据）" hint="值见 Docs/DevEnv/微服务调试指南.md">
                <Input
                  type="password"
                  value={settings.fromSource}
                  onChange={(e) => settings.set({ fromSource: e.target.value })}
                  placeholder="必填"
                  spellCheck={false}
                />
              </Field>
              <Field label="X-User-Id（测试用户 ID）" hint="任意非空值可建会话；端到端调试请用分配的测试用户">
                <Input
                  value={settings.userId}
                  onChange={(e) => settings.set({ userId: e.target.value })}
                  placeholder="必填"
                  spellCheck={false}
                />
              </Field>
              <Field label="X-Identity-Type">
                <Input
                  value={settings.identityType}
                  onChange={(e) => settings.set({ identityType: e.target.value })}
                  spellCheck={false}
                />
              </Field>
              <Field label="X-User-Status" hint="正常测试用户填写 1">
                <Input
                  value={settings.userStatus}
                  onChange={(e) => settings.set({ userStatus: e.target.value })}
                  spellCheck={false}
                />
              </Field>
              <Field label="X-Group-Role-Map（JSON）">
                <Input
                  value={settings.groupRoleMap}
                  onChange={(e) => settings.set({ groupRoleMap: e.target.value })}
                  spellCheck={false}
                />
              </Field>
              <Field label="developer（灰度开关）">
                <Input
                  value={settings.developer}
                  onChange={(e) => settings.set({ developer: e.target.value })}
                  spellCheck={false}
                />
              </Field>
              <Field label="X-Developer（开发者名）">
                <Input
                  value={settings.xDeveloper}
                  onChange={(e) => settings.set({ xDeveloper: e.target.value })}
                  spellCheck={false}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="偏好">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="默认模型 ID" hint="发起对话时缺省使用的模型；留空由服务端决定">
                <Input
                  value={settings.defaultModel}
                  onChange={(e) => settings.set({ defaultModel: e.target.value })}
                  spellCheck={false}
                />
              </Field>
              <Field label="主题">
                <Select
                  value={settings.theme}
                  onChange={(e) => settings.set({ theme: e.target.value as "light" | "dark" })}
                  options={[
                    { value: "light", label: "浅色" },
                    { value: "dark", label: "深色" },
                  ]}
                />
              </Field>
            </div>
          </SectionCard>

          <Card className="border-dashed px-4 py-3 text-xs leading-5 text-fg-faint">
            提示：修改即时生效并保存在本机。发起请求前请确认对应后端服务已启动（启动方式见
            run.txt 与 Docs/DevEnv）；若对话返回 404，优先检查 X-From-Source 是否填写正确。
          </Card>
        </div>
      </div>
    </div>
  );
}
