import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guard = readFileSync(new URL("../rerun-chat-guard.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("Rerun chat guard is loaded before the primary content script", () => {
  const scripts = manifest.content_scripts[0].js;
  assert.ok(scripts.includes("rerun-chat-guard.js"));
  assert.ok(scripts.indexOf("rerun-chat-guard.js") < scripts.indexOf("content.js"));
  assert.match(pkg.scripts.check, /node --check rerun-chat-guard\.js/);
});

test("all Rerun prompt classes are forced to standard Chat with persistent artifact retry instructions", () => {
  assert.match(guard, /preparing the next ChatGPT Rerun V2 goal/);
  assert.match(guard, /preparing ChatGPT Rerun Worker/);
  assert.match(guard, /executing a ChatGPT Rerun V2 Goal Runner task/);
  assert.match(guard, /standard Chat conversation only/);
  assert.match(guard, /Do NOT switch to or invoke ChatGPT Work/);
  assert.match(guard, /retry that artifact operation in this same response as many times as needed/);
  assert.match(guard, /fresh downloadable file is successfully created, reopened, and verified/);
  assert.match(guard, /downloadable JSON and its required transport mirror must both be produced/);
});

test("dispatch_not_observed leftovers are recovered instead of being treated as user drafts", () => {
  assert.match(guard, /runtime\.status === "running" && runtime\.phase === "ready"/);
  assert.match(guard, /clearComposer\(composer\)/);
  assert.match(guard, /runtime\.status === "paused"/);
  assert.match(guard, /dispatch_not_observed/);
  assert.match(guard, /type: "RESUME_GOAL"/);
  assert.match(guard, /Run ID: \$\{runId\}/);
  assert.match(guard, /Goal ID: \$\{goalId\}/);
});
