import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const caller = readFileSync(new URL("../caller.mjs", import.meta.url), "utf8");

test("caller is GitHub-only and never treats ChatGPT DOM as a response API", () => {
  assert.match(caller, /https:\/\/api\.github\.com/);
  assert.doesNotMatch(caller, /chatgpt\.com|chat\.openai\.com|document\.querySelector|MutationObserver/i);
  assert.match(caller, /\.patient-oracle\/responses\//);
});

test("caller creates the immutable request before authorizing runtime", () => {
  const requestWrite = caller.indexOf("patient-oracle: enqueue ${requestId}");
  const runtimeWrite = caller.indexOf("patient-oracle: dispatch ${requestId}");
  assert.ok(requestWrite >= 0, "request write marker must exist");
  assert.ok(runtimeWrite > requestWrite, "runtime authorization must be written after the request artifact");
  assert.match(caller, /runtimeFile\.sha/);
  assert.match(caller, /runtime changed concurrently/);
});

test("caller serializes requests and refuses unsafe request identity reuse", () => {
  assert.match(caller, /runtime\.status !== "complete"/);
  assert.match(caller, /request identities are immutable/);
  assert.match(caller, /normalizeRequestId/);
  assert.match(caller, /may not contain path traversal/);
});

test("caller validates response identity before returning an answer", () => {
  assert.match(caller, /value\.request_id !== requestId/);
  assert.match(caller, /complete response requires a non-empty answer/);
  assert.match(caller, /needs_user/);
  assert.match(caller, /blocked/);
});

test("caller uses ref only for reads and branch body for writes", () => {
  assert.match(caller, /contentsReadUrl\(context, path\)/);
  assert.match(caller, /contentsWriteUrl\(context, path\)/);
  assert.match(caller, /url\.searchParams\.set\("ref", context\.branch\)/);
  assert.match(caller, /branch: context\.branch/);
  assert.match(caller, /fetch\(contentsWriteUrl\(context, path\)/);
});

test("caller polling cannot exceed the browser-friendly five-second minimum", () => {
  assert.match(caller, /DEFAULT_POLL_SECONDS = 5/);
  assert.match(caller, /numberArg\("poll-seconds", DEFAULT_POLL_SECONDS, 5, 300\)/);
});
