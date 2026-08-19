import test from "node:test";
import assert from "node:assert/strict";
import {
  buildNewChatHandoffPrompt,
  buildRepositoryBootstrapPrompt,
  buildRerunConnectionPrompt,
  continuationDisposition,
  effectivePollInterval,
  effectiveRetryDelay,
  isAutoBootstrapPath,
  normalizeMaxRetries,
  normalizeMaxRuns,
  parseControlPayload,
  streamKey,
  tabConfigKey,
  tabDraftKey,
  tabIdFromRuntimeKey,
  tabRuntimeKey
} from "../control.js";

const control = {
  version: 1,
  runId: "run-1",
  sequence: 4,
  status: "continue",
  reason: "next",
  updatedAt: "2026-08-16T12:00:00Z",
  taskId: "TASK-004"
};

test("parses a valid control payload", () => {
  assert.deepEqual(parseControlPayload(JSON.stringify({
    version: 1,
    run_id: "run-1",
    sequence: 4,
    status: "continue",
    reason: "next",
    updated_at: "2026-08-16T12:00:00Z",
    task_id: "TASK-004"
  })), control);
});

test("rejects deprecated working status", () => {
  assert.throws(() => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"working","updated_at":"2026-08-16T12:00:00Z"}'), /Unsupported control status/);
});

test("rejects invalid sequence and missing updated_at", () => {
  assert.throws(() => parseControlPayload('{"version":1,"run_id":"run-1","sequence":-1,"status":"continue","updated_at":"2026-08-16T12:00:00Z"}'), /non-negative integer/);
  assert.throws(() => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"continue"}'), /updated_at/);
});

test("rejects unknown control fields", () => {
  assert.throws(() => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"continue","updated_at":"2026-08-16T12:00:00Z","statsu":"continue"}'), /unsupported fields/);
});

test("polling and retry safety remain bounded", () => {
  assert.equal(effectivePollInterval(5, false), 90);
  assert.equal(effectivePollInterval(5, false, 2), 180);
  assert.equal(effectivePollInterval(5, false, 3), 270);
  assert.equal(effectivePollInterval(1, true), 5);
  assert.equal(effectiveRetryDelay(10, 60), 65);
  assert.equal(effectiveRetryDelay(180, 60), 180);
  assert.equal(normalizeMaxRetries(-1), 0);
  assert.equal(normalizeMaxRetries(99), 10);
});

test("legacy max runs values normalize to effectively unlimited", () => {
  assert.equal(normalizeMaxRuns(0), Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeMaxRuns(20), Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeMaxRuns(100), Number.MAX_SAFE_INTEGER);
  assert.equal(normalizeMaxRuns(999), Number.MAX_SAFE_INTEGER);
});

