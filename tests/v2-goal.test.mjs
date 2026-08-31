import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutorPrompt,
  buildFreshChatResumePrompt,
  buildGoalSetupPrompt,
  buildWorkerPreflightPrompt,
  normalizeGoalFile,
  normalizeResultFile,
  normalizeWorkerReadyFile,
  workerReadyFileName
} from "../goal.js";

test("goal setup prompt binds the next goal file to a nonce", () => {
  const prompt = buildGoalSetupPrompt("nonce-123");
  assert.match(prompt, /Wait for the user's NEXT message/i);
  assert.match(prompt, /rerun-goal-nonce-123\.json/);
  assert.match(prompt, /"setup_nonce": "nonce-123"/);
  assert.match(prompt, /Do not start implementation yet/);
});

test("goal file is accepted only for the active setup request", () => {
  const value = {
    version: 2,
    kind: "chatgpt-rerun-goal",
    setup_nonce: "nonce-123",
    goal_id: "nonce-123",
    repository: "Kaetaeru/SimpleVTT",
    branch: "work/v1-composite",
    goal: "Finish V1",
    acceptance: ["Tests pass", "No blockers"],
    authority: ["AGENTS.md", "V1_CURRENT_HANDOFF.md"]
  };
  const normalized = normalizeGoalFile(value, "nonce-123");
  assert.equal(normalized.goalId, "nonce-123");
  assert.equal(normalized.config.repository, "Kaetaeru/SimpleVTT");
  assert.match(normalized.config.acceptance, /Tests pass\nNo blockers/);
  assert.throws(() => normalizeGoalFile(value, "different"), /does not match/);
});

test("executor prompt stays frozen and requires a fresh verified result artifact", () => {
  const config = {
    repository: "Kaetaeru/SimpleVTT",
    branch: "work/v1-composite",
    goal: "Finish V1",
    acceptance: "Tests pass",
    authorityPaths: "AGENTS.md"
  };
  const first = buildExecutorPrompt(config, { runId: "run-abc", goalId: "goal-abc", iteration: 1, lastCheckpoint: "old" });
  const later = buildExecutorPrompt(config, { runId: "run-abc", goalId: "goal-abc", iteration: 99, lastCheckpoint: "new" });
  assert.equal(first, later);
  assert.match(first, /repository-native authoritative instructions, plans, specifications, and acceptance criteria override the Rerun goal/i);
  assert.match(first, /rerun-result-goal-abc\.json/);
  assert.match(first, /fresh result artifact for this execution/i);
  assert.match(first, /never reuse, relink, or return a result artifact from a previous execution/i);
  assert.match(first, /JSON MUST contain "status": "COMPLETE"/);
  assert.match(first, /reopen it and verify that goal_id, result_id, status, and checkpoint/i);
  assert.doesNotMatch(first, /RERUN_RESULT\n/);
});

test("fresh-chat resume capsule is one-time material layered over the frozen prompt", () => {
  const frozen = "FROZEN EXECUTOR";
  const resumed = buildFreshChatResumePrompt(frozen, "  finished A   next B  ");
  assert.match(resumed, /^FROZEN EXECUTOR/);
  assert.match(resumed, /FRESH-CHAT RESUME CAPSULE/);
  assert.match(resumed, /finished A next B/);
  assert.equal(buildFreshChatResumePrompt(frozen, ""), frozen);
});

test("worker preflight requires real GitHub reads before a bound ready JSON", () => {
  const config = {
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    goal: "Finish worker pool",
    acceptance: "Tests pass",
    authorityPaths: "README.md"
  };
  const runtime = {
    runId: "run-abc",
    goalId: "goal-abc",
    workerIndex: 1,
    workerCount: 3,
    workerNonce: "worker-nonce"
  };
  const prompt = buildWorkerPreflightPrompt(config, runtime);
  assert.match(prompt, /Do NOT start the Goal Runner goal yet/);
  assert.match(prompt, /read repository metadata/i);
  assert.match(prompt, /second read-only GitHub action/i);
  assert.match(prompt, /Always allow|Allow all actions/);
  assert.match(prompt, new RegExp(workerReadyFileName("goal-abc", 1, "worker-nonce").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const parsed = normalizeWorkerReadyFile({
    version: 2,
    kind: "chatgpt-rerun-worker-ready",
    run_id: "run-abc",
    goal_id: "goal-abc",
    worker_index: 2,
    worker_nonce: "worker-nonce",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    status: "READY"
  }, {
    runId: "run-abc",
    goalId: "goal-abc",
    workerIndex: 1,
    workerNonce: "worker-nonce",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner"
  });
  assert.equal(parsed.workerIndex, 1);
  assert.throws(() => normalizeWorkerReadyFile({
    version: 2,
    kind: "chatgpt-rerun-worker-ready",
    run_id: "run-abc",
    goal_id: "goal-abc",
    worker_index: 1,
    worker_nonce: "wrong",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner",
    status: "READY"
  }, {
    runId: "run-abc",
    goalId: "goal-abc",
    workerIndex: 1,
    workerNonce: "worker-nonce",
    repository: "Kaetaeru/chatgpt-rerun-extension",
    branch: "agent/v2-goal-runner"
  }), /does not match/);
});

test("result file is validated by goal id and structured status", () => {
  const parsed = normalizeResultFile({
    version: 2,
    kind: "chatgpt-rerun-result",
    goal_id: "goal-abc",
    result_id: "result-001",
    status: "continue",
    checkpoint: "  MP-01 validation remains  "
  }, "goal-abc");
  assert.deepEqual(parsed, {
    goalId: "goal-abc",
    resultId: "result-001",
    status: "CONTINUE",
    checkpoint: "MP-01 validation remains"
  });
  assert.throws(() => normalizeResultFile({ ...parsed, version: 2, kind: "chatgpt-rerun-result", goal_id: "other" }, "goal-abc"), /does not match/);
});
