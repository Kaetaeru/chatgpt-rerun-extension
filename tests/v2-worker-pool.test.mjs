import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RUNTIME, poolStateKey, tabConfigKey, tabRuntimeKey } from "../goal.js";

const data = new Map();
const createdTabs = [];
const removedTabs = [];
const focusedTabs = [];
const directPrompts = [];
const tabsById = new Map();
const removedListeners = [];
let onMessage = null;
let nextTabId = 10;

function clone(value) { return value === undefined ? undefined : structuredClone(value); }

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
      async set(values) { for (const [key, value] of Object.entries(values)) data.set(key, clone(value)); },
      async remove(keys) { for (const key of Array.isArray(keys) ? keys : [keys]) data.delete(key); }
    }
  },
  tabs: {
    onRemoved: { addListener(listener) { removedListeners.push(listener); } },
    async sendMessage(tabId, message) {
      if (message?.type === "RERUN_V2_PING") return { ready: true };
      if (message?.type === "RERUN_V2_WAKE") return { ready: true };
      if (message?.type === "RERUN_V2_SEND_DIRECT") {
        directPrompts.push({ tabId, prompt: message.prompt });
        const tab = tabsById.get(tabId);
        if (tab && /^https:\/\/chatgpt\.com\/?$/.test(tab.url)) tab.url = `https://chatgpt.com/c/worker-${tabId}`;
        return { sent: true };
      }
      return { sent: true };
    },
    async create(options) {
      const tab = { id: nextTabId++, status: "complete", discarded: false, ...options };
      createdTabs.push(tab);
      tabsById.set(tab.id, tab);
      return tab;
    },
    async get(tabId) {
      const tab = tabsById.get(tabId);
      if (!tab) throw new Error(`No tab ${tabId}`);
      return { ...tab };
    },
    async update(tabId, options) {
      if (!tabsById.has(tabId)) throw new Error(`No tab ${tabId}`);
      if (options?.active) focusedTabs.push(tabId);
      Object.assign(tabsById.get(tabId), options);
      return { ...tabsById.get(tabId) };
    },
    async remove(tabIds) {
      for (const tabId of Array.isArray(tabIds) ? tabIds : [tabIds]) {
        if (!tabsById.has(tabId)) continue;
        tabsById.delete(tabId);
        removedTabs.push(tabId);
        for (const listener of removedListeners) listener(tabId);
      }
    }
  },
  scripting: { async executeScript() {} }
};

await import(`../background.js?pool-test=${Date.now()}`);

