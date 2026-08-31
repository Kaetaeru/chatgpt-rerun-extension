import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../conversation-limit.js", import.meta.url), "utf8");

function element(text = "", { authored = false, visible = true, disabled = false } = {}) {
  return {
    textContent: text,
    hidden: false,
    disabled,
    readOnly: false,
    getAttribute(name) {
      if (name === "aria-hidden") return null;
      if (name === "aria-disabled") return disabled ? "true" : null;
      return null;
    },
    hasAttribute() { return false; },
    getClientRects() { return visible ? [{}] : []; },
    closest(selector) {
      return authored && selector.includes("data-message-author-role") ? {} : null;
    }
  };
}

function makeHarness({
  bodyText = "",
  notice = null,
  composers = [],
  stopButtons = [],
  phase = "ready",
  enabled = true
} = {}) {
  let now = 0;
  let currentPhase = phase;
  let runtimeListener = null;
  const messages = [];
  const intervals = [];
  const document = {
    documentElement: {},
    body: { textContent: bodyText },
    querySelectorAll(selector) {
      if (selector.includes("#prompt-textarea") || selector.includes("textarea") || selector.includes("contenteditable")) {
        return composers;
      }
      if (selector.includes("stop-button") || selector.includes('aria-label*="Stop"') || selector.includes('aria-label*="stop"') || selector.includes('aria-label*="중지"')) {
        return stopButtons;
      }
      return notice ? [notice] : [];
    }
  };
  const context = {
    globalThis: {},
    document,
    MutationObserver: class { observe() {} },
    setInterval(callback) { intervals.push(callback); return 1; },
    Date: { now: () => now },
    chrome: {
      runtime: {
        onMessage: { addListener(listener) { runtimeListener = listener; } },
        async sendMessage(message) {
          messages.push(message);
          if (message.type === "GET_CURRENT_STATE") {
            return {
              ok: true,
              runtime: { enabled, runId: enabled ? "run-1" : null, status: enabled ? "running" : "idle", phase: currentPhase }
            };
          }
          if (message.type === "HANDOFF_NEW_CHAT") return { ok: true, handedOff: true };
          return { ok: true };
        }
      }
    }
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return {
    messages,
    intervals,
    setNow(value) { now = value; },
    setPhase(value) { currentPhase = value; },
    diagnose() {
      let response = null;
      runtimeListener({ type: "RERUN_V2_DIAGNOSE_CONVERSATION_END" }, {}, (value) => { response = value; });
      return response;
    },
    async flush() { await new Promise((resolve) => setImmediate(resolve)); }
  };
}

test("maximum-length notice triggers fresh-chat handoff even when a composer still exists", async () => {
  const text = "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
  const harness = makeHarness({ bodyText: text, notice: element(text), composers: [element("")] });
  await harness.flush();
  const handoff = harness.messages.find((message) => message.type === "HANDOFF_NEW_CHAT");
  assert.equal(handoff?.reason, "conversation_max_length");
});

test("maximum-length notice waits for generating result handling before handoff", async () => {
  const text = "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
  const harness = makeHarness({ bodyText: text, notice: element(text), composers: [element("")], phase: "generating" });
  await harness.flush();
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT"), false);
  harness.setPhase("ready");
  harness.intervals[0]();
  await harness.flush();
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT" && message.reason === "conversation_max_length"), true);
});

test("quoted maximum-length text inside a normal authored message does not trigger handoff", async () => {
  const text = "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
  const harness = makeHarness({ bodyText: text, notice: element(text, { authored: true }), composers: [element("")] });
  await harness.flush();
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT"), false);
});

test("ready state treats a persistently hidden composer as exhausted", async () => {
  const harness = makeHarness({ composers: [element("", { visible: false })] });
  await harness.flush();
  harness.setNow(6000);
  harness.intervals[0]();
  await harness.flush();
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT" && message.reason === "composer_unusable"), true);
});

test("missing composer during normal generation does not trigger handoff without a limit notice", async () => {
  const harness = makeHarness({ composers: [], phase: "generating" });
  await harness.flush();
  harness.setNow(10000);
  harness.intervals[0]();
  await harness.flush();
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT"), false);
});

test("manual diagnostic reports visible maximum-length notice as conversation end without handoff", async () => {
  const text = "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
  const harness = makeHarness({ bodyText: text, notice: element(text), composers: [element("")], enabled: false });
  await harness.flush();
  const response = harness.diagnose();
  assert.equal(response.ok, true);
  assert.equal(response.ended, true);
  assert.equal(response.reason, "visible_maximum_length_notice");
  assert.equal(response.evidence.visibleLimitNotice, true);
  assert.equal(harness.messages.some((message) => message.type === "HANDOFF_NEW_CHAT"), false);
});

test("manual diagnostic reports a usable composer as not ended", async () => {
  const harness = makeHarness({ composers: [element("")], enabled: false });
  await harness.flush();
  const response = harness.diagnose();
  assert.equal(response.ended, false);
  assert.equal(response.reason, "usable_composer");
  assert.equal(response.evidence.usableComposer, true);
});

test("manual diagnostic ignores quoted warning when a usable composer remains", async () => {
  const text = "You've reached the maximum length for this conversation, but you can keep talking by starting a new chat.";
  const harness = makeHarness({ bodyText: text, notice: element(text, { authored: true }), composers: [element("")], enabled: false });
  await harness.flush();
  const response = harness.diagnose();
  assert.equal(response.ended, false);
  assert.equal(response.reason, "usable_composer");
  assert.equal(response.evidence.bodyTextMatchesLimit, true);
  assert.equal(response.evidence.visibleLimitNotice, false);
});

test("manual diagnostic treats generation as not ended when composer is temporarily absent", async () => {
  const harness = makeHarness({ composers: [], stopButtons: [element("")], enabled: false });
  await harness.flush();
  const response = harness.diagnose();
  assert.equal(response.ended, false);
  assert.equal(response.reason, "generation_in_progress");
  assert.equal(response.evidence.generationActive, true);
});

test("manual diagnostic treats an idle tab with no usable composer as ended", async () => {
  const harness = makeHarness({ composers: [element("", { visible: false })], enabled: false });
  await harness.flush();
  const response = harness.diagnose();
  assert.equal(response.ended, true);
  assert.equal(response.reason, "no_usable_composer_while_idle");
  assert.equal(response.evidence.usableComposer, false);
});
