import test from "node:test";
import assert from "node:assert/strict";
import { diagnoseConversationEndInPage } from "../conversation-diagnostic.js";

function element(text = "", { visible = true, disabled = false, authored = false, attrs = {}, parent = null } = {}) {
  return {
    textContent: text,
    hidden: false,
    disabled,
    readOnly: false,
    parentElement: parent,
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

async function diagnose({ composers = [], stopButtons = [], controls = [], pageButtons = [], limitTextNodes = [], pathname = "/c/test" } = {}) {
  const previousDocument = globalThis.document;
  const previousLocation = globalThis.location;
  globalThis.location = { pathname };
  globalThis.document = {
    querySelectorAll(selector) {
      if (selector === 'button, a[href], [role="button"]') return pageButtons;
      if (selector.includes("#prompt-textarea") || selector.includes("textarea") || selector.includes("contenteditable")) return composers;
      if (selector.includes("stop-button") || selector.includes('aria-label*="Stop"') || selector.includes('aria-label*="stop"') || selector.includes('aria-label*="\\uC911\\uC9C0"')) return stopButtons;
      if (selector.startsWith("main div,") && selector.includes("main section")) return limitTextNodes;
      if (selector.includes("main button") || selector.includes('[role="alert"]') || selector.includes('[role="status"]')) return controls;
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

test("direct diagnostic recognizes the observed Korean end banner outside main even when composer remains", async () => {
  const banner = element("\uC774 \uB300\uD654\uC758 \uCD5C\uB300 \uAE38\uC774\uC5D0 \uB3C4\uB2EC\uD588\uC73C\uB2C8 \uC0C8 \uCC44\uD305\uC744 \uC2DC\uC791\uD574 \uACC4\uC18D \uC774\uC57C\uAE30\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const cta = element("\uC0C8 \uCC44\uD305 \uC2DC\uC791", { parent: banner });
  const result = await diagnose({ composers: [element("")], pageButtons: [cta] });
  assert.equal(result.ended, true);
  assert.equal(result.reason, "conversation_end_banner");
  assert.equal(result.evidence.usableComposer, true);
  assert.match(result.evidence.endBannerSignal, /CTA:/);
});

test("observed Korean limit banner overrides stale thinking and composer state without a CTA", async () => {
  const banner = element("\uC774 \uB300\uD654\uC758 \uCD5C\uB300 \uAE38\uC774\uC5D0 \uB3C4\uB2EC\uD588\uC73C\uB2C8 \uC0C8 \uCC44\uD305\uC744 \uC2DC\uC791\uD574 \uACC4\uC18D \uC774\uC57C\uAE30\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
  const result = await diagnose({
    composers: [element("")],
    stopButtons: [element("Stop")],
    limitTextNodes: [banner]
  });
  assert.equal(result.ended, true);
  assert.equal(result.reason, "explicit_limit_ui");
  assert.equal(result.evidence.usableComposer, true);
  assert.equal(result.evidence.generationActive, true);
  assert.match(result.evidence.explicitLimitSignal, /\uCD5C\uB300 \uAE38\uC774/);
});

test("quoted Korean limit text inside a conversation turn does not override generation", async () => {
  const quoted = element("\uC774 \uB300\uD654\uC758 \uCD5C\uB300 \uAE38\uC774\uC5D0 \uB3C4\uB2EC\uD588\uC2B5\uB2C8\uB2E4.", { authored: true });
  const result = await diagnose({
    stopButtons: [element("Stop")],
    limitTextNodes: [quoted]
  });
  assert.equal(result.ended, false);
  assert.equal(result.reason, "generation_in_progress");
  assert.equal(result.evidence.explicitLimitSignal, "");
});

test("a standalone new-chat button without nearby limit text does not override a usable composer", async () => {
  const cta = element("\uC0C8 \uCC44\uD305 \uC2DC\uC791", { parent: element("\uC0C8 \uCC44\uD305") });
  const result = await diagnose({ composers: [element("")], pageButtons: [cta] });
  assert.equal(result.ended, false);
  assert.equal(result.reason, "usable_composer");
  assert.equal(result.evidence.endBannerSignal, "");
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
