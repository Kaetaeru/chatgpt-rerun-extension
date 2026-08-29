import test from "node:test";
import assert from "node:assert/strict";
import { buildExecutorPrompt, parseRerunResult } from "../goal.js";

test("executor prompt keeps repository authority above the Rerun goal", () => {
  const prompt = buildExecutorPrompt({
    repository: "Kaetaeru/SimpleVTT",
    branch: "work/v1-composite",
    goal: "Finish V1",
    acceptance: "Tests pass",
    authorityPaths: "AGENTS.md, V1_CURRENT_HANDOFF.md"
  }, { runId: "run-abc", iteration: 2, lastCheckpoint: "MP-01 remains" });
  assert.match(prompt, /repository-native authoritative instructions, plans, specifications, and acceptance criteria override the Rerun goal/i);
  assert.match(prompt, /Never create or maintain a separate Rerun project plan/i);
  assert.match(prompt, /RERUN_RESULT/);
  assert.match(prompt, /run_id: run-abc/);
  assert.match(prompt, /execution: 3/);
});

test("parser reads only the final RERUN_RESULT block", () => {
  const parsed = parseRerunResult(`Earlier RERUN_RESULT\nrun_id: old\nexecution: 1\nstatus: COMPLETE\ncheckpoint: old\n\nWork done.\n\nRERUN_RESULT\nrun_id: run-abc\nexecution: 3\nstatus: CONTINUE\ncheckpoint: MP-01 validation remains`);
  assert.deepEqual(parsed, { runId: "run-abc", execution: 3, status: "CONTINUE", checkpoint: "MP-01 validation remains" });
});

test("parser rejects malformed result", () => {
  assert.equal(parseRerunResult("RERUN_RESULT\nrun_id: x\nexecution: 1\nstatus: MAYBE\ncheckpoint: x"), null);
  assert.equal(parseRerunResult("No result"), null);
});
