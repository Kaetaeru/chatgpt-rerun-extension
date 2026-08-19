import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_ORACLE_CONFIG,
  buildOracleWorkerPrompt,
  createExecutionBudget,
  parseOracleRequestPayload,
  parseOracleRuntimePayload
} from "../utilities/patient-oracle/oracle-control.js";

const wrapper = readFileSync(new URL("../background-v04.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../patient-oracle-background.js", import.meta.url), "utf8");
const panel = readFileSync(new URL("../patient-oracle-panel.js", import.meta.url), "utf8");
const panelSafety = readFileSync(new URL("../patient-oracle-panel-safety.js", import.meta.url), "utf8");
const oracleBackground = readFileSync(new URL("../utilities/patient-oracle/oracle-background.js", import.meta.url), "utf8");
const oracleContent = readFileSync(new URL("../utilities/patient-oracle/oracle-content.js", import.meta.url), "utf8");
const oracleSafety = readFileSync(new URL("../utilities/patient-oracle/oracle-safety.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

test("Patient Oracle runtime and request parsers keep strict durable identity", () => {
  const runtime = parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "oracle-1",
    revision: 4,
    status: "ready",
    request_id: "REQ-000001",
    reason: "queued",
    updated_at: "2026-08-20T03:00:00+09:00"
  }));
  assert.equal(runtime.runId, "oracle-1");
  assert.equal(runtime.revision, 4);
  assert.equal(runtime.requestId, "REQ-000001");

  const request = parseOracleRequestPayload(JSON.stringify({
    version: 1,
    request_id: "REQ-000001",
    prompt: "Answer from repository context",
    created_at: "2026-08-20T03:00:00+09:00"
  }));
  assert.equal(request.requestId, runtime.requestId);

  assert.throws(() => parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "oracle-1",
    revision: 4,
    status: "ready",
    request_id: "REQ-000001",
    updated_at: "2026-08-20T03:00:00+09:00",
    conversation_text: "unsafe"
  })), /unsupported fields/);
});

test("the inherited Rerun execution law is exactly 18-minute checkpoint and 20-minute hard stop", () => {
  const start = Date.parse("2026-08-20T03:00:00+09:00");
  const budget = createExecutionBudget(start);
  assert.equal(Date.parse(budget.checkpointAt) - start, 18 * 60 * 1000);
  assert.equal(Date.parse(budget.hardStopAt) - start, 20 * 60 * 1000);
});

test("worker prompt uses GitHub as durable response channel and preserves safe handoff rules", () => {
  const budget = createExecutionBudget(Date.parse("2026-08-20T03:00:00+09:00"));
  const prompt = buildOracleWorkerPrompt(
    { runId: "oracle-1", revision: 4, requestId: "REQ-000001" },
    { requestId: "REQ-000001" },
    { owner: "Kaetaeru", repo: "example", branch: "main" },
    DEFAULT_ORACLE_CONFIG,
    budget
  );
  assert.match(prompt, /GitHub is the only durable source of truth/);
  assert.match(prompt, /responses\/REQ-000001\.json/);
  assert.match(prompt, /will not scrape your assistant answer from the DOM/);
  assert.match(prompt, /18-minute checkpoint/);
  assert.match(prompt, /Hard stop is before/);
  assert.match(prompt, /higher `ready` runtime revision/);
  assert.match(prompt, /Never click or attempt to bypass GitHub approval\/OAuth\/admin controls/);
});

test("extension wiring loads Patient Oracle without changing the existing Team content-script tuple", () => {
  assert.match(wrapper, /import "\.\/patient-oracle-background\.js"/);
  assert.match(html, /src="patient-oracle-panel\.js"/);
  assert.match(html, /src="patient-oracle-panel-safety\.js"/);
  assert.deepEqual(manifest.content_scripts?.[0]?.js, [
    "content.js",
    "turn-observer.js",
    "team-content.js"
  ]);
  assert.deepEqual(manifest.content_scripts?.[1]?.js, [
    "utilities/patient-oracle/oracle-content.js"
  ]);
});

test("Patient Oracle Start performs safety preflight and bootstraps a missing runtime with the same time law", () => {
  assert.match(background, /assertOracleStartIsSafe\(tabId, repositoryConfig, oracleConfig\)/);
  assert.match(background, /isMissingRuntimeError\(error\)/);
  assert.match(background, /bootstrapOracle\(tabId, repositoryConfig, oracleConfig\)/);
  assert.match(background, /createExecutionBudget\(\)/);
  assert.match(background, /checkpoint at/);
  assert.match(background, /hard stop before/);
  assert.match(background, /Never click or bypass the approval yourself/);
  assert.match(background, /status complete/);
});

test("runtime safety stops conflicting modes and repository-coordinate mutation", () => {
  assert.match(oracleSafety, /Single Rerun watcher is active/);
  assert.match(oracleSafety, /Voyage Team is active/);
  assert.match(oracleSafety, /Patient Oracle stream is already owned by tab/);
  assert.match(oracleSafety, /repository_connection_changed/);
  assert.match(oracleSafety, /single_watcher_started/);
  assert.match(oracleSafety, /team_runtime_started/);
  assert.match(panelSafety, /#sessionToggle, #teamToggle/);
  assert.match(panelSafety, /patient-oracle-active/);
});

test("browser lifecycle keeps the inherited send, approval, completion, and hard-stop safeguards", () => {
  assert.match(oracleContent, /__PATIENT_ORACLE_CONTENT_LOADED__/);
  assert.match(oracleContent, /STABLE_IDLE_MS = 600/);
  assert.match(oracleContent, /PATIENT_ORACLE_TURN_FINISHED/);
  assert.match(oracleContent, /PATIENT_ORACLE_CHECKPOINT_DUE/);
  assert.match(oracleContent, /PATIENT_ORACLE_HARD_STOP/);
  assert.match(oracleContent, /findGitHubApprovalCard\(\)/);
  assert.doesNotMatch(oracleContent, /approval[\s\S]{0,100}\.click\(/i);
  assert.match(oracleBackground, /runtime\.revision < state\.lastRevision/);
  assert.match(oracleBackground, /already_dispatched/);
  assert.match(oracleBackground, /request_redispatch_limit/);
  assert.match(oracleBackground, /If-None-Match/);
  assert.match(oracleBackground, /\[403, 429\]/);
});

test("side panel exposes Oracle status and refuses to start beside Single or Team", () => {
  assert.match(panel, /Patient Oracle/);
  assert.match(panel, /Start Oracle/);
  assert.match(panel, /PATIENT_ORACLE_START/);
  assert.match(panel, /Single Rerun is active/);
  assert.match(panel, /Voyage Team is active/);
  assert.match(panel, /18m checkpoint/);
  assert.match(panel, /20m hard stop/);
});

test("npm check covers all Patient Oracle execution surfaces", () => {
  const check = String(pkg.scripts?.check || "");
  for (const file of [
    "patient-oracle-background.js",
    "patient-oracle-panel.js",
    "patient-oracle-panel-safety.js",
    "utilities/patient-oracle/oracle-control.js",
    "utilities/patient-oracle/oracle-background.js",
    "utilities/patient-oracle/oracle-content.js",
    "utilities/patient-oracle/oracle-safety.js"
  ]) {
    assert.match(check, new RegExp(file.replaceAll(".", "\\.")));
  }
});
