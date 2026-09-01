import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerPreflightPrompt } from "../goal.js";

const config = {
  repository: "Kaetaeru/SimpleVTT",
  branch: "work/v1-composite",
  goal: "Complete V1",
  acceptance: "done",
  authorityPaths: "docs/CURRENT.md"
};

const runtime = {
  runId: "run-1",
  goalId: "goal-1",
  workerNonce: "worker-1",
  workerIndex: 0,
  workerCount: 10
};

test("worker preflight requires a real no-op GitHub write before READY", () => {
  const prompt = buildWorkerPreflightPrompt(config, runtime);

  assert.match(prompt, /WRITE capability/);
  assert.match(prompt, /MANDATORY WRITE-PERMISSION PROBE/);
  assert.match(prompt, /branch-ref WRITE action/);
  assert.match(prompt, /exact same HEAD SHA/);
  assert.match(prompt, /force=false/);
  assert.match(prompt, /real GitHub write-tool call/);
  assert.match(prompt, /Only continue after the write call itself succeeds/);
  assert.match(prompt, /verify that its HEAD is still exactly the SHA/);
  assert.match(prompt, /Do not create the ready JSON unless the GitHub WRITE probe actually succeeded/);
  assert.doesNotMatch(prompt, /Do not create, edit, delete, merge, or otherwise modify anything during preflight/);
});
