import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("goal setup is driven by a downloadable JSON file", () => {
  assert.match(background, /case "BEGIN_GOAL_SETUP"/);
  assert.match(background, /buildGoalSetupPrompt\(setupNonce\)/);
  assert.match(background, /case "IMPORT_GOAL_FILE"/);
  assert.match(content, /runtime\.phase === "awaiting_goal_file"/);
  assert.match(content, /rerun-goal-\$\{nonce\}\.json/);
});

test("assistant prose is not parsed for Goal Runner control", () => {
  assert.doesNotMatch(content, /data-message-author-role/);
  assert.doesNotMatch(content, /readLatestAssistantText/);
  assert.doesNotMatch(content, /parseRerunResult/);
  assert.match(content, /REPORT_RESULT_FILE/);
});

test("executor prompt is frozen once goal JSON is accepted", () => {
  assert.match(background, /frozenPrompt: buildExecutorPrompt/);
  assert.match(background, /prompt: runtime\.frozenPrompt/);
  assert.doesNotMatch(background, /buildExecutorPrompt\(config, runtime\)/);
});

test("normal CONTINUE from a result JSON immediately returns to ready", () => {
  assert.match(background, /result\.status === "CONTINUE"[\s\S]*status: "running", phase: "ready"/);
  assert.match(background, /if \(next\.enabled && next\.phase === "ready"\) await wakeTab\(tabId\)/);
});

test("result attachment must be new for the active execution", () => {
  assert.match(content, /activeResultBaseline = snapshotResultAttachmentKeys\(claim\.goalId\)/);
  assert.match(content, /baseline\?\.has\(candidate\.key\)/);
  assert.match(content, /seenJsonAttachmentKeys\.has\(candidate\.key\)/);
});

test("approval card pauses only and is never automatically clicked", () => {
  assert.match(content, /findGitHubApprovalCard\(\)/);
  assert.doesNotMatch(content, /approval(?:Card|Button)[\s\S]{0,160}\.click\(/i);
});

test("manual ChatGPT Stop pauses the goal", () => {
  assert.match(content, /event\.isTrusted[\s\S]*manualStopRequested = true/);
  assert.match(content, /if \(manualStopRequested\)[\s\S]*type: "PAUSE_GOAL"/);
});

test("missing composer uses one fresh-chat ownership handoff", () => {
  assert.match(content, /findComposer\(\) \|\| await waitForComposer\(5_000\)/);
  assert.match(content, /type: "HANDOFF_NEW_CHAT"/);
  assert.match(background, /handoffFromTabId: oldTabId/);
});
