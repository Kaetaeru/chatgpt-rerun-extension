import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../artifact-reader.js", import.meta.url), "utf8");

function goalValue() {
  return {
    version: 2,
    kind: "chatgpt-rerun-goal",
    setup_nonce: "goal-1",
    goal_id: "goal-1",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    goal: "Verify goal import",
    acceptance: ["Goal JSON imports"],
    authority: ["README.md"]
  };
}

function workerReadyValue() {
  return {
    version: 2,
    kind: "chatgpt-rerun-worker-ready",
    run_id: "run-1",
    goal_id: "goal-1",
    worker_index: 2,
    worker_nonce: "worker-2",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    status: "READY"
  };
}

test("valid newer goal supersedes older same-target pools and runtimes before direct import", async () => {
  let runtime = {
    phase: "awaiting_goal_file",
    setupPending: true,
    setupNonce: "goal-1",
    goalId: null,
    processedResultIds: []
  };
  const imports = [];
  const stored = {
    "v2:pool:stale-run": {
      runId: "stale-run",
      goalId: "old-goal",
      status: "awaiting_worker_count",
      workers: [],
      config: {
        repository: "Kaetaeru/chatgpt-rerun-extension",
        branch: "agent/v2-goal-runner"
      }
    },
    "v2:pool:active-run": {
      runId: "active-run",
      goalId: "active-goal",
      status: "running",
      activeWorkerIndex: 0,
      workers: [{ index: 0, tabId: 99, status: "active" }],
      config: {
        repository: "Kaetaeru/chatgpt-rerun-extension",
        branch: "agent/v2-goal-runner"
      }
    },
    "v2:config:99": {
      repository: "Kaetaeru/chatgpt-rerun-extension",
      branch: "agent/v2-goal-runner"
    },
    "v2:runtime:99": {
      enabled: true,
      status: "running",
      phase: "generating",
      runId: "active-run",
      poolRunId: "active-run",
      workerReady: true,
      workerIndex: 0
    },
    "v2:pool:other-run": {
      runId: "other-run",
      goalId: "other-goal",
      status: "running",
      activeWorkerIndex: 0,
      workers: [{ index: 0, tabId: 100, status: "active" }],
      config: {
        repository: "Kaetaeru/OtherRepo",
        branch: "main"
      }
    },
    "v2:config:100": {
      repository: "Kaetaeru/OtherRepo",
      branch: "main"
    },
    "v2:runtime:100": {
      enabled: true,
      status: "running",
      phase: "generating",
      runId: "other-run",
      poolRunId: "other-run",
      workerReady: true,
      workerIndex: 0
    }
  };
  const messageListeners = new Set();
  const windowObject = {
    addEventListener(type, listener) {
      if (type === "message") messageListeners.add(listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") messageListeners.delete(listener);
    },
    postMessage(data) {
      if (data?.source !== "chatgpt-rerun-v2-artifact-request") return;
      queueMicrotask(() => {
        for (const listener of [...messageListeners]) {
          listener({
            source: windowObject,
            data: {
              source: "chatgpt-rerun-v2-artifact-response",
              requestId: data.requestId,
              ok: true,
              value: goalValue()
            }
          });
        }
      });
    }
  };

  const context = {
    globalThis: null,
    __CHATGPT_RERUN_V2_ARTIFACT_READER__: true,
    window: windowObject,
    document: {
      hidden: false,
      addEventListener() {},
      documentElement: { appendChild() {} },
      querySelector() { return null; },
      createElement() { return { hidden: false, setAttribute() {} }; }
    },
    MutationObserver: class { observe() {} },
    setInterval() { return 1; },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Date,
    crypto: { randomUUID: () => "request-1" },
    Blob,
    URL,
    console,
    chrome: {
      runtime: {
        async sendMessage(message) {
          if (message.type === "REGISTER_CHAT_TAB") return { ok: true, tabId: 7 };
          if (message.type === "GET_CURRENT_STATE") return { ok: true, runtime };
          if (message.type === "IMPORT_GOAL_FILE") {
            imports.push(message.value);
            runtime = { ...runtime, phase: "awaiting_worker_count", goalId: "goal-1", setupPending: false };
            return { ok: true };
          }
          return { ok: true };
        }
      },
      storage: {
        local: {
          async get(keys) {
            if (keys === null) return structuredClone(stored);
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.filter((key) => key in stored).map((key) => [key, structuredClone(stored[key])]));
          },
          async set(values) {
            for (const [key, value] of Object.entries(values)) stored[key] = structuredClone(value);
          }
        }
      }
    }
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(context.__CHATGPT_RERUN_V2_ARTIFACT_READER__, "goal-supersede-v229-20260901");
  assert.equal(imports.length, 1);
  assert.equal(imports[0].goal_id, "goal-1");

  assert.equal(stored["v2:pool:stale-run"].status, "stopped");
  assert.equal(stored["v2:pool:active-run"].status, "stopped");
  assert.equal(stored["v2:pool:active-run"].workers[0].status, "stopped");
  assert.equal(stored["v2:pool:active-run"].supersededByGoalId, "goal-1");
  assert.match(stored["v2:pool:active-run"].lastError, /Superseded by newer Goal goal-1/);

  assert.equal(stored["v2:runtime:99"].enabled, false);
  assert.equal(stored["v2:runtime:99"].status, "stopped");
  assert.equal(stored["v2:runtime:99"].phase, "idle");
  assert.equal(stored["v2:runtime:99"].poolRunId, null);
  assert.equal(stored["v2:runtime:99"].workerReady, false);

  assert.equal(stored["v2:pool:other-run"].status, "running");
  assert.equal(stored["v2:runtime:100"].enabled, true);
});

test("worker-ready JSON imports directly and activation forces an immediate scan", async () => {
  let runtime = {
    phase: "worker_preflight",
    goalId: "goal-1",
    workerIndex: 1,
    workerNonce: "worker-2",
    workerReady: false,
    processedResultIds: []
  };
  const reports = [];
  const messageListeners = new Set();
  const windowListeners = new Map();
  const documentListeners = new Map();
  let bridgeAttempts = 0;

  const windowObject = {
    addEventListener(type, listener) {
      if (type === "message") messageListeners.add(listener);
      else windowListeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (type === "message") messageListeners.delete(listener);
      else if (windowListeners.get(type) === listener) windowListeners.delete(type);
    },
    postMessage(data) {
      if (data?.source !== "chatgpt-rerun-v2-artifact-request") return;
      bridgeAttempts += 1;
      const attempt = bridgeAttempts;
      queueMicrotask(() => {
        for (const listener of [...messageListeners]) {
          listener({
            source: windowObject,
            data: attempt === 1
              ? {
                  source: "chatgpt-rerun-v2-artifact-response",
                  requestId: data.requestId,
                  ok: false,
                  error: "artifact_message_not_found"
                }
              : {
                  source: "chatgpt-rerun-v2-artifact-response",
                  requestId: data.requestId,
                  ok: true,
                  value: workerReadyValue()
                }
          });
        }
      });
    }
  };

  const context = {
    globalThis: null,
    window: windowObject,
    document: {
      hidden: true,
      addEventListener(type, listener) { documentListeners.set(type, listener); },
      documentElement: { appendChild() {} },
      querySelector() { return null; },
      createElement() { return { hidden: false, setAttribute() {} }; }
    },
    MutationObserver: class { observe() {} },
    setInterval() { return 1; },
    setTimeout,
    clearTimeout,
    queueMicrotask,
    Date,
    crypto: { randomUUID: () => `request-${bridgeAttempts + 1}` },
    Blob,
    URL,
    console,
    chrome: {
      runtime: {
        async sendMessage(message) {
          if (message.type === "REGISTER_CHAT_TAB") return { ok: true, tabId: 8 };
          if (message.type === "GET_CURRENT_STATE") return { ok: true, runtime };
          if (message.type === "REPORT_WORKER_READY") {
            reports.push(message.value);
            runtime = { ...runtime, phase: "standby", workerReady: true };
            return { ok: true };
          }
          return { ok: true };
        }
      },
      storage: { local: { async get() { return {}; }, async set() {} } }
    }
  };
  context.globalThis = context;

  vm.runInNewContext(source, context);
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(bridgeAttempts, 1);
  assert.equal(reports.length, 0);

  context.document.hidden = false;
  documentListeners.get("visibilitychange")();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(bridgeAttempts, 2);
  assert.equal(reports.length, 1);
  assert.equal(reports[0].worker_index, 2);
  assert.equal(runtime.workerReady, true);
});