import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("Side Panel uses The Voyage of Theseus brand and English copy", () => {
  assert.match(html, /The Voyage of Theseus/);
  assert.match(html, /Minds change\. The voyage continues\./);
  assert.match(html, /Connect this conversation/);
  assert.match(html, /Continue in new chat/);
});

test("side panel exposes one runtime-driven Start/Stop watcher toggle", () => {
  assert.match(html, /id="sessionToggle"[^>]*>Start<\/button>/);
  assert.doesNotMatch(html, /id="start"/);
  assert.doesNotMatch(html, /id="stop"/);
  assert.match(script, /sessionToggle\.textContent = running \? "Stop" : "Start"/);
  assert.match(script, /type: "START_TAB_SESSION"/);
  assert.match(script, /type: "STOP_TAB_SESSION"/);
  assert.match(script, /Watching GitHub/);
});

test("side panel shows repository connection separately from watcher and GitHub work status", () => {
  assert.match(html, /id="connectionState">Unconnected<\/strong>/);
  assert.match(html, /id="tabWatcher">Stopped<\/strong>/);
  assert.match(html, /GitHub work status/);
  assert.match(script, /connectionState/);
  assert.match(script, /: "Unconnected"/);
  assert.match(script, /watching \? "Watching" : "Stopped"/);
  assert.match(script, /"continue · start"/);
});

test("side panel keeps the lifetime send cap removed", () => {
  assert.doesNotMatch(html, />Max sends</);
  assert.match(html, /id="maxRuns" type="hidden"/);
  assert.match(html, /There is no lifetime send cap/);
  assert.match(html, /Retries \/ sequence/);
});

test("side panel exposes approval-aware manual resume without auto-approval", () => {
  assert.match(html, /id="approvalAwareResume" type="checkbox"/);
  assert.match(html, /Resume after manual GitHub approval/);
  assert.match(html, /never clicks approval controls/);
  assert.match(html, /id="approvalMode">Manual<\/strong>/);
  assert.match(script, /approvalAwareResume: Boolean\(elements\.approvalAwareResume\.checked\)/);
  assert.match(script, /elements\[id\]\.type === "checkbox"/);
  assert.match(script, /Manual · auto-resume/);
});

test("rate-limit UI shows polling mode instead of raw quota counters", () => {
  assert.match(html, /API polling/);
  assert.doesNotMatch(html, /Rate remaining/);
  assert.match(script, /Authenticated · conditional/);
  assert.match(script, /Public · rate-safe/);
  assert.match(script, /API pause until/);
});

test("new tabs do not inherit an unrelated legacy repository connection", () => {
  assert.match(script, /const ownsLegacySession = Number\(legacy\.targetTabId\) === tabId/);
  assert.match(script, /if \(ownsLegacySession\) \{[\s\S]*legacy\[key\]/);
  assert.match(script, /const config = \{ \.\.\.DEFAULT_CONFIG \}/);
  assert.match(script, /legacyDraft = ownsLegacySession/);
});

test("side panel keeps an explicit conversation-context connection prompt action", () => {
  assert.match(html, /id="connectPrompt"[^>]*>Send connection prompt<\/button>/);
  assert.match(html, /New ChatGPT tabs start <strong>Unconnected<\/strong>/);
  assert.match(script, /const prompt = buildRerunConnectionPrompt\(\)/);
  assert.doesNotMatch(script, /buildRerunConnectionPrompt\(\{[\s\S]{0,300}owner:/);
  assert.match(script, /type: "RERUN_CONNECT"/);
  assert.match(script, /connectPromptButton\.disabled = watching \|\| connectPromptBusy/);
  assert.match(content, /"RERUN_CONNECT"/);
});
