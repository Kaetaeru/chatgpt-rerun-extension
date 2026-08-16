import test from "node:test";
import assert from "node:assert/strict";
import {
  effectivePollInterval,
  normalizeMaxRuns,
  parseControlPayload,
  streamKey
} from "../control.js";

test("parses a valid control payload", () => {
  assert.deepEqual(
    parseControlPayload(JSON.stringify({
      version: 1,
      run_id: "run-1",
      sequence: 4,
      status: "continue",
      reason: "next"
    })),
    {
      version: 1,
      runId: "run-1",
      sequence: 4,
      status: "continue",
      reason: "next"
    }
  );
});

test("rejects unknown statuses", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":1,"status":"go"}'),
    /Unsupported control status/
  );
});

test("rejects an invalid sequence", () => {
  assert.throws(
    () => parseControlPayload('{"version":1,"run_id":"run-1","sequence":-1,"status":"continue"}'),
    /non-negative integer/
  );
});

test("unauthenticated polling is clamped to 60 seconds", () => {
  assert.equal(effectivePollInterval(5, false), 60);
});

test("authenticated polling is clamped to 5 seconds", () => {
  assert.equal(effectivePollInterval(1, true), 5);
});

test("max runs is bounded", () => {
  assert.equal(normalizeMaxRuns(0), 1);
  assert.equal(normalizeMaxRuns(999), 100);
});

test("stream key changes with repository coordinates", () => {
  assert.equal(
    streamKey({ owner: "a", repo: "b", branch: "main", path: "x.json" }),
    "a/b/main/x.json"
  );
});
