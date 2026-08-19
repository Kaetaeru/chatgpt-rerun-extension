import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const observer = readFileSync(new URL("../turn-observer.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("turn observer is loaded alongside the existing and Team content scripts", () => {
  const scripts = manifest.content_scripts?.[0]?.js || [];
  assert.deepEqual(scripts, ["content.js", "turn-observer.js", "team-content.js"]);
});

test("observer arms only from Rerun runtime activity and watches DOM generation transitions", () => {
  assert.match(observer, /after\.lastSentAt && after\.lastSentAt !== before\.lastSentAt/);
  assert.match(observer, /after\.bootstrapPending/);
  assert.match(observer, /new MutationObserver/);
  assert.match(observer, /sawGenerating = true/);
  assert.match(observer, /STABLE_IDLE_MS = 600/);
});

test("observer emits one TURN_FINISHED event only after stable idle", () => {
  assert.match(observer, /completeTurnIfStable\(\)/);
  assert.match(observer, /if \(!armedToken \|\| !sawGenerating \|\| !isChatIdle\(\)\) return/);
  assert.match(observer, /type: "TURN_FINISHED"/);
  assert.match(observer, /lastCompletedToken/);
});

test("approval confirmation is not treated as a completed turn", () => {
  assert.match(observer, /if \(findGitHubApprovalCard\(\)\) return/);
  assert.match(observer, /ChatGPT가\\s\*GitHub\.\*사용하도록\\s\*허용할까요/);
  assert.match(observer, /allow\\s\+ChatGPT\\s\+to\\s\+use\\s\+GitHub/);
});

test("TURN_FINISHED bypasses the normal poll cache exactly for reconciliation", () => {
  assert.match(background, /case "TURN_FINISHED":\s*return reconcileAfterTurn\(sender, message\)/);
  assert.match(background, /poll\(sender, \{ forceFetch: true \}\)/);
  assert.match(background, /async function poll\(sender, \{ forceFetch = false \} = \{\}\)/);
  assert.match(background, /!forceFetch && now - cache\.lastFetchAt < intervalSeconds \* 1000/);
});

test("a newly ready control wakes the existing safe dispatch path instead of bypassing claim and ack", () => {
  assert.match(background, /if \(result\.action === "continue"\)[\s\S]*type: "RERUN_WAKE"/);
  assert.match(background, /async function claimSequence/);
  assert.match(background, /async function ackSequence/);
  assert.doesNotMatch(observer, /sendPrompt\(/);
});

test("manual injection path also installs the turn observer for already-open tabs", () => {
  assert.match(background, /files: \["turn-observer\.js"\]/);
});
