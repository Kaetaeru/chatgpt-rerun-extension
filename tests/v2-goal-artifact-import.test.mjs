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

test("stale pre-reload guard does not block direct goal JSON import and stale unallocated pools are retired", async () => {
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
      workers: [{ index: 0, tabId: 99, status: "active" }],
      config: {
        repository: "Kaetaeru/chatgpt-rerun-extension",
        branch: "agent/v2-goal-runner"
      }
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

  assert.equal(context.__CHATGPT_RERUN_V2_ARTIFACT_READER__, "goal-import-stale-pool-20260901");
  assert.equal(imports.length, 1);
  assert.equal(imports[0].goal_id, "goal-1");
  assert.equal(stored["v2:pool:stale-run"].status, "stopped");
  assert.match(stored["v2:pool:stale-run"].lastError, /Superseded/);
  assert.equal(stored["v2:pool:active-run"].status, "running");
});
