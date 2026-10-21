import test from "node:test";
import assert from "node:assert/strict";
import { applySseEvent } from "../src/stores/chatStore.ts";
import { liveUserIsInHistory, subagentHistoryRoot } from "../src/components/chat/chatDisplay.ts";

const initialTurn = () => ({
  id: "local-turn", sessionId: "session-1", query: "hello", attachments: [],
  status: "streaming", text: "", reasoning: "", currentStep: 0,
  toolCalls: [], startedAt: 1, rawEvents: [],
});

test("child text is isolated from parent text and repeated events do not duplicate the projection", () => {
  const run = { child_id: "child-1", run_id: "run-1", parent_run_id: null, status: "running",
    output: "", model_id: "model-1", provider_id: "provider-1", token_usage: 0 };
  let turn = applySseEvent(initialTurn(), { type: "data-subagent", data: {
    root_execution_id: "root-1", sequence: 1, kind: "state", run,
  } }, "started");
  const event = { type: "data-subagent", data: {
    root_execution_id: "root-1", sequence: 2, kind: "event", child_id: "child-1", run_id: "run-1",
    parent_run_id: null,
    event: { type: "text-delta", delta: "child only" },
  } };
  turn = applySseEvent(turn, event, JSON.stringify(event));
  turn = applySseEvent(turn, event, JSON.stringify(event));
  turn = applySseEvent(turn, { type: "text-delta", delta: "parent answer" }, "parent");
  assert.equal(turn.text, "parent answer");
  assert.equal(turn.subagents.runs.length, 1);
  assert.equal(turn.subagents.runs[0].output, "child only");
  assert.equal(turn.subagents.rootExecutionId, "root-1");
  assert.equal(turn.subagents.sequence, 2);
});

test("root snapshots replace child state, not parent output", () => {
  const turn = applySseEvent({ ...initialTurn(), text: "parent" }, {
    type: "data-subagent", data: { kind: "snapshot", root_execution_id: "root-2", sequence: 1, runs: [] },
  }, "snapshot");
  assert.equal(turn.text, "parent");
  assert.deepEqual(turn.subagents.runs, []);
});

test("history associates child trees with stable roots across changing assistant card IDs", () => {
  const original = { id: "mongo-before-recover", role: "assistant", parts: [], metadata: { root_execution_id: "root-1" } };
  assert.equal(subagentHistoryRoot(original), "root-1");
  assert.equal(subagentHistoryRoot({ ...original, id: "mongo-after-recover" }), "root-1");
  assert.equal(subagentHistoryRoot({ ...original, role: "user" }), undefined);
  assert.equal(subagentHistoryRoot({ ...original, metadata: {} }), undefined);
});

test("reconnecting a subagent root does not display the persisted user prompt twice", () => {
  const turn = { ...initialTurn(), subagents: { rootExecutionId: "root-active" } };
  const user = { id: "mongo-user", role: "user", parts: [{ type: "text", text: turn.query }],
    metadata: { root_execution_id: "root-active" } };
  assert.equal(liveUserIsInHistory(turn, [user]), true);
  assert.equal(liveUserIsInHistory(turn, [{ ...user, metadata: { root_execution_id: "root-older" } }]), false);
  assert.equal(liveUserIsInHistory(initialTurn(), [user]), false);
});

test("control acknowledgements remain applied when an older accepted frame replays", () => {
  let turn = initialTurn();
  const event = (sequence, status) => ({ type: "data-subagent", data: {
    root_execution_id: "root-1", sequence, kind: "control", run_id: "run-1", command_id: "cmd-1", status,
  } });
  turn = applySseEvent(turn, event(2, "applied"), "applied");
  turn = applySseEvent(turn, event(1, "accepted"), "accepted");
  assert.equal(turn.subagents.commands["cmd-1"].status, "applied");
  assert.equal(turn.text, "");
});

test("per-request usage is associated with its model and child without duplicating a replay", () => {
  const usage = { request_id: "request-1", model_id: "other-model", provider_id: "other-provider",
    model_name: "actual-mapping", token_usage: null, provenance: "unknown", billable_tokens: 0,
    input_tokens: null, cached_input_tokens: null, output_tokens: null, usage_source: null,
    input_billing_ratio: "7", cached_input_billing_ratio: "0.5", output_billing_ratio: "9",
    billing_status: "not_attempted", provider_usage_status: "not_attempted", receipt: {} };
  const run = { child_id: "child-1", run_id: "run-1", parent_run_id: null, status: "running",
    output: "", model_id: "other-model", provider_id: "other-provider", token_usage: 0 };
  let turn = applySseEvent(initialTurn(), { type: "data-subagent", data: {
    kind: "snapshot", root_execution_id: "root-1", sequence: 1, runs: [run], usage: [],
  } }, "snapshot");
  const event = { type: "data-subagent", data: { kind: "usage", root_execution_id: "root-1", sequence: 2,
    run_id: "run-1", usage } };
  turn = applySseEvent(turn, event, "usage");
  turn = applySseEvent(turn, event, "usage replay");
  assert.deepEqual(turn.subagents.runs[0].usage, [usage]);
  assert.deepEqual(turn.subagents.usage, []);
  assert.equal(turn.text, "");
  const measured = { ...usage, request_id: "request-2", token_usage: 10, provenance: "observed",
    billable_tokens: 70, billing_status: "confirmed" };
  turn = applySseEvent(turn, { type: "data-subagent", data: { kind: "usage", root_execution_id: "root-1", sequence: 3,
    run_id: "run-1", usage: measured } }, "measured usage");
  assert.equal(turn.subagents.runs[0].token_usage, 10);
  assert.equal(turn.subagents.runs[0].billing_status, "confirmed");
});
