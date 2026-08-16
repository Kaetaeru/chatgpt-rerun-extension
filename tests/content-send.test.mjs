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
