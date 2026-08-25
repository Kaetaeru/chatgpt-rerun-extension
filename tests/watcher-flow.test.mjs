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

test("watcher has no lifetime max-runs gate but keeps retry and regression safeguards", () => {
  assert.doesNotMatch(background, /reason: "max_runs"/);
  assert.doesNotMatch(background, /Max sends 한도/);
  assert.doesNotMatch(background, /normalizeMaxRuns/);
  assert.match(background, /return \{ action: "wait", reason: "retry_limit", control \};/);
  assert.match(background, /return \{ action: "wait", reason: "sequence_regressed", control \};/);
});

test("normal completion bypasses the poll cache and retry delay once", () => {
  assert.match(background, /case "POLL":[\s\S]*return poll\(sender, message\)/);
  assert.match(background, /const afterGenerationComplete = Boolean\(message\.afterGenerationComplete\)/);
  assert.match(background, /!afterGenerationComplete && now - cache\.lastFetchAt < intervalSeconds \* 1000/);
  assert.match(background, /if \(afterGenerationComplete\) \{[\s\S]*normalContinuation: true/);
  assert.match(background, /if \(message\.normalContinuation\) \{[\s\S]*pendingIsRetry: false[\s\S]*claimed: true, isRetry: false/);
});

test("normal completion still respects terminal and sequence-regression guards", () => {
  const terminalIndex = background.indexOf('["complete", "needs_user", "blocked"].includes(control.status)');
  const normalIndex = background.indexOf("if (afterGenerationComplete)");
  const staleIndex = background.indexOf('if (disposition.action === "stale")');
  assert.ok(terminalIndex >= 0 && terminalIndex < normalIndex);
  assert.ok(staleIndex >= 0 && staleIndex < normalIndex);
});

test("fresh-chat handoff transfers watcher ownership regardless of GitHub work status", () => {
  assert.doesNotMatch(background, /if \(control\.status !== "continue"\)/);
  assert.doesNotMatch(background, /현재 GitHub control 상태가 \$\{control\.status\}라 새 채팅 handoff는 대기합니다/);
  assert.match(background, /const prompt = buildNewChatHandoffPrompt\(config, control\)/);
  assert.match(background, /type: "RERUN_HANDOFF"/);
  assert.match(background, /status: control\.status/);
});
