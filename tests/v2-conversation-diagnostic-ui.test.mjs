import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const detector = readFileSync(new URL("../conversation-limit.js", import.meta.url), "utf8");

test("side panel exposes the manual conversation-end diagnostic", () => {
  assert.match(html, /id="testConversationEnd"/);
  assert.match(html, /id="conversationEndResult"/);
  assert.match(html, /id="conversationEndDetail"/);
  assert.match(popup, /RERUN_V2_DIAGNOSE_CONVERSATION_END/);
  assert.match(popup, /response\.ended \? "대화길이 끝" : "끝이 아님"/);
});

test("diagnostic request is handled by the conversation detector without changing runtime state", () => {
  assert.match(detector, /message\?\.type !== "RERUN_V2_DIAGNOSE_CONVERSATION_END"/);
  assert.match(detector, /sendResponse\(\{ ok: true, \.\.\.diagnoseConversationEnd\(\) \}\)/);
});
