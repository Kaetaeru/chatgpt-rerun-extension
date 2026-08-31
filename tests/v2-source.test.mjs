import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const poolSetup = readFileSync(new URL("../pool-setup.js", import.meta.url), "utf8");

test("goal setup is driven by a downloadable JSON file", () => {
  assert.match(background, /case "BEGIN_GOAL_SETUP"/);
  assert.match(background, /buildGoalSetupPrompt\(setupNonce\)/);
  assert.match(background, /case "IMPORT_GOAL_FILE"/);
  assert.match(content, /runtime\.phase === "awaiting_goal_file"/);
  assert.match(content, /rerun-goal-\$\{nonce\}\.json/);
});

test("accepted goal pauses the authoring chat and opens worker-count setup instead of executing there", () => {
  assert.match(background, /status: "pool_setup"[\s\S]*phase: "awaiting_worker_count"/);
  assert.match(background, /pool-setup\.html\?runId=/);
  assert.match(background, /CREATE_WORKER_POOL/);
  assert.match(poolSetup, /workerCount/);
  assert.match(poolSetup, /CREATE_WORKER_POOL/);
});

test("assistant prose is not parsed for Goal Runner control", () => {
  assert.doesNotMatch(content, /data-message-author-role/);
  assert.doesNotMatch(content, /readLatestAssistantText/);
  assert.doesNotMatch(content, /parseRerunResult/);
  assert.match(content, /REPORT_WORKER_READY/);
  assert.match(content, /REPORT_RESULT_FILE/);
});

test("executor prompt stays frozen except for one worker-handoff resume capsule", () => {
  assert.match(background, /const frozenPrompt = buildExecutorPrompt/);
  assert.match(background, /runtime\.resumeCapsulePending[\s\S]*buildFreshChatResumePrompt\(runtime\.frozenPrompt, runtime\.lastCheckpoint\)[\s\S]*runtime\.frozenPrompt/);
  assert.match(background, /resumeCapsulePending: false/);
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
  assert.match(background, /processedResultIds\.includes\(result\.resultId\)/);
});

test("every worker must finish structured GitHub preflight before worker one becomes active", () => {
  assert.match(background, /buildWorkerPreflightPrompt/);
  assert.match(background, /status: "awaiting_worker_ready"/);
  assert.match(background, /case "REPORT_WORKER_READY"/);
  assert.match(background, /rebuildWorkerReadiness/);
  assert.match(background, /activatePoolWorker\(pool, 0, false\)/);
  assert.match(content, /runtime\.phase === "worker_preflight"/);
  assert.match(content, /rerun-worker-ready-/);
});

test("pool handoff reuses a preallocated ready tab and never creates a replacement tab", () => {
  assert.match(background, /runtime\.poolRunId\) return advanceWorkerPool/);
  assert.match(background, /const nextWorker = storedPool\.workers\.find/);
  assert.match(background, /newTabId: nextWorker\.tabId/);
  const advanceBlock = background.match(/async function advanceWorkerPool[\s\S]*?async function legacyFreshChatHandoff/)?.[0] || "";
  assert.doesNotMatch(advanceBlock, /chrome\.tabs\.create/);
  assert.match(advanceBlock, /worker_pool_exhausted/);
});

test("side panel actions and refresh always resolve the currently active ChatGPT tab", () => {
  assert.doesNotMatch(popup, /let tabId = null/);
  assert.match(popup, /setupButton\.addEventListener[\s\S]*const tabId = await getActiveChatTabId\(\)[\s\S]*BEGIN_GOAL_SETUP/);
  assert.match(popup, /resumeButton\.addEventListener[\s\S]*const tabId = await getActiveChatTabId\(\)[\s\S]*RESUME_GOAL/);
  assert.match(popup, /pauseButton\.addEventListener[\s\S]*const tabId = await getActiveChatTabId\(\)[\s\S]*PAUSE_GOAL/);
  assert.match(popup, /stopButton\.addEventListener[\s\S]*const tabId = await getActiveChatTabId\(\)[\s\S]*STOP_GOAL/);
  assert.match(popup, /async function refresh\(\)[\s\S]*const tabId = await getActiveChatTabId\(\)[\s\S]*getState\(tabId\)/);
  assert.match(popup, /async function getState\(tabId\)[\s\S]*GET_TAB_STATE", tabId/);
});

test("approval card pauses only and is never automatically clicked", () => {
  assert.match(content, /findGitHubApprovalCard\(\)/);
  assert.doesNotMatch(content, /approval(?:Card|Button)[\s\S]{0,160}\.click\(/i);
});

test("manual ChatGPT Stop pauses the goal", () => {
  assert.match(content, /event\.isTrusted[\s\S]*manualStopRequested = true/);
  assert.match(content, /if \(manualStopRequested\)[\s\S]*type: "PAUSE_GOAL"/);
});

test("legacy non-pool runs retain the old one-shot fresh-chat fallback", () => {
  assert.match(background, /async function legacyFreshChatHandoff/);
  assert.match(background, /handoffUsed \|\| runtime\.handoffFromTabId !== null/);
  assert.match(background, /reason: "handoff_already_used"/);
});
