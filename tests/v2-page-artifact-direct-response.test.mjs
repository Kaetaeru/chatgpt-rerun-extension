import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../page-artifact-reader.js", import.meta.url), "utf8");
const filename = "rerun-goal-33385ec6-61f4-4478-ada5-479eae5f27e7.json";
const goal = {
  version: 2,
  kind: "chatgpt-rerun-goal",
  setup_nonce: "33385ec6-61f4-4478-ada5-479eae5f27e7",
  goal_id: "33385ec6-61f4-4478-ada5-479eae5f27e7",
  repository: "Kaetaeru/SimpleVTT",
  branch: "work/v1-composite",
  goal: "Complete V1",
  acceptance: ["V1 complete"],
  authority: ["docs/roadmap/CURRENT.md"]
};

function response({ json, text, status = 200, url = "https://chatgpt.com/mock" }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    async json() { return structuredClone(json); },
    async text() { return text ?? JSON.stringify(json); }
  };
}

function makeHarness({ assistantText = "", downloadBody = goal } = {}) {
  const listeners = new Set();
  const posted = [];
  const assistantNodes = assistantText ? [{ textContent: assistantText, innerText: assistantText }] : [];

  const windowObject = {
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    postMessage(data) {
      posted.push(data);
      queueMicrotask(() => {
        for (const listener of [...listeners]) listener({ source: windowObject, data });
      });
    }
  };

  let fetchCount = 0;
  const context = {
    globalThis: null,
    window: windowObject,
    location: { pathname: "/c/conversation-1", origin: "https://chatgpt.com" },
    document: {
      querySelectorAll(selector) {
        return selector === '[data-message-author-role="assistant"]' ? assistantNodes : [];
      }
    },
    URL,
    URLSearchParams,
    TextEncoder,
    structuredClone,
    queueMicrotask,
    console,
    Set,
    Object,
    Array,
    Number,
    String,
    Boolean,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent,
    async fetch(path) {
      fetchCount += 1;
      if (path === "/api/auth/session") return response({ json: { accessToken: "token", account: { id: "acct" } } });
      if (String(path).startsWith("/backend-api/conversation/conversation-1?") || path === "/backend-api/conversation/conversation-1") {
        return response({
          json: {
            mapping: {
              node1: {
                message: {
                  id: "message-1",
                  create_time: 1,
                  content: { parts: [`Generated ${filename} at sandbox:/mnt/data/${filename}`] }
                }
              }
            }
          }
        });
      }
      if (String(path).includes("/interpreter/download?")) {
        return response({ json: downloadBody, text: JSON.stringify(downloadBody) });
      }
      return response({ json: {}, status: 404 });
    }
  };
  context.globalThis = context;
  return { context, posted, getFetchCount: () => fetchCount };
}

async function requestControl(harness) {
  vm.runInNewContext(source, harness.context);
  harness.context.window.postMessage({
    source: "chatgpt-rerun-v2-artifact-request",
    requestId: "request-1",
    expectedFilename: filename
  }, "*");
  await new Promise((resolve) => setTimeout(resolve, 30));
  return harness.posted.find((item) => item?.source === "chatgpt-rerun-v2-artifact-response");
}

test("interpreter download may return the JSON file body directly", async () => {
  const harness = makeHarness();
  const result = await requestControl(harness);
  assert.equal(result?.ok, true);
  assert.deepEqual(result?.value, goal);
  assert.ok(harness.getFetchCount() >= 3);
});

test("assistant inline control mirror bypasses the ChatGPT file API", async () => {
  const assistantText = [
    `Created ${filename}`,
    `RERUN_V2_CONTROL_BEGIN ${filename}`,
    JSON.stringify(goal),
    "RERUN_V2_CONTROL_END"
  ].join("\n");
  const harness = makeHarness({ assistantText });
  const result = await requestControl(harness);
  assert.equal(result?.ok, true);
  assert.deepEqual(result?.value, goal);
  assert.equal(harness.getFetchCount(), 0);
});
