import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("normal CONTINUE immediately returns runtime to ready without GitHub control polling", () => {
  assert.match(background, /status === "CONTINUE"[\s\S]*status: "running", phase: "ready"/);
  assert.doesNotMatch(background, /control\.json|sameSequenceRetryCount|retryDelaySeconds/);
});

test("paused goal stays paused when an in-flight execution later reports CONTINUE", () => {
  assert.match(background, /runtime\.enabled && runtime\.status !== "paused"[\s\S]*enabled: false, status: "paused", phase: "paused"/);
});

test("result is bound to active run and execution to reject stale assistant output", () => {
  assert.match(background, /resultRunId !== runtime\.runId \|\| resultExecution !== Number\(runtime\.iteration\)/);
  assert.match(content, /parsed\.runId === runId && parsed\.execution === Number\(execution\)/);
});

test("approval card only pauses and is never automatically clicked", () => {
  assert.match(content, /findGitHubApprovalCard\(\)/);
  assert.doesNotMatch(content, /approval(?:Card|Button)[\s\S]{0,160}\.click\(/i);
});

test("manual ChatGPT Stop pauses the goal instead of silently auto-rerunning", () => {
  assert.match(content, /event\.isTrusted[\s\S]*manualStopRequested = true/);
  assert.match(content, /if \(manualStopRequested\)[\s\S]*type: "PAUSE_GOAL"/);
});

test("missing composer uses one fresh-chat ownership handoff", () => {
  assert.match(content, /findComposer\(\) \|\| await waitForComposer\(5_000\)/);
  assert.match(content, /type: "HANDOFF_NEW_CHAT"/);
  assert.match(background, /phase: "ready"[\s\S]*handoffFromTabId: oldTabId/);
});
