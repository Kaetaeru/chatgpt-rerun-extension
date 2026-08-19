import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TEAM_CONFIG,
  buildTeamAgentPrompt,
  buildTeamBootstrapPrompt,
  normalizeMaxTaskHandoffs,
  parseTeamRuntimePayload
} from "../team-control.js";

const background = readFileSync(new URL("../team-background.js", import.meta.url), "utf8");
const content = readFileSync(new URL("../team-content.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../team-panel.js", import.meta.url), "utf8");
const wrapper = readFileSync(new URL("../background-v04.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("team runtime parser accepts a strict ready handoff", () => {
  const runtime = parseTeamRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "team-001",
    revision: 7,
    status: "ready",
    agent: "programmer",
    task_id: "TASK-003",
    reason: "Implement the accepted spec",
    updated_at: "2026-08-20T01:00:00+09:00"
  }));
  assert.equal(runtime.runId, "team-001");
  assert.equal(runtime.revision, 7);
  assert.equal(runtime.agent, "programmer");
  assert.equal(runtime.taskId, "TASK-003");
});

test("team runtime parser rejects unknown fields and incomplete ready states", () => {
  assert.throws(() => parseTeamRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "team-001",
    revision: 0,
    status: "ready",
    agent: "planner",
    task_id: "TASK-001",
    updated_at: "2026-08-20T01:00:00+09:00",
    conversation: "do not store chat state here"
  })), /unsupported fields/);

  assert.throws(() => parseTeamRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "team-001",
    revision: 0,
    status: "ready",
    updated_at: "2026-08-20T01:00:00+09:00"
  })), /requires agent/);
});

test("team prompts enforce GitHub-only memory and role separation in English", () => {
  const repo = { owner: "Kaetaeru", repo: "SimpleVTT", branch: "main" };
  const bootstrap = buildTeamBootstrapPrompt({ ...DEFAULT_TEAM_CONFIG, goal: "Build combat log" }, repo);
  assert.match(bootstrap, /The Voyage of Theseus Team Runtime/);
  assert.match(bootstrap, /GitHub is their only shared durable memory/);
  assert.match(bootstrap, /Planner owns requirements analysis/);
  assert.match(bootstrap, /Programmer implements only the Planner-approved SPEC/);
  assert.match(bootstrap, /final authoritative write/);

  const planner = buildTeamAgentPrompt({
    runId: "team-1", revision: 2, agent: "planner", taskId: "TASK-1"
  }, DEFAULT_TEAM_CONFIG, repo);
  const programmer = buildTeamAgentPrompt({
    runId: "team-1", revision: 3, agent: "programmer", taskId: "TASK-1"
  }, DEFAULT_TEAM_CONFIG, repo);
  assert.match(planner, /You are the Planner/);
  assert.match(planner, /actual commit, diff, tests/);
  assert.match(programmer, /Do not change scope or product decisions/);
  assert.match(programmer, /commit SHA/);
});

test("v0.4 composes the existing background with a separate Port-based Team scheduler", () => {
  assert.match(wrapper, /import "\.\/background\.js"/);
  assert.match(wrapper, /import "\.\/team-background\.js"/);
  assert.match(background, /chrome\.runtime\.onConnect\.addListener/);
  assert.match(background, /rerun-team-content/);
  assert.match(background, /rerun-team-panel/);
  assert.doesNotMatch(background, /chrome\.runtime\.onMessage\.addListener/);
});

test("team dispatcher reuses one tab but gives each agent a fresh ChatGPT conversation", () => {
  assert.match(background, /openFreshChatInSameTab\(tabId\)/);
  assert.match(background, /chrome\.tabs\.update\(tabId, \{ url: "https:\/\/chatgpt\.com\/"/);
  assert.match(background, /buildTeamAgentPrompt\(runtime, teamConfig, repositoryConfig\)/);
  assert.match(background, /lastDispatchedRevision: runtime\.revision/);
});

test("turn completion forces a fresh Team Runtime read before the next dispatch", () => {
  assert.match(background, /case "TEAM_TURN_FINISHED"/);
  assert.match(background, /forceFetch: true/);
  assert.match(background, /reconcileTeamRuntime\(tabId, runtime, teamConfig, repositoryConfig, "turn_finished"\)/);
  assert.match(background, /\["complete", "needs_user", "blocked"\]\.includes\(runtime\.status\)/);
});

test("same-task agent ping-pong has a local circuit breaker", () => {
  assert.equal(normalizeMaxTaskHandoffs(1), 2);
  assert.equal(normalizeMaxTaskHandoffs(999), 20);
  assert.match(background, /nextHandoffCount > maxTaskHandoffs/);
  assert.match(background, /stopReason: "task_handoff_limit"/);
});

test("team stream has duplicate-tab and revision-regression guards", () => {
  assert.match(background, /findConflictingTeamTab\(tabId, repositoryConfig, teamConfig\)/);
  assert.match(background, /runtime\.revision < previousRevision/);
  assert.match(background, /stopReason: "revision_regressed"/);
});

test("team content observes only armed Team executions and never auto-approves GitHub", () => {
  assert.match(content, /RERUN_TEAM_PROMPT/);
  assert.match(content, /armExecution\(executionToken\)/);
  assert.match(content, /new MutationObserver/);
  assert.match(content, /STABLE_IDLE_MS = 600/);
  assert.match(content, /type: "TEAM_TURN_FINISHED"/);
  assert.match(content, /findGitHubApprovalCard\(\)/);
  assert.doesNotMatch(content, /approval[\s\S]{0,80}\.click\(/i);
});

test("fallback polling can recover a missed finish event without polling the model", () => {
  assert.match(content, /type: "TEAM_POLL"/);
  assert.match(content, /idleStableForMs/);
  assert.match(background, /TEAM_TICK_RECOVERY_IDLE_MS/);
  assert.match(background, /trigger: "idle_recovery"/);
});

test("side panel exposes the Voyage Team controls in English", () => {
  assert.match(html, /The Voyage of Theseus/);
  assert.match(html, /Minds change\. The voyage continues\./);
  assert.match(html, /src="team-panel\.js"/);
  assert.match(panel, /Voyage Team/);
  assert.match(panel, /id="teamGoal"/);
  assert.match(panel, /id="teamMaxTaskHandoffs"/);
  assert.match(panel, /Start Team/);
  assert.match(panel, /TEAM_START/);
  assert.match(panel, /Single watcher mode is running/);
  assert.match(panel, /singleToggle\.disabled = Boolean\(teamState\.enabled\)/);
  assert.match(background, /stopTeam\(tabId, "single_watcher_started"\)/);
});

test("manifest exposes The Voyage of Theseus while retaining v0.4 runtime wiring", () => {
  assert.equal(manifest.name, "The Voyage of Theseus");
  assert.equal(manifest.version, "0.4.0");
  assert.equal(manifest.background?.service_worker, "background-v04.js");
  assert.deepEqual(manifest.content_scripts?.[0]?.js, [
    "content.js",
    "turn-observer.js",
    "team-content.js"
  ]);
});
