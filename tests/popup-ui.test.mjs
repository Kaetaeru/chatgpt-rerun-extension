import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("side panel exposes one runtime-driven Start/Stop watcher toggle", () => {
  assert.match(html, /id="sessionToggle"[^>]*>Start<\/button>/);
  assert.doesNotMatch(html, /id="start"/);
  assert.doesNotMatch(html, /id="stop"/);

  assert.match(script, /sessionToggle\.textContent = running \? "Stop" : "Start"/);
  assert.match(script, /type: "START_TAB_SESSION"/);
  assert.match(script, /type: "STOP_TAB_SESSION"/);
  assert.match(script, /Watching GitHub/);
  assert.match(script, /Start GitHub watcher on this tab/);
  assert.match(script, /Stop GitHub watcher on this tab/);
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

test("side panel removes the lifetime Max sends cap", () => {
  assert.doesNotMatch(html, />Max sends</);
  assert.match(html, /id="maxRuns" type="hidden"/);
  assert.match(html, /전체 작업의 send 횟수를 제한하지 않습니다/);
  assert.match(html, /Retries \/ sequence/);
});

test("side panel exposes approval-aware manual-confirmation resume without auto-approval", () => {
  assert.match(html, /id="approvalAwareResume" type="checkbox"/);
  assert.match(html, /GitHub 승인 후 자동 계속/);
  assert.match(html, /승인 버튼은 자동으로 누르지 않습니다/);
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

test("side panel exposes an explicit conversation-context Rerun connection prompt action", () => {
  assert.match(html, /id="connectPrompt"[^>]*>Rerun 연결 프롬프트<\/button>/);
  assert.match(html, /새 탭은 저장소 좌표를 상속하지 않고 <strong>Unconnected<\/strong>/);
  assert.match(html, /UNCONNECTED/);
  assert.match(script, /const prompt = buildRerunConnectionPrompt\(\)/);
  assert.doesNotMatch(script, /buildRerunConnectionPrompt\(\{[\s\S]{0,300}owner:/);
  assert.match(script, /RERUN_CONNECTION 결과를 확인하세요/);
  assert.match(script, /type: "RERUN_CONNECT"/);
  assert.match(script, /connectPromptButton\.disabled = watching \|\| connectPromptBusy/);
  assert.match(content, /"RERUN_CONNECT"/);
});
