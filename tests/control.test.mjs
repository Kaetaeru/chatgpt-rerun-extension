import test from "node:test";
import assert from "node:assert/strict";
import {
  continuationDisposition,
  effectivePollInterval,
  effectiveRetryDelay,
  normalizeMaxRetries,
  normalizeMaxRuns,
  parseControlPayload,
  streamKey
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
  assert.deepEqual(
    parseControlPayload(JSON.stringify({
      version: 1,
      run_id: "run-1",
      sequence: 4,
      status: "continue",
      reason: "next",
      updated_at: "2026-08-16T12:00:00Z",
      task_id: "TASK-004"
    })),
    control
  );
});

test("rejects deprecated working status", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"working","updated_at":"2026-08-16T12:00:00Z"}'),
    /Unsupported control status/
  );
});

test("rejects an invalid sequence", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":-1,"status":"continue","updated_at":"2026-08-16T12:00:00Z"}'),
    /non-negative integer/
  );
});

test("requires updated_at", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"continue"}'),
    /updated_at/
  );
});

test("rejects unknown control fields", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"continue","updated_at":"2026-08-16T12:00:00Z","statsu":"continue"}'),
    /unsupported fields/
  );
});

test("unauthenticated polling is clamped to 60 seconds", () => {
  assert.equal(effectivePollInterval(5, false), 60);
});

test("authenticated polling is clamped to 5 seconds", () => {
  assert.equal(effectivePollInterval(1, true), 5);
});

test("retry delay stays beyond the GitHub polling interval", () => {
  assert.equal(effectiveRetryDelay(10, 60), 65);
  assert.equal(effectiveRetryDelay(180, 60), 180);
});

test("retry count is bounded", () => {
  assert.equal(normalizeMaxRetries(-1), 0);
  assert.equal(normalizeMaxRetries(99), 10);
});

test("max runs is bounded", () => {
  assert.equal(normalizeMaxRuns(0), 1);
  assert.equal(normalizeMaxRuns(999), 100);
});

test("new sequence is sent immediately", () => {
  assert.deepEqual(
    continuationDisposition(control, {
      lastHandledSequence: 3,
      lastSentAt: null,
      sameSequenceRetryCount: 0,
      maxRetriesPerSequence: 2,
      retryDelaySeconds: 120,
      pollIntervalSeconds: 60
    }, Date.parse("2026-08-16T12:01:00Z")),
    { action: "send", isRetry: false }
  );
});

test("same sequence waits until retry delay elapses", () => {
  const decision = continuationDisposition(control, {
    lastHandledSequence: 4,
    lastSentAt: "2026-08-16T12:00:00Z",
    sameSequenceRetryCount: 0,
    maxRetriesPerSequence: 2,
    retryDelaySeconds: 120,
    pollIntervalSeconds: 60
  }, Date.parse("2026-08-16T12:01:00Z"));
  assert.equal(decision.action, "wait");
  assert.equal(decision.isRetry, true);
  assert.equal(decision.retryAfterMs, 60_000);
});

test("same sequence is retried after delay", () => {
  assert.deepEqual(
    continuationDisposition(control, {
      lastHandledSequence: 4,
      lastSentAt: "2026-08-16T12:00:00Z",
      sameSequenceRetryCount: 0,
      maxRetriesPerSequence: 2,
      retryDelaySeconds: 120,
      pollIntervalSeconds: 60
    }, Date.parse("2026-08-16T12:02:01Z")),
    { action: "send", isRetry: true }
  );
});

test("same sequence stops after retry limit", () => {
  assert.deepEqual(
    continuationDisposition(control, {
      lastHandledSequence: 4,
      lastSentAt: "2026-08-16T12:00:00Z",
      sameSequenceRetryCount: 2,
      maxRetriesPerSequence: 2,
      retryDelaySeconds: 120,
      pollIntervalSeconds: 60
    }, Date.parse("2026-08-16T12:10:00Z")),
    { action: "retry_limit", isRetry: true }
  );
});

test("regressed sequence is treated as stale", () => {
  assert.deepEqual(
    continuationDisposition(control, {
      lastHandledSequence: 5,
      sameSequenceRetryCount: 0,
      maxRetriesPerSequence: 2,
      retryDelaySeconds: 120,
      pollIntervalSeconds: 60
    }),
    { action: "stale", isRetry: false }
  );
});

test("stream key changes with repository coordinates", () => {
  assert.equal(
    streamKey({ owner: "a", repo: "b", branch: "main", path: "x.json" }),
    "a/b/main/x.json"
  );
});
