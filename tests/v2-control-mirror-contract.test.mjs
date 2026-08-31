import test from "node:test";
import assert from "node:assert/strict";
import { buildGoalSetupPrompt, buildExecutorPrompt, buildWorkerPreflightPrompt } from "../goal.js";

function assertMirror(prompt, filename) {
  assert.ok(prompt.includes(`RERUN_V2_CONTROL_BEGIN ${filename}`));
  assert.ok(prompt.includes("RERUN_V2_CONTROL_END"));
  assert.match(prompt, /downloadable JSON.*required|downloadable JSON file remains|downloadable JSON remains required/i);
}

test("goal, worker-ready, and result prompts require an inline transport mirror", () => {
  assertMirror(buildGoalSetupPrompt("nonce-1"), "rerun-goal-nonce-1.json");
  const config = {
    repository: "Kaetaeru/SimpleVTT",
    branch: "work/v1-composite",
    goal: "Complete V1",
    acceptance: "done",
    authorityPaths: "docs/CURRENT.md"
  };
  assertMirror(buildExecutorPrompt(config, { runId: "run-1", goalId: "goal-1" }), "rerun-result-goal-1.json");
  assertMirror(
    buildWorkerPreflightPrompt(config, {
      runId: "run-1",
      goalId: "goal-1",
      workerNonce: "nonce-w",
      workerIndex: 0,
      workerCount: 10
    }),
    "rerun-worker-ready-goal-1-1-nonce-w.json"
  );
});
