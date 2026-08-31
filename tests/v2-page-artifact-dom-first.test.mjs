import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../page-artifact-reader.js", import.meta.url), "utf8");
const filename = "rerun-goal-abc-123.json";
const goal = {
  version: 2,
  kind: "chatgpt-rerun-goal",
  setup_nonce: "abc-123",
  goal_id: "abc-123",
  repository: "Kaetaeru/SimpleVTT",
  branch: "work/v1-composite",
  goal: "Complete V1",
  acceptance: ["done"],
  authority: ["docs/CURRENT.md"]
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

function element({ text = "", attrs = {}, children = [] } = {}) {
  const node = {
    textContent: text,
    innerText: text,
    parentElement: null,
    attributes: Object.entries(attrs).map(([name, value]) => ({ name, value })),
    querySelectorAll() {
      const out = [];
      const visit = (value) => {
        for (const child of value.children || []) {
          out.push(child);
          visit(child);
        }
      };
      visit(node);
      return out;
    },
    children
  };
  for (const child of children) child.parentElement = node;
  return node;
}

function makeHarness({ turn = null, conversationStatus = 200 } = {}) {
  const listeners = new Set();
  const posted = [];
  let conversationFetches = 0;
  let fileFetches = 0;
  const windowObject = {
    addEventListener(type, listener) { if (type === "message") listeners.add(listener); },
    postMessage(data) {
      posted.push(data);
      queueMicrotask(() => {
        for (const listener of [...listeners]) listener({ source: windowObject, data });
      });
    }
  };
  const context = {
    globalThis: null,
    window: windowObject,
    location: { pathname: "/c/conversation-1", origin: "https://chatgpt.com" },
    document: {
      querySelectorAll(selector) {
        if (selector === '[data-message-author-role="assistant"]') return turn ? [turn] : [];
        return [];
      }
    },
    URL,
    URLSearchParams,
    TextEncoder,
    structuredClone,
    queueMicrotask,
    console,
    Date,
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
      const value = String(path);
      if (value === "/api/auth/session") return response({ json: { accessToken: "token", account: { id: "acct" } } });
      if (value.includes("/backend-api/files/download/file_dom_123")) {
        fileFetches += 1;
        return response({ json: goal, text: JSON.stringify(goal) });
      }
      if (value === "/backend-api/conversation/conversation-1") {
        conversationFetches += 1;
        return response({ json: { mapping: {} }, status: conversationStatus });
      }
      return response({ json: {}, status: 404 });
    }
  };
  context.globalThis = context;
  return { context, posted, counts: () => ({ conversationFetches, fileFetches }) };
}

async function request(harness, requestId) {
  if (!harness.context.__loaded) {
    vm.runInNewContext(source, harness.context);
    harness.context.__loaded = true;
  }
  harness.context.window.postMessage({
    source: "chatgpt-rerun-v2-artifact-request",
    requestId,
    expectedFilename: filename
  }, "*");
  await new Promise((resolve) => setTimeout(resolve, 30));
  return harness.posted.find((item) => item?.source === "chatgpt-rerun-v2-artifact-response" && item.requestId === requestId);
}

test("rendered file card file_id bypasses conversation API", async () => {
  const card = element({
    text: filename,
    attrs: { "data-file-id": "file_dom_123", "data-filename": filename }
  });
  const turn = element({ text: `Created ${filename}`, children: [card] });
  const harness = makeHarness({ turn });
  const result = await request(harness, "r1");
  assert.equal(result?.ok, true);
  assert.equal(JSON.stringify(result?.value), JSON.stringify(goal));
  assert.deepEqual(harness.counts(), { conversationFetches: 0, fileFetches: 1 });
});

test("conversation 429 is cooled down instead of hammered on every scan", async () => {
  const harness = makeHarness({ conversationStatus: 429 });
  const first = await request(harness, "r1");
  const second = await request(harness, "r2");
  assert.equal(first?.ok, false);
  assert.match(first?.error || "", /conversation_fetch_429_rate_limited/);
  assert.equal(second?.ok, false);
  assert.match(second?.error || "", /conversation_fetch_rate_limited_wait_/);
  assert.equal(harness.counts().conversationFetches, 1);
});
