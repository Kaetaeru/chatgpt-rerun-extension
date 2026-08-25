import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");

test("prompt injection explicitly synchronizes ChatGPT composer input state", () => {
  assert.match(content, /function dispatchComposerInput\(composer, text\)/);
  assert.match(content, /new InputEvent\("input"/);
  assert.match(content, /inputType: "insertText"/);
  assert.match(content, /document\.execCommand\("insertText", false, text\)[\s\S]*dispatchComposerInput\(composer, text\)/);
});

test("prompt send waits for composer text before submitting", () => {
  assert.match(content, /waitForComposerText\(composer, prompt, 1500\)/);
  assert.match(content, /prompt text did not synchronize with the ChatGPT composer/);
});

test("send button failure falls back to Enter submission", () => {
  assert.match(content, /const sendButton = await waitForSendButton\(4000\)/);
  assert.match(content, /if \(sendButton\) \{[\s\S]*sendButton\.click\(\);[\s\S]*\} else \{[\s\S]*dispatchEnter\(composer\)/);
  assert.match(content, /new KeyboardEvent\("keydown"/);
});

test("submission is acknowledged only after visible dispatch evidence", () => {
  assert.match(content, /waitForDispatchEvidence\(4000\)/);
  assert.match(content, /if \(!readComposerText\(current\)\.trim\(\)\) return true/);
  assert.match(content, /if \(!isChatIdle\(\)\) return true/);
  assert.match(content, /prompt inserted but send button click did not start sending/);
});

test("a stale Rerun-owned prompt is distinguished from a user draft", () => {
  assert.match(content, /const staleRerunPrompt = isSameRerunPrompt\(existingComposerText, prompt\)/);
  assert.match(content, /if \(existingComposerText && !staleRerunPrompt\)[\s\S]*composer_not_empty/);
  assert.match(content, /function isSameRerunPrompt\(existing, expected\)/);
  assert.match(content, /replace\(\/\\s\+\/g, " "\)/);
});

test("a stale Rerun-owned prompt immediately attempts fresh-chat handoff", () => {
  assert.match(content, /if \(staleRerunPrompt\) \{[\s\S]*handoffAfterDispatchFailure\(\)/);
  assert.match(content, /stale Rerun prompt could not be handed off/);
});

test("confirmed dispatch failure attempts fresh-chat handoff instead of immediately stopping", () => {
  assert.match(content, /function isConfirmedDispatchFailure\(detail\)/);
  assert.match(content, /startsWith\("prompt inserted but "\)/);
  assert.match(content, /prompt text did not synchronize with the ChatGPT composer/);
  assert.match(content, /const handoff = await handoffAfterDispatchFailure\(\)/);
  assert.match(content, /type: "HANDOFF_NEW_CHAT"/);
  assert.match(content, /if \(handoff\?\.ok\) return/);
});

test("automatic handoff failure still falls back to a safe watcher stop", () => {
  assert.match(content, /reason: `auto_handoff_failed: \$\{handoff\?\.error \|\| detail\}`/);
  assert.match(content, /type: "STOP_SESSION"/);
});

test("approval-aware mode pauses Rerun polling while a GitHub action confirmation is visible", () => {
  assert.match(content, /const approvalWaiting = Boolean\(findGitHubApprovalCard\(\)\)/);
  assert.match(content, /if \(watcherEnabled && approvalWaiting && await isApprovalAwareResumeEnabled\(\)\) return;[\s\S]*type: "POLL"/);
  assert.match(content, /stored\[key\]\?\.approvalAwareResume/);
  assert.match(content, /function findGitHubApprovalCard\(\)/);
  assert.match(content, /ChatGPT가\\s\*GitHub\.\*사용하도록\\s\*허용할까요/);
  assert.match(content, /allow\\s\+ChatGPT\\s+to\\s+use\\s+GitHub/);
});

test("approval-aware mode never clicks the GitHub approval button", () => {
  assert.match(content, /Deliberately do not click the approval button/);
  assert.doesNotMatch(content, /findGitHubApprovalCard\(\)[\s\S]{0,300}\.click\(/);
  assert.doesNotMatch(content, /approval(?:Button|Card)[\s\S]{0,120}\.click\(/i);
});

test("generation watchdog force-stops a continuously generating Rerun response after 23 active minutes", () => {
  assert.match(content, /const GENERATION_WATCHDOG_MS = 23 \* 60 \* 1000/);
  assert.match(content, /const watcherEnabled = await isRerunWatcherEnabled\(\)/);
  assert.match(content, /if \(watcherEnabled && await enforceGenerationWatchdog\(approvalWaiting\)\) return;[\s\S]*type: "POLL"/);
  assert.match(content, /activeGenerationMs < GENERATION_WATCHDOG_MS \|\| generationWatchdogFired/);
  assert.match(content, /generationWatchdogFired = true;[\s\S]*await rearmContinuationAfterWatchdogStop\(\);[\s\S]*stopButton\.click\(\);[\s\S]*return true/);
});

test("watchdog force-stop rearms the same-sequence continuation instead of freezing at retry_limit", () => {
  assert.match(content, /async function rearmContinuationAfterWatchdogStop\(\)/);
  assert.match(content, /sameSequenceRetryCount: 0/);
  assert.match(content, /pendingSequence: null/);
  assert.match(content, /pendingRunId: null/);
  assert.match(content, /pendingIsRetry: false/);
});

test("generation watchdog is armed only after a Rerun prompt has visibly dispatched", () => {
  assert.match(content, /const dispatchStartedAtMs = Date\.now\(\)/);
  assert.match(content, /waitForDispatchEvidence\(4000\)[\s\S]*armGenerationWatchdog\(dispatchStartedAtMs\)/);
  assert.match(content, /function armGenerationWatchdog\(startedAtMs = Date\.now\(\)\)/);
  assert.match(content, /function isRerunWatcherEnabled\(\)/);
  assert.match(content, /`tabRuntime:\$\{tabId\}`/);
});

test("generation watchdog excludes GitHub approval waiting time from the 23 minute budget", () => {
  assert.match(content, /if \(approvalWaiting\) \{[\s\S]*generationPausedAtMs = nowMs;[\s\S]*return false/);
  assert.match(content, /generationPausedTotalMs \+= Math\.max\(0, nowMs - generationPausedAtMs\)/);
  assert.match(content, /nowMs - generationStartedAtMs - generationPausedTotalMs/);
});

test("normal Rerun completion immediately requests an authoritative control refresh", () => {
  assert.match(content, /const completedNormally = !generationWatchdogFired && !generationInterruptedByUser/);
  assert.match(content, /if \(completedNormally\) normalContinuationPending = true/);
  assert.match(content, /const afterGenerationComplete = normalContinuationPending/);
  assert.match(content, /type: "POLL",[\s\S]*afterGenerationComplete/);
  assert.match(content, /normalContinuation: Boolean\(response\.normalContinuation\)/);
});

test("an observed active generation chains on the next content tick instead of waiting the startup grace", () => {
  assert.match(content, /let generationObservedActive = false/);
  assert.match(content, /if \(!generationObservedActive && nowMs - generationStartedAtMs < GENERATION_START_GRACE_MS\)/);
  assert.match(content, /generationObservedActive = true;[\s\S]*const activeGenerationMs/);
});

test("manual Stop is not mistaken for normal completion", () => {
  assert.match(content, /document\.addEventListener\("click"/);
  assert.match(content, /!event\.isTrusted \|\| generationStartedAtMs === null \|\| generationWatchdogFired/);
  assert.match(content, /isStopButtonElement\(button\)[\s\S]*generationInterruptedByUser = true/);
  assert.match(content, /completedNormally = !generationWatchdogFired && !generationInterruptedByUser/);
});

test("generation watchdog resets when ChatGPT is no longer generating and only uses an actionable visible stop button", () => {
  assert.match(content, /const GENERATION_START_GRACE_MS = 15_000/);
  assert.match(content, /resetGenerationWatchdog\(\);[\s\S]*if \(completedNormally\) normalContinuationPending = true/);
  assert.match(content, /button\.disabled \|\| button\.getAttribute\("aria-disabled"\) === "true"/);
  assert.match(content, /button\.getClientRects\(\)\.length === 0/);
  assert.match(content, /function isChatIdle\(\) \{[\s\S]*return !findStopButton\(\)/);
});
