import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");

test("Start probes for control and bootstraps only the standard missing path", () => {
  assert.match(background, /fetchControl\(config, tabId, \{ allowMissing: true \}\)/);
  assert.match(background, /isAutoBootstrapPath\(config\)/);
  assert.match(background, /assertRepositoryBranchAccessible\(config, tabId\)/);
  assert.match(background, /type: "RERUN_BOOTSTRAP"/);
  assert.match(background, /bootstrapPending: true/);
});

test("bootstrap pending suppresses normal sequence claims until control appears", () => {
  assert.match(background, /if \(runtime\.bootstrapPending\)/);
  assert.match(background, /phase: "bootstrap_wait"/);
  assert.match(background, /runtime\.bootstrapPending\) \{\n    return \{ claimed: false/);
  assert.match(background, /bootstrapCompletedAt: new Date\(\)\.toISOString\(\)/);
});

test("content script accepts bootstrap direct prompts without parsing assistant output", () => {
  assert.match(content, /message\?\.type === "RERUN_HANDOFF" \|\| message\?\.type === "RERUN_BOOTSTRAP"/);
  assert.match(content, /sendDirectPrompt/);
  assert.doesNotMatch(content, /assistant.*text|response.*content/i);
});

test("Side Panel surfaces initialization and clears bootstrap state on stream changes", () => {
  assert.match(popup, /Initializing repository/);
  assert.match(popup, /bootstrapPending: false/);
  assert.match(popup, /bootstrapRequestedAt: null/);
  assert.match(popup, /bootstrapCompletedAt: null/);
});
