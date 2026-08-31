import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../artifact-reader.js", import.meta.url), "utf8");

const expectedFilename = "rerun-worker-ready-goal-1-2-worker-2.json";

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

test("worker-ready DOM arrival during an in-flight miss bypasses retry backoff", async () => {
  let runtime = {
    phase: "worker_preflight",
    goalId: "goal-1",
    workerIndex: 1,
    workerNonce: "worker-2",
    workerReady: false,
    processedResultIds: []
  };
  let observerCallback = null;
  let bridgeAttempts = 0;
  let releaseFirstAttempt = null;
  const reports = [];
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
      bridgeAttempts += 1;
      const requestId = data.requestId;
      const respond = (payload) => {
        for (const listener of [...messageListeners]) {
          listener({
            source: windowObject,
            data: {
              source: "chatgpt-rerun-v2-artifact-response",
              requestId,
              ...payload
            }
          });
        }
      };
      if (bridgeAttempts === 1) {
        releaseFirstAttempt = () => respond({ ok: false, error: "artifact_message_not_found" });
        return;
      }
      queueMicrotask(() => respond({ ok: true, value: workerReadyValue() }));
    }
  };

  const context = {
    globalThis: null,
    window: windowObject,
    document: {
      hidden: true,
      addEventListener() {},
      documentElement: { appendChild() {} },
      querySelector() { return null; },
      createElement() { return { hidden: false, setAttribute() {} }; }
    },
    MutationObserver: class {
      constructor(callback) { observerCallback = callback; }
      observe() {}
    },
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
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.equal(bridgeAttempts, 1);
  assert.equal(reports.length, 0);
  assert.equal(typeof observerCallback, "function");
  assert.equal(typeof releaseFirstAttempt, "function");

  observerCallback([{
    target: { textContent: expectedFilename },
    addedNodes: []
  }]);
  releaseFirstAttempt();

  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(bridgeAttempts, 2, "artifact arrival must trigger a second API read immediately instead of waiting 2.5 seconds");
  assert.equal(reports.length, 1);
  assert.equal(reports[0].worker_index, 2);
  assert.equal(runtime.workerReady, true);
});
