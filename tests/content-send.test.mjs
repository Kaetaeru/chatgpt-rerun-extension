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
