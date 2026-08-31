import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RUNTIME, poolStateKey, tabConfigKey, tabRuntimeKey } from "../goal.js";

const data = new Map();
const createdTabs = [];
const focusedTabs = [];
const directPrompts = [];
let onMessage = null;
let nextTabId = 10;

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

globalThis.chrome = {
  runtime: {
    onInstalled: { addListener() {} },
    onMessage: { addListener(listener) { onMessage = listener; } },
    getURL(path) { return `chrome-extension://test/${path}`; }
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
    async sendMessage(tabId, message) {
      if (message?.type === "RERUN_V2_PING") return { ready: true };
      if (message?.type === "RERUN_V2_WAKE") return { ready: true };
      if (message?.type === "RERUN_V2_SEND_DIRECT") {
        directPrompts.push({ tabId, prompt: message.prompt });
        return { sent: true };
      }
      return { sent: true };
    },
    async create(options) {
      const tab = { id: nextTabId++, status: "complete", ...options };
      createdTabs.push(tab);
      return tab;
    },
    async get(tabId) { return { id: tabId, status: "complete" }; },
    async update(tabId, options) {
      if (options?.active) focusedTabs.push(tabId);
      return { id: tabId, ...options };
    }
  },
  scripting: { async executeScript() {} }
};

await import(`../background.js?pool-test=${Date.now()}`);

function dispatch(type, extra = {}, tabId = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 2000);
    const sender = tabId === null ? {} : { tab: { id: tabId } };
    onMessage({ type, ...extra }, sender, (response) => {
      clearTimeout(timer);
      resolve(response);
    });
  });
}

function goalValue() {
  return {
    version: 2,
    kind: "chatgpt-rerun-goal",
    setup_nonce: "goal-1",
    goal_id: "goal-1",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    goal: "Finish worker pool",
    acceptance: ["Tests pass"],
    authority: ["README.md"]
  };
}

function readyValue(pool, worker) {
  return {
    version: 2,
    kind: "chatgpt-rerun-worker-ready",
    run_id: pool.runId,
    goal_id: pool.goalId,
    worker_index: worker.index + 1,
    worker_nonce: worker.nonce,
    repository: pool.config.repository,
    branch: pool.config.branch,
    status: "READY"
  };
}

test("goal import opens allocation UI, preflights every worker, and advances only through approved workers", async () => {
  data.clear();
  createdTabs.length = 0;
  focusedTabs.length = 0;
  directPrompts.length = 0;
  nextTabId = 10;

  data.set(tabConfigKey(1), {});
  data.set(tabRuntimeKey(1), {
    ...DEFAULT_RUNTIME,
    status: "goal_setup",
    phase: "awaiting_goal_file",
    setupNonce: "goal-1",
    setupPending: true
  });

  const imported = await dispatch("IMPORT_GOAL_FILE", { value: goalValue() }, 1);
  assert.equal(imported.ok, true);
  assert.equal(imported.runtime.enabled, false);
  assert.equal(imported.runtime.phase, "awaiting_worker_count");
  assert.equal(createdTabs.length, 1);
  assert.match(createdTabs[0].url, /pool-setup\.html\?runId=/);

  const runId = imported.pool.runId;
  const created = await dispatch("CREATE_WORKER_POOL", { runId, workerCount: 2 });
  assert.equal(created.ok, true);
  assert.equal(created.pool.status, "awaiting_worker_ready");
  assert.equal(created.pool.workers.length, 2);
  assert.equal(createdTabs.length, 3);
  assert.equal(directPrompts.length, 2);
  assert.ok(directPrompts.every(({ prompt }) => /Do NOT start the Goal Runner goal yet/.test(prompt)));
  assert.ok(directPrompts.every(({ prompt }) => /GitHub/.test(prompt)));

  const poolBeforeReady = data.get(poolStateKey(runId));
  const [worker1, worker2] = poolBeforeReady.workers;
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).phase, "worker_preflight");
  assert.equal(data.get(tabRuntimeKey(worker2.tabId)).phase, "worker_preflight");

  data.set(poolStateKey(runId), { ...poolBeforeReady, status: "provisioning" });
  const prematureReady = await dispatch("REPORT_WORKER_READY", { value: readyValue(poolBeforeReady, worker1) }, worker1.tabId);
  assert.equal(prematureReady.ok, false);
  assert.match(prematureReady.error, /not ready to accept preflight reports/i);
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).phase, "worker_preflight");
  data.set(poolStateKey(runId), poolBeforeReady);

  const firstReady = await dispatch("REPORT_WORKER_READY", { value: readyValue(poolBeforeReady, worker1) }, worker1.tabId);
  assert.equal(firstReady.ok, true);
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).phase, "standby");
  assert.equal(data.get(poolStateKey(runId)).status, "awaiting_worker_ready");

  const poolAfterFirst = data.get(poolStateKey(runId));
  const secondReady = await dispatch("REPORT_WORKER_READY", { value: readyValue(poolAfterFirst, worker2) }, worker2.tabId);
  assert.equal(secondReady.ok, true);

  const runningPool = data.get(poolStateKey(runId));
  assert.equal(runningPool.status, "running");
  assert.equal(runningPool.activeWorkerIndex, 0);
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).status, "running");
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).phase, "ready");
  assert.equal(data.get(tabRuntimeKey(worker2.tabId)).status, "standby");

  const result = {
    version: 2,
    kind: "chatgpt-rerun-result",
    goal_id: "goal-1",
    result_id: "result-1",
    status: "CONTINUE",
    checkpoint: "worker one checkpoint"
  };
  assert.equal((await dispatch("REPORT_RESULT_FILE", { value: result }, worker1.tabId)).ok, true);

  const tabCountBeforeHandoff = createdTabs.length;
  const handoff = await dispatch("HANDOFF_NEW_CHAT", { reason: "conversation_max_length" }, worker1.tabId);
  assert.equal(handoff.ok, true);
  assert.equal(handoff.handedOff, true);
  assert.equal(handoff.newTabId, worker2.tabId);
  assert.equal(createdTabs.length, tabCountBeforeHandoff);

  const worker2Runtime = data.get(tabRuntimeKey(worker2.tabId));
  assert.equal(worker2Runtime.status, "running");
  assert.equal(worker2Runtime.phase, "ready");
  assert.equal(worker2Runtime.lastCheckpoint, "worker one checkpoint");
  assert.equal(worker2Runtime.resumeCapsulePending, true);
  assert.deepEqual(worker2Runtime.processedResultIds, ["result-1"]);

  const claim = await dispatch("CLAIM_EXECUTION", {}, worker2.tabId);
  assert.equal(claim.ok, true);
  assert.match(claim.prompt, /FRESH-CHAT RESUME CAPSULE/);
  assert.match(claim.prompt, /worker one checkpoint/);
  assert.ok(focusedTabs.includes(worker2.tabId));
});
