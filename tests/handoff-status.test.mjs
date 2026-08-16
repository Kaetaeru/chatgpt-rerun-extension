import test from "node:test";
import assert from "node:assert/strict";
import { buildNewChatHandoffPrompt } from "../control.js";

const config = {
  owner: "Kaetaeru",
  repo: "chatgpt-rerun-extension",
  branch: "agent/mvp-autoresume",
  path: ".chatgpt-rerun/control.json"
};

function control(status) {
  return {
    runId: "run-1",
    sequence: 9,
    status,
    taskId: "V02-009"
  };
}

test("continue handoff restores context and resumes work", () => {
  const prompt = buildNewChatHandoffPrompt(config, control("continue"));
  assert.match(prompt, /run_id=run-1, sequence=9, status=continue, task_id=V02-009/);
  assert.match(prompt, /실제 작업을 재개해/);
  assert.doesNotMatch(prompt, /실제 구현 task를 시작하지 마/);
});

test("needs_user handoff restores context without starting implementation", () => {
  const prompt = buildNewChatHandoffPrompt(config, control("needs_user"));
  assert.match(prompt, /status=needs_user/);
  assert.match(prompt, /실제 구현 task를 시작하지 마/);
  assert.match(prompt, /watcher는 계속 GitHub를 감시/);
  assert.match(prompt, /유효한 `continue`가 오면/);
});

test("complete and blocked handoffs also remain watcher transfers", () => {
  for (const status of ["complete", "blocked"]) {
    const prompt = buildNewChatHandoffPrompt(config, control(status));
    assert.match(prompt, new RegExp(`status=${status}`));
    assert.match(prompt, /GitHub 문서와 run context만 복구/);
    assert.match(prompt, /표준 재개 프롬프트로 자동 실행/);
  }
});
