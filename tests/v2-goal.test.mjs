import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExecutorPrompt,
  buildGoalSetupPrompt,
  normalizeGoalFile,
  normalizeResultFile
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

test("executor prompt is frozen across iterations and requires result JSON", () => {
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
  assert.match(first, /"kind": "chatgpt-rerun-result"/);
  assert.doesNotMatch(first, /RERUN_RESULT\n/);
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
