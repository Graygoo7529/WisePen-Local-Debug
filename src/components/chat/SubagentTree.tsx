import { useEffect, useState } from "react";
import type { ModelUsageView, SubagentProjection, SubagentRunView, UIMessage } from "../../lib/types";
import { Badge, Button, Input } from "../ui";
import { Markdown } from "../Markdown";
import { CodeBlock } from "../JsonView";
import { chatApi } from "../../api/chat";
import { useChatStore } from "../../stores/chatStore";
import { MessageItem } from "./MessageItem";
import { partsFromUIMessage } from "./chatDisplay";

export function SavedSubagents({ sessionId, root }: { sessionId: string; root: string }) {
  const [projection, setProjection] = useState<SubagentProjection>();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setProjection(undefined);
    setError("");
    void chatApi.listSubagents(sessionId, root).then(
      ({ runs, usage }) => { if (active) setProjection({ rootExecutionId: root, sequence: 0, runs, events: {}, usage }); },
      (err: unknown) => { if (active) setError(String(err)); },
    );
    return () => { active = false; };
  }, [sessionId, root]);
  if (error) return <p role="alert" className="mx-15 text-xs text-danger">{error}</p>;
  return projection && <SubagentTree projection={projection} sessionId={sessionId} historical />;
}

export function SubagentTree({ projection, sessionId, historical = false }: {
  projection: SubagentProjection; sessionId?: string; historical?: boolean;
}) {
  return (
    <section aria-label="Subagents 執行樹" className="mx-15 mb-3 rounded-lg border border-line bg-bg-sunken p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span>Subagents</span><Badge>{projection.runs.length} runs</Badge>
      </div>
      <div className="break-all font-mono text-xs text-fg-faint">{projection.rootExecutionId}</div>
      <UsageDetails usage={projection.usage ?? []} label="主代理用量" />
      {projection.runs.map((run) => (
        <details key={run.run_id} className="mt-2 rounded-md border border-line bg-bg-elev p-3">
          <summary className="cursor-pointer text-sm">
            <Badge tone={run.status === "completed" ? "green" : run.status === "running" ? "accent" : "yellow"}>{run.status}</Badge>
            <span className="ml-2 font-mono text-xs">{run.child_id}</span>
            <span className="ml-2 text-xs text-fg-muted">{run.token_usage} tokens</span>
            {run.billing_status && <span className="ml-2 text-xs text-fg-faint">計費送訊：{run.billing_status}</span>}
          </summary>
          <div className="mt-2 break-all font-mono text-xs text-fg-faint">
            {run.run_id} · {run.model_id} / {run.provider_id}
            {run.parent_run_id && <div>↳ {run.parent_run_id}</div>}
          </div>
          {run.output && <Markdown text={run.output} className="mt-2 text-sm" />}
          {run.error && <p role="alert" className="mt-2 text-sm text-danger">{run.error}</p>}
          {run.status === "interrupted" && <p className="mt-2 text-xs text-fg-muted">執行擁有者已失效，未自動重播；外部操作結果可能不明，未承諾回滾。</p>}
          <UsageDetails usage={run.usage ?? []} label="Child 用量" />
          {historical && sessionId && <SavedRun sessionId={sessionId} run={run} />}
          {!historical && sessionId && <RunControls sessionId={sessionId} run={run} projection={projection} />}
          <CodeBlock text={JSON.stringify(projection.events[run.run_id] ?? [], null, 2)} maxHeight={240} className="mt-2" />
        </details>
      ))}
    </section>
  );
}

