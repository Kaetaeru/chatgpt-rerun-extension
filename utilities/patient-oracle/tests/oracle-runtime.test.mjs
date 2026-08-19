import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  createExecutionBudget,
  normalizeMaxRedispatches,
  oracleRequestPath,
  parseOracleRequestPayload,
  parseOracleRuntimePayload
} from "../oracle-control.js";

const content = readFileSync(new URL("../oracle-content.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../oracle-background.js", import.meta.url), "utf8");
const safety = readFileSync(new URL("../oracle-safety.js", import.meta.url), "utf8");
const contract = readFileSync(new URL("../CONTRACT.md", import.meta.url), "utf8");

test("strict runtime accepts ready request identity", () => {
  const runtime = parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "oracle-run-1",
    revision: 4,
    status: "ready",
    request_id: "REQ-004",
    reason: "answer the next request",
    updated_at: "2026-08-20T03:00:00+09:00"
  }));
  assert.equal(runtime.requestId, "REQ-004");
  assert.equal(runtime.revision, 4);
});

test("runtime rejects unknown fields, bad revisions, and ready without request", () => {
  assert.throws(() => parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "x",
    revision: 1,
    status: "ready",
    updated_at: "2026-08-20T03:00:00+09:00"
  })), /requires a non-empty request_id/);
  assert.throws(() => parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "x",
    revision: -1,
    status: "blocked",
    updated_at: "2026-08-20T03:00:00+09:00"
  })), /non-negative integer/);
  assert.throws(() => parseOracleRuntimePayload(JSON.stringify({
    version: 1,
    run_id: "x",
    revision: 1,
    status: "blocked",
    updated_at: "2026-08-20T03:00:00+09:00",
    chat_text: "forbidden"
  })), /unsupported fields/);
});

test("request parser is strict and path traversal is rejected", () => {
  const request = parseOracleRequestPayload(JSON.stringify({
    version: 1,
    request_id: "REQ-001",
    prompt: "Explain the architecture",
    created_at: "2026-08-20T03:00:00+09:00"
  }));
  assert.equal(request.prompt, "Explain the architecture");
  assert.equal(oracleRequestPath("REQ-001"), ".patient-oracle/requests/REQ-001.json");
  assert.throws(() => oracleRequestPath("../secret"), /invalid oracle request ID/);
});

test("execution budget preserves the inherited 18 minute checkpoint and 20 minute hard stop", () => {
  const start = Date.parse("2026-08-20T00:00:00Z");
  const budget = createExecutionBudget(start);
  assert.equal(Date.parse(budget.checkpointAt) - start, 18 * 60 * 1000);
  assert.equal(Date.parse(budget.hardStopAt) - start, 20 * 60 * 1000);
  assert.match(contract, /20-minute execution law/);
  assert.match(contract, /Around minute 18/);
});

test("browser worker protects drafts and requires dispatch evidence", () => {
  assert.match(content, /user draft is protected/);
  assert.match(content, /waitForComposerText\(composer, prompt, 1500\)/);
  assert.match(content, /waitForDispatchEvidence\(4000\)/);
  assert.match(content, /dispatchEnter\(composer\)/);
});

test("browser worker never auto-approves GitHub and suppresses completion while approval is visible", () => {
  assert.match(content, /findGitHubApprovalCard\(\)/);
  assert.match(content, /deliberately never clicks approval\/OAuth\/admin controls/i);
  assert.doesNotMatch(content, /findGitHubApprovalCard\(\)[\s\S]{0,300}\.click\(/);
  assert.match(content, /if \(findGitHubApprovalCard\(\)\) return/);
});

test("browser worker has checkpoint and hard-stop failsafes", () => {
  assert.match(content, /PATIENT_ORACLE_CHECKPOINT_DUE/);
  assert.match(content, /PATIENT_ORACLE_HARD_STOP/);
  assert.match(content, /findStopButton\(\)/);
  assert.match(background, /20_minute_hard_stop/);
});

test("scheduler reconciles GitHub after finish and blocks duplicate or regressed revisions", () => {
  assert.match(background, /forceFetch: true, trigger: "turn_finished"/);
  assert.match(background, /runtime\.revision < state\.lastRevision/);
  assert.match(background, /revision_regressed/);
  assert.match(background, /runtime\.revision <= Number\(state\.lastDispatchedRevision/);
  assert.match(background, /already_dispatched/);
});

test("same request redispatch has a bounded circuit breaker", () => {
  assert.equal(normalizeMaxRedispatches(0), 1);
  assert.equal(normalizeMaxRedispatches(999), 20);
  assert.match(background, /request_redispatch_limit/);
});

test("GitHub rate limiting pauses without becoming a normal terminal response", () => {
  assert.match(background, /\[403, 429\]\.includes\(response\.status\)/);
  assert.match(background, /rateLimitPausedUntil/);
  assert.match(background, /retry-after/);
  assert.match(background, /x-ratelimit-reset/);
});

test("Patient Oracle conflicts with Single and Voyage Team and stops on stream mutation", () => {
  assert.match(safety, /Single Rerun watcher is active/);
  assert.match(safety, /Voyage Team is active/);
  assert.match(safety, /repository_connection_changed/);
  assert.match(safety, /oracle\.streamKey && oracle\.streamKey !== currentStreamKey/);
});

test("durable answer channel is GitHub, not assistant DOM scraping", () => {
  assert.match(contract, /never extracts the final answer from assistant DOM text/);
  assert.doesNotMatch(content, /assistant.*message.*text|conversation.*answer/i);
  assert.match(contract, /response artifact is written before the terminal runtime handoff/i);
});
