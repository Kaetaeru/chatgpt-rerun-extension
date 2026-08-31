import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const detector = readFileSync(new URL("../conversation-diagnostic.js", import.meta.url), "utf8");
const automaticDetector = readFileSync(new URL("../conversation-limit.js", import.meta.url), "utf8");

test("side panel runs the conversation-end diagnostic directly in the active tab", () => {
  assert.match(html, /id="testConversationEnd"/);
  assert.match(html, /id="conversationEndResult"/);
  assert.match(html, /id="conversationEndDetail"/);
  assert.match(popup, /func: diagnoseConversationEndInPage/);
  assert.match(popup, /response\.ended === true/);
  assert.match(popup, /"판단 불가"/);
  assert.match(popup, /UI candidates:/);
});

test("manual diagnostic is independent from the persistent automatic detector", () => {
  assert.match(detector, /export async function diagnoseConversationEndInPage/);
  assert.match(detector, /findEndBannerSignal/);
  assert.match(detector, /button, a\[href\], \[role="button"\]/);
  assert.match(detector, /continueNewChatSignal/);
  assert.doesNotMatch(automaticDetector, /RERUN_V2_DIAGNOSE_CONVERSATION_END/);
});
