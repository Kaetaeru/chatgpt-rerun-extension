import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseConversationEndInPage } from "../conversation-diagnostic.js";

function element(text = "", { visible = true, disabled = false, authored = false, attrs = {} } = {}) {
  return {
    textContent: text,
    hidden: false,
    disabled,
    readOnly: false,
    getAttribute(name) {
      if (name === "aria-hidden") return null;
      if (name === "aria-disabled") return disabled ? "true" : null;
      return attrs[name] ?? null;
    },
    hasAttribute(name) { return Object.hasOwn(attrs, name); },
    getClientRects() { return visible ? [{}] : []; },
    closest(selector) {
      return authored && selector.includes("data-message-author-role") ? {} : null;
    }
  };
}

async function diagnose({ composers = [], stopButtons = [], controls = [], pathname = "/c/test" } = {}) {
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  globalThis.location = { pathname };
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector.startsWith("main ")) return controls;
      if (selector.includes("#prompt-textarea") || selector.includes("textarea") || selector.includes("contenteditable")) return composers;
      if (selector.includes("stop-button") || selector.includes('aria-label*="Stop"') || selector.includes('aria-label*="stop"') || selector.includes('aria-label*="중지"')) return stopButtons;
      return [];
    }
  };
  try {
    return await diagnoseConversationEndInPage();
  } finally {
    globalThis.document = previousDocument;
    globalThis.location = previousLocation;
  }
}

test("direct diagnostic reports a normal usable composer as not ended", async () => {
  const result = await diagnose({ composers: [element("")] });
  assert.equal(result.ended, false);
  assert.equal(result.reason, "usable_composer");
  assert.equal(result.evidence.usableComposer, true);
});

test("direct diagnostic reports explicit limit UI even if a composer remains", async () => {
  const control = element("This conversation has reached its maximum length. Start a new chat to continue.", {
    attrs: { role: "alert", "data-testid": "conversation-limit-notice" }
  });
  const result = await diagnose({ composers: [element("")], controls: [control] });
  assert.equal(result.ended, true);
  assert.equal(result.reason, "explicit_limit_ui");
  assert.match(result.evidence.explicitLimitSignal, /maximum length/i);
});

test("direct diagnostic recognizes a continue-in-new-chat CTA structurally", async () => {
  const control = element("Continue in a new chat", {
    attrs: { "data-testid": "continue-new-chat" }
  });
  const result = await diagnose({ controls: [control] });
  assert.equal(result.ended, true);
  assert.equal(result.reason, "continue_in_new_chat_ui");
  assert.match(result.evidence.continueNewChatSignal, /new chat/i);
});

test("direct diagnostic returns unknown instead of falsely calling a blank UI ended", async () => {
  const result = await diagnose({ composers: [], controls: [] });
  assert.equal(result.ended, null);
  assert.equal(result.reason, "no_usable_composer_without_known_end_signal");
  assert.equal(result.evidence.stableNoComposer, true);
});

test("direct diagnostic treats active generation as not ended", async () => {
  const result = await diagnose({ stopButtons: [element("Stop")] });
  assert.equal(result.ended, false);
  assert.equal(result.reason, "generation_in_progress");
  assert.equal(result.evidence.generationActive, true);
});