function dispatch(type, extra = {}, tabId = null) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${type}`)), 2500);
    const sender = tabId === null ? {} : { tab: { id: tabId } };
    onMessage({ type, ...extra }, sender, (response) => { clearTimeout(timer); resolve(response); });
  });
}

function goalValue() {
  return { version:2,kind:"chatgpt-rerun-goal",setup_nonce:"goal-1",goal_id:"goal-1",repository:"Kaetaeru/chatgpt-rerun-extension",branch:"agent/v2-goal-runner",goal:"Finish worker pool",acceptance:["Tests pass"],authority:["README.md"] };
}
function readyValue(pool, worker) {
  return { version:2,kind:"chatgpt-rerun-worker-ready",run_id:pool.runId,goal_id:pool.goalId,worker_index:worker.index+1,worker_nonce:worker.nonce,repository:pool.config.repository,branch:pool.config.branch,status:"READY" };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("ready standby workers are parked and reopened from their approved conversations on handoff", async () => {
  data.clear(); createdTabs.length=0; removedTabs.length=0; focusedTabs.length=0; directPrompts.length=0; tabsById.clear(); nextTabId=10;
  data.set(tabConfigKey(1), {});
  data.set(tabRuntimeKey(1), { ...DEFAULT_RUNTIME, status:"goal_setup", phase:"awaiting_goal_file", setupNonce:"goal-1", setupPending:true });

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
  assert.ok(directPrompts.every(({ prompt }) => /GitHub WRITE capability/.test(prompt)));

  const poolBeforeReady = data.get(poolStateKey(runId));
  const [worker1, worker2] = poolBeforeReady.workers;
  assert.equal(data.get(tabRuntimeKey(worker1.tabId)).phase, "worker_preflight");
  assert.equal(data.get(tabRuntimeKey(worker2.tabId)).phase, "worker_preflight");
  assert.equal(tabsById.get(worker1.tabId).url, `https://chatgpt.com/c/worker-${worker1.tabId}`);
  assert.equal(tabsById.get(worker2.tabId).url, `https://chatgpt.com/c/worker-${worker2.tabId}`);

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
  assert.equal((await dispatch("REPORT_WORKER_READY", { value: readyValue(poolAfterFirst, worker2) }, worker2.tabId)).ok, true);

  await sleep(650);
  let runningPool = data.get(poolStateKey(runId));
  assert.equal(runningPool.status, "running");
  assert.equal(runningPool.activeWorkerIndex, 0);
  const parkedWorker2 = runningPool.workers.find((item) => item.index === 1);
  assert.equal(runningPool.workers[0].status, "active");
  assert.equal(parkedWorker2.status, "ready");
  assert.equal(parkedWorker2.tabId, null);
  assert.equal(parkedWorker2.conversationUrl, `https://chatgpt.com/c/worker-${worker2.tabId}`);
  assert.ok(removedTabs.includes(worker2.tabId));
  assert.equal(data.has(tabRuntimeKey(worker2.tabId)), false);

  const result = { version:2,kind:"chatgpt-rerun-result",goal_id:"goal-1",result_id:"result-1",status:"CONTINUE",checkpoint:"worker one checkpoint" };
  assert.equal((await dispatch("REPORT_RESULT_FILE", { value: result }, worker1.tabId)).ok, true);

  const tabCountBeforeHandoff = createdTabs.length;
  const handoff = await dispatch("HANDOFF_NEW_CHAT", { reason:"conversation_max_length" }, worker1.tabId);
  assert.equal(handoff.ok, true);
  assert.equal(handoff.handedOff, true);
  assert.equal(createdTabs.length, tabCountBeforeHandoff + 1);
  assert.notEqual(handoff.newTabId, worker2.tabId);
  assert.equal(tabsById.get(handoff.newTabId).url, parkedWorker2.conversationUrl);

  runningPool = data.get(poolStateKey(runId));
  const activeWorker2 = runningPool.workers.find((item) => item.index === 1);
  assert.equal(activeWorker2.status, "active");
  assert.equal(activeWorker2.tabId, handoff.newTabId);
  const worker2Runtime = data.get(tabRuntimeKey(handoff.newTabId));
  assert.equal(worker2Runtime.workerReady, true);
  assert.equal(worker2Runtime.status, "running");
  assert.equal(worker2Runtime.phase, "ready");
  assert.equal(worker2Runtime.lastCheckpoint, "worker one checkpoint");
  assert.equal(worker2Runtime.resumeCapsulePending, true);
  assert.deepEqual(worker2Runtime.processedResultIds, ["result-1"]);

  const claim = await dispatch("CLAIM_EXECUTION", {}, handoff.newTabId);
  assert.equal(claim.ok, true);
  assert.match(claim.prompt, /FRESH-CHAT RESUME CAPSULE/);
  assert.match(claim.prompt, /worker one checkpoint/);

  await sleep(650);
  runningPool = data.get(poolStateKey(runId));
  const spentWorker1 = runningPool.workers.find((item) => item.index === 0);
  assert.equal(spentWorker1.status, "spent");
  assert.equal(spentWorker1.tabId, null);
  assert.ok(removedTabs.includes(worker1.tabId));
  assert.equal(tabsById.has(handoff.newTabId), true);
  assert.ok(focusedTabs.includes(handoff.newTabId));
});
