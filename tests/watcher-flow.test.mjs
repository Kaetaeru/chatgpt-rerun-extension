import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");

test("GitHub terminal statuses pause dispatch without stopping the tab watcher", () => {
  assert.match(
    background,
    /\["complete", "needs_user", "blocked"\]\.includes\(control\.status\)[\s\S]*return \{ action: "wait", reason: control\.status, control \};/
  );
  assert.doesNotMatch(
    background,
    /\["complete", "needs_user", "blocked"\]\.includes\(control\.status\)[\s\S]{0,500}stopSession\(tabId, control\.status\)/
  );
});

test("terminal state arms the same sequence for an immediate later continue", () => {
  assert.match(background, /const armedLastHandled = Math\.min\(lastHandled, control\.sequence - 1\)/);
  assert.match(background, /lastHandledSequence: armedLastHandled/);
});

test("watcher safeguards wait instead of disabling polling", () => {
  assert.match(background, /return \{ action: "wait", reason: "max_runs", control \};/);
  assert.match(background, /return \{ action: "wait", reason: "retry_limit", control \};/);
  assert.match(background, /return \{ action: "wait", reason: "sequence_regressed", control \};/);
});

test("terminal GitHub status blocks handoff without stopping the existing watcher", () => {
  assert.match(background, /현재 GitHub control 상태가 \$\{control\.status\}라 새 채팅 handoff는 대기합니다/);
  assert.doesNotMatch(background, /await stopSession\(oldTabId, control\.status\)/);
});
