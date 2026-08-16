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

test("unauthenticated polling keeps headroom below the 60 per hour boundary", () => {
  assert.equal(effectivePollInterval(5, false), 90);
});

test("multiple unauthenticated watchers share a conservative aggregate request budget", () => {
  assert.equal(effectivePollInterval(5, false, 2), 180);
  assert.equal(effectivePollInterval(5, false, 3), 270);
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

test("tab storage keys are isolated by Chrome tab ID", () => {
  assert.equal(tabConfigKey(12), "tabConfig:12");
  assert.equal(tabRuntimeKey(12), "tabRuntime:12");
  assert.equal(tabDraftKey(12), "tabDraft:12");
  assert.equal(tabRuntimeKey(13), "tabRuntime:13");
  assert.notEqual(tabRuntimeKey(12), tabRuntimeKey(13));
});

test("runtime storage key parses its tab ID", () => {
  assert.equal(tabIdFromRuntimeKey("tabRuntime:42"), 42);
  assert.equal(tabIdFromRuntimeKey("tabConfig:42"), null);
  assert.equal(tabIdFromRuntimeKey("tabRuntime:nope"), null);
});

test("invalid tab IDs are rejected", () => {
  assert.throws(() => tabConfigKey(-1), /valid Chrome tab ID/);
  assert.throws(() => tabRuntimeKey("x"), /valid Chrome tab ID/);
});

test("Rerun connection prompt starts from actual conversation GitHub usage, not Side Panel hints", () => {
  const prompt = buildRerunConnectionPrompt({
    owner: "wrong-owner",
    repo: "wrong-repo",
    branch: "wrong-branch"
  });

  assert.match(prompt, /Side Panel은 최초 연결 전에는 의도적으로 Unconnected/);
  assert.match(prompt, /Side Panel 값이나 이 프롬프트 자체에 적힌 예시를 repository 식별 근거로 사용하지 마/);
  assert.match(prompt, /GitHub 앱\/도구로 실제 접근하거나 작업한 repository/);
  assert.doesNotMatch(prompt, /wrong-owner/);
  assert.doesNotMatch(prompt, /wrong-repo/);
  assert.doesNotMatch(prompt, /wrong-branch/);
});

test("Rerun connection prompt refuses writes when the chat is truly unconnected or ambiguous", () => {
  const prompt = buildRerunConnectionPrompt();

  assert.match(prompt, /RERUN_CONNECTION: UNCONNECTED/);
  assert.match(prompt, /아무 파일도 쓰지 말고/);
  assert.match(prompt, /RERUN_CONNECTION: AMBIGUOUS/);
  assert.match(prompt, /후보가 둘 이상/);
});

test("Rerun connection prompt reports complete connected repository coordinates and setup state", () => {
  const prompt = buildRerunConnectionPrompt();

  assert.match(prompt, /RERUN_CONNECTION: CONNECTED/);
  assert.match(prompt, /repository full name\(owner\/repo\)/);
  assert.match(prompt, /canonical GitHub repository URL/);
  assert.match(prompt, /정확한 branch\/ref/);
  assert.match(prompt, /control path/);
  assert.match(prompt, /run_id/);
  assert.match(prompt, /sequence/);
  assert.match(prompt, /control status/);
  assert.match(prompt, /task_id/);
  assert.match(prompt, /프로젝트 목표 요약/);
  assert.match(prompt, /assistant 답변을 파싱/);
});

test("Rerun connection prompt creates the five-file protocol but stops before implementation", () => {
  const prompt = buildRerunConnectionPrompt();

  assert.match(prompt, /README\.md/);
  assert.match(prompt, /PLAN\.md/);
  assert.match(prompt, /STATE\.md/);
  assert.match(prompt, /STATUS\.md/);
  assert.match(prompt, /control\.json/);
  assert.match(prompt, /기존 run_id, sequence, task, 검증 기록을 초기화하거나 덮어쓰지 마/);
  assert.match(prompt, /마지막 authoritative write/);
  assert.match(prompt, /실제 구현 task는 시작하지 말고 종료/);
});

test("auto-bootstrap only applies to the standard control path", () => {
  assert.equal(isAutoBootstrapPath({ path: ".chatgpt-rerun/control.json" }), true);
  assert.equal(isAutoBootstrapPath({ path: "/.chatgpt-rerun/control.json" }), true);
  assert.equal(isAutoBootstrapPath({ path: "automation/control.json" }), false);
});

test("repository bootstrap prompt creates the five-file protocol before work", () => {
  const prompt = buildRepositoryBootstrapPrompt({
    owner: "example",
    repo: "project",
    branch: "dev",
    path: ".chatgpt-rerun/control.json"
  });

  assert.match(prompt, /example\/project/);
  assert.match(prompt, /branch dev/);
  assert.match(prompt, /README\.md/);
  assert.match(prompt, /PLAN\.md/);
  assert.match(prompt, /STATE\.md/);
  assert.match(prompt, /STATUS\.md/);
  assert.match(prompt, /control\.json/);
  assert.match(prompt, /마지막으로만 control\.json/);
  assert.match(prompt, /첫 구현 task를 시작하지 말고 종료/);
  assert.match(prompt, /약 5분 freshness/);
});

test("new-chat handoff prompt contains durable GitHub coordinates", () => {
  const prompt = buildNewChatHandoffPrompt({
    owner: "Kaetaeru",
    repo: "chatgpt-rerun-extension",
    branch: "agent/mvp-autoresume",
    path: ".chatgpt-rerun/control.json"
  }, control);

  assert.match(prompt, /Kaetaeru\/chatgpt-rerun-extension/);
  assert.match(prompt, /agent\/mvp-autoresume/);
  assert.match(prompt, /run_id=run-1/);
  assert.match(prompt, /sequence=4/);
  assert.match(prompt, /이전 채팅 내용에 의존하거나/);
});
