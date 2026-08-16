import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("side panel exposes one runtime-driven Start/Stop session toggle", () => {
  assert.match(html, /id="sessionToggle"[^>]*>Start<\/button>/);
  assert.doesNotMatch(html, /id="start"/);
  assert.doesNotMatch(html, /id="stop"/);

  assert.match(script, /sessionToggle\.textContent = running \? "Stop" : "Start"/);
  assert.match(script, /type: "START_TAB_SESSION"/);
  assert.match(script, /type: "STOP_TAB_SESSION"/);
});

test("side panel exposes an explicit Rerun connection prompt action", () => {
  assert.match(html, /id="connectPrompt"[^>]*>Rerun 연결 프롬프트<\/button>/);
  assert.match(script, /buildRerunConnectionPrompt/);
  assert.match(script, /type: "RERUN_CONNECT"/);
  assert.match(script, /connectPromptButton\.disabled = Boolean\(runtime\.enabled\)/);
  assert.match(content, /"RERUN_CONNECT"/);
});