function UsageDetails({ usage, label }: { usage: ModelUsageView[]; label: string }) {
  if (!usage.length) return null;
  return <details className="mt-2 text-xs">
    <summary className="cursor-pointer text-fg-muted">{label}（{usage.length} 次模型請求）</summary>
    <div className="overflow-auto">
      <table className="mt-2 w-full text-left">
        <thead><tr><th>模型／Provider</th><th>Tokens／來源</th><th>計費 tokens</th><th>送訊狀態</th></tr></thead>
        <tbody>{usage.map((item) => <tr key={item.request_id}>
          <td className="p-1">{item.model_id}<br />{item.provider_id}</td>
          <td>{item.token_usage ?? "未知"} · {item.provenance}<br />
            <span className="text-fg-faint">輸入 {item.input_tokens ?? "未知"}／快取 {item.cached_input_tokens ?? "未知"}／輸出 {item.output_tokens ?? "未知"}</span></td>
          <td>{item.billable_tokens}<br />
            <span className="text-fg-faint">倍率 {item.input_billing_ratio}／{item.cached_input_billing_ratio}／{item.output_billing_ratio}</span></td>
          <td>{item.billing_status}<br /><span className="text-fg-faint">Provider 用量：{item.provider_usage_status}</span>
            <div className="break-all font-mono">{item.request_id}</div></td>
        </tr>)}</tbody>
      </table>
    </div>
  </details>;
}
function RunControls({ sessionId, run, projection }: {
  sessionId: string; run: SubagentRunView; projection: SubagentProjection;
}) {
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [last, setLast] = useState<{ id: string; kind: "input" | "cancel"; input?: string; status?: string }>();
  const [error, setError] = useState("");
  const submit = async (command: NonNullable<typeof last>) => {
    setPending(true);
    setLast(command);
    try {
      const result = await chatApi.controlSubagent(run.child_id, command.kind, {
        session_id: sessionId, root_execution_id: projection.rootExecutionId, run_id: run.run_id,
        command_id: command.id, ...(command.kind === "input" ? { input: command.input } : {}),
      });
      setLast({ ...command, status: result.status });
      setError("");
      setInput("");
    } catch (err) { setError(String(err)); }
    finally { setPending(false); }
  };
  const status = last && (projection.commands?.[last.id]?.status ?? last.status);
  return <div className="mt-2 space-y-2">
    {run.status === "running" && <div className="flex gap-2">
      <Input aria-label={`追加指令 ${run.run_id}`} placeholder="下一次迭代追加指令" value={input}
        maxLength={32000} onChange={(e) => setInput(e.target.value)} />
      <Button size="xs" disabled={pending || !input.trim()} onClick={() => void submit({
        id: crypto.randomUUID(), kind: "input", input: input.trim(),
      })}>追加</Button>
      <Button size="xs" variant="danger" disabled={pending} onClick={() => void submit({
        id: crypto.randomUUID(), kind: "cancel",
      })}>取消 child</Button>
    </div>}
    {last && <p aria-live="polite" className="break-all text-xs text-fg-muted">
      {last.id}：{status ?? "傳送中"}（accepted 為已接收，applied 為已套用）
    </p>}
    {error && <div role="alert" className="text-xs text-danger">{error}
      {last && run.status === "running" && <Button size="xs" disabled={pending} onClick={() => void submit(last)}>以同一識別碼重試</Button>}
    </div>}
  </div>;
}

function SavedRun({ sessionId, run }: { sessionId: string; run: SubagentRunView }) {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [task, setTask] = useState("");
  const [error, setError] = useState("");
  const sending = useChatStore((s) => s.sending);
  if (!run.history_available) return <p className="mt-2 text-xs text-fg-muted">保存政策禁止詳情與續用。</p>;
  const load = async () => {
    try {
      setMessages((await chatApi.subagentDetail(sessionId, run.child_id, run.run_id)).messages);
      setError("");
    } catch (err) { setError(String(err)); }
  };
  const resume = async () => {
    useChatStore.getState().setOptions({ subagentsEnabled: true });
    await useChatStore.getState().send(
      `請使用 subagent_resume 續用 child_id=${JSON.stringify(run.child_id)}，task=${JSON.stringify(task)}，收束後整合結果。`,
    );
    setTask("");
  };
  return <div className="mt-2 space-y-2">
    <Button size="xs" onClick={() => void load()}>載入獨立歷史</Button>
    {messages.map((msg, index) => <MessageItem key={msg.id || index} role={msg.role === "user" ? "user" : "assistant"}
      parts={partsFromUIMessage(msg)} />)}
    <div className="flex gap-2">
      <Input aria-label="續用子任務" placeholder="續用任務" value={task} onChange={(e) => setTask(e.target.value)} />
      <Button size="xs" disabled={sending || !task.trim()} onClick={() => void resume()}>經主代理續用</Button>
    </div>
    {error && <p role="alert" className="text-xs text-danger">{error}</p>}
  </div>;
}
