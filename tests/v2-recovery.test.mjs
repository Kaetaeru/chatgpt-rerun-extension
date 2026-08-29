import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RUNTIME, tabConfigKey, tabRuntimeKey } from "../goal.js";

const data = new Map();
let onMessage = null;
let createdTabs = 0;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(listener) { onMessage = listener; } }
  },
  sidePanel: { async setPanelBehavior() {} },
  storage: {
    local: {
      async get(keys) {
        if (keys === null) return Object.fromEntries([...data].map(([key, value]) => [key, clone(value)]));
        const list = Array.isArray(keys) ? keys : [keys];
        return Object.fromEntries(list.filter((key) => data.has(key)).map((key) => [key, clone(data.get(key))]));
      },
      async set(values) {
        for (const [key, value] of Object.entries(values)) data.set(key, clone(value));
      },
      async remove(keys) {
        for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key);
      }
    }
  },
  tabs: {
    onRemoved: { addListener() {} },
    async sendMessage(_tabId, message) {
      if (message?.type === "RERUN_V2_PING") return { ready: true };
      if (message?.type === "RERUN_V2_WAKE") return { ready: true };
      return { sent: true };
    },
    async create() {
      createdTabs += 1;
      return { id: 2 };
    },
    async get() { return { status: "complete" }; }
  },
  scripting: { async executeScript() {} }
};

await import(`../background.js?test=${Date.now()}`);

function dispatch(type, tabId, extra = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 1000);
    onMessage({ type, ...extra }, { tab: { id: tabId } }, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function setRun(tabId, overrides = {}) {
  data.set(tabConfigKey(tabId), {
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    goal: "Test recovery",
    acceptance: "Tests pass",
    authorityPaths: "README.md"
  });
  data.set(tabRuntimeKey(tabId), {
    ...DEFAULT_RUNTIME,
    enabled: true,
    status: "running",
    phase: "generating",
    runId: "run-1",
    goalId: "goal-1",
    frozenPrompt: "FROZEN EXECUTOR",
    ...overrides
  });
}

test("non-consecutive stale result ids are rejected for the whole run", async () => {
  data.clear();
  setRun(1);

  const result = (resultId, status) => ({
    version: 2,
    kind: "chatgpt-rerun-result",
    goal_id: "goal-1",
    result_id: resultId,
    status,
    checkpoint: `checkpoint-${resultId}`
  });

  assert.equal((await dispatch("REPORT_RESULT_FILE", 1, { value: result("A", "CONTINUE") })).ok, true);
  data.get(tabRuntimeKey(1)).phase = "generating";
  assert.equal((await dispatch("REPORT_RESULT_FILE", 1, { value: result("B", "CONTINUE") })).ok, true);
  data.get(tabRuntimeKey(1)).phase = "generating";

  const replay = await dispatch("REPORT_RESULT_FILE", 1, { value: result("A", "COMPLETE") });
  assert.equal(replay.ok, true);
  assert.equal(replay.ignored, true);
  const runtime = data.get(tabRuntimeKey(1));
  assert.equal(runtime.lastResultId, "B");
  assert.equal(runtime.status, "running");
  assert.deepEqual(runtime.processedResultIds, ["A", "B"]);
});

test("fresh-chat handoff happens once and injects checkpoint only on the first dispatch", async () => {
  data.clear();
  createdTabs = 0;
  setRun(1, { phase: "ready", lastCheckpoint: "verified checkpoint" });

  const handoff = await dispatch("HANDOFF_NEW_CHAT", 1);
  assert.equal(handoff.ok, true);
  assert.equal(handoff.handedOff, true);
  assert.equal(createdTabs, 1);

  const transferred = data.get(tabRuntimeKey(2));
  assert.equal(transferred.handoffUsed, true);
  assert.equal(transferred.resumeCapsulePending, true);

  const firstClaim = await dispatch("CLAIM_EXECUTION", 2);
  assert.match(firstClaim.prompt, /FRESH-CHAT RESUME CAPSULE/);
  assert.match(firstClaim.prompt, /verified checkpoint/);
  await dispatch("ACK_DISPATCH", 2);
  assert.equal(data.get(tabRuntimeKey(2)).resumeCapsulePending, false);

  await dispatch("REPORT_INTERRUPTED", 2, { reason: "test" });
  const secondClaim = await dispatch("CLAIM_EXECUTION", 2);
  assert.equal(secondClaim.prompt, "FROZEN EXECUTOR");
  await dispatch("RELEASE_EXECUTION", 2, { reason: "test" });

  const secondHandoff = await dispatch("HANDOFF_NEW_CHAT", 2);
  assert.equal(secondHandoff.ok, true);
  assert.equal(secondHandoff.handedOff, false);
  assert.equal(secondHandoff.reason, "handoff_already_used");
  assert.equal(createdTabs, 1);
  assert.equal(data.get(tabRuntimeKey(2)).status, "needs_user");
  assert.equal(data.get(tabRuntimeKey(2)).phase, "paused");
});