test("new and rewritten generations are fresh authorizations", () => {
  assert.deepEqual(continuationDisposition(control, {
    lastHandledSequence: 3,
    lastSentAt: null,
    sameSequenceRetryCount: 0,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:01:00Z")), { action: "send", isRetry: false });

  assert.deepEqual(continuationDisposition({ ...control, updatedAt: "2026-08-16T12:05:00Z" }, {
    lastHandledSequence: 4,
    lastSentAt: "2026-08-16T12:00:30Z",
    sameSequenceRetryCount: 2,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:05:10Z")), { action: "send", isRetry: false });
});

test("same sequence obeys retry delay and retry limit", () => {
  const decision = continuationDisposition(control, {
    lastHandledSequence: 4,
    lastSentAt: "2026-08-16T12:00:00Z",
    sameSequenceRetryCount: 0,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:01:00Z"));
  assert.equal(decision.action, "wait");
  assert.equal(decision.retryAfterMs, 60_000);

  assert.deepEqual(continuationDisposition(control, {
    lastHandledSequence: 4,
    lastSentAt: "2026-08-16T12:00:00Z",
    sameSequenceRetryCount: 0,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:02:01Z")), { action: "send", isRetry: true });

  assert.deepEqual(continuationDisposition(control, {
    lastHandledSequence: 4,
    lastSentAt: "2026-08-16T12:00:00Z",
    sameSequenceRetryCount: 2,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:10:00Z")), { action: "retry_limit", isRetry: true });
});

test("regressed sequence is stale", () => {
  assert.deepEqual(continuationDisposition(control, {
    lastHandledSequence: 5,
    sameSequenceRetryCount: 0,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }), { action: "stale", isRetry: false });
});

test("stream and tab storage keys remain isolated", () => {
  assert.equal(streamKey({ owner: "a", repo: "b", branch: "main", path: "x.json" }), "a/b/main/x.json");
  assert.equal(tabConfigKey(12), "tabConfig:12");
  assert.equal(tabRuntimeKey(12), "tabRuntime:12");
  assert.equal(tabDraftKey(12), "tabDraft:12");
  assert.equal(tabIdFromRuntimeKey("tabRuntime:42"), 42);
  assert.equal(tabIdFromRuntimeKey("tabConfig:42"), null);
  assert.throws(() => tabConfigKey(-1), /valid Chrome tab ID/);
});

test("connection prompt uses actual conversation GitHub usage, not Side Panel hints", () => {
  const prompt = buildRerunConnectionPrompt({
    owner: "wrong-owner",
    repo: "wrong-repo",
    branch: "wrong-branch"
  });
  assert.match(prompt, /The Voyage of Theseus/);
  assert.match(prompt, /Side Panel is intentionally Unconnected/);
  assert.match(prompt, /actually accessed or modified a GitHub repository/);
  assert.doesNotMatch(prompt, /wrong-owner/);
  assert.doesNotMatch(prompt, /wrong-repo/);
  assert.doesNotMatch(prompt, /wrong-branch/);
});

test("connection prompt refuses writes when unconnected or ambiguous", () => {
  const prompt = buildRerunConnectionPrompt();
  assert.match(prompt, /RERUN_CONNECTION: UNCONNECTED/);
  assert.match(prompt, /write no files/);
  assert.match(prompt, /RERUN_CONNECTION: AMBIGUOUS/);
});

test("connection prompt reports complete repository coordinates and stops before implementation", () => {
  const prompt = buildRerunConnectionPrompt();
  assert.match(prompt, /RERUN_CONNECTION: CONNECTED/);
  assert.match(prompt, /repository full name \(owner\/repo\)/);
  assert.match(prompt, /canonical GitHub repository URL/);
  assert.match(prompt, /exact branch\/ref/);
  assert.match(prompt, /control path/);
  assert.match(prompt, /run_id/);
  assert.match(prompt, /sequence/);
  assert.match(prompt, /control status/);
  assert.match(prompt, /task_id/);
  assert.match(prompt, /do not start the implementation task/);
});

test("auto-bootstrap only applies to the standard legacy protocol path", () => {
  assert.equal(isAutoBootstrapPath({ path: ".chatgpt-rerun/control.json" }), true);
  assert.equal(isAutoBootstrapPath({ path: "/.chatgpt-rerun/control.json" }), true);
  assert.equal(isAutoBootstrapPath({ path: "automation/control.json" }), false);
});

test("repository bootstrap prompt creates durable protocol before work", () => {
  const prompt = buildRepositoryBootstrapPrompt({
    owner: "example",
    repo: "project",
    branch: "dev",
    path: ".chatgpt-rerun/control.json"
  });
  assert.match(prompt, /The Voyage of Theseus state protocol/);
  assert.match(prompt, /example\/project/);
  assert.match(prompt, /branch dev/);
  assert.match(prompt, /README\.md/);
  assert.match(prompt, /PLAN\.md/);
  assert.match(prompt, /STATE\.md/);
  assert.match(prompt, /STATUS\.md/);
  assert.match(prompt, /control\.json/);
  assert.match(prompt, /Only after PLAN and STATE/);
  assert.match(prompt, /without implementing the first product task/);
});

test("new-chat handoff prompt contains durable GitHub coordinates", () => {
  const prompt = buildNewChatHandoffPrompt({
    owner: "Kaetaeru",
    repo: "chatgpt-rerun-extension",
    branch: "agent/mvp-autoresume",
    path: ".chatgpt-rerun/control.json"
  }, control);
  assert.match(prompt, /The Voyage of Theseus/);
  assert.match(prompt, /Kaetaeru\/chatgpt-rerun-extension/);
  assert.match(prompt, /agent\/mvp-autoresume/);
  assert.match(prompt, /run_id=run-1/);
  assert.match(prompt, /sequence=4/);
  assert.match(prompt, /do not depend on the previous conversation/);
});
