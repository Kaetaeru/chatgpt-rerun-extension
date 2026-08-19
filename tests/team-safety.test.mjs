import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerSafety = readFileSync(new URL("../team-safety.js", import.meta.url), "utf8");
const panelSafety = readFileSync(new URL("../team-panel-safety.js", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../background-v04.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");

test("v0.4 wrapper installs storage safety alongside both runtimes", () => {
  assert.match(wrapper, /import "\.\/background\.js"/);
  assert.match(wrapper, /import "\.\/team-background\.js"/);
  assert.match(wrapper, /import "\.\/team-safety\.js"/);
});

test("active Team stops immediately if repository stream coordinates change", () => {
  assert.match(workerSafety, /chrome\.storage\.onChanged\.addListener/);
  assert.match(workerSafety, /teamState\.streamKey && currentStreamKey !== teamState\.streamKey/);
  assert.match(workerSafety, /repository_connection_changed/);
  assert.match(workerSafety, /enabled: false/);
});

test("active Team stops immediately if Single watcher becomes enabled", () => {
  assert.match(workerSafety, /singleRuntime\.enabled/);
  assert.match(workerSafety, /single_watcher_started/);
});

test("side panel blocks conflicting Single actions and repository edits while Team runs", () => {
  assert.match(html, /src="team-panel-safety\.js"/);
  assert.match(panelSafety, /event\.stopImmediatePropagation\(\)/);
  assert.match(panelSafety, /rerun-team-active/);
  assert.match(panelSafety, /"sessionToggle", "connectPrompt", "handoff", "save"/);
  assert.match(panelSafety, /"owner", "repo", "branch", "path", "resumePrompt"/);
  assert.match(panelSafety, /element\.disabled = locked/);
});
