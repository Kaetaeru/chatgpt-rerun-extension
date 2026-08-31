import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../pool-setup.html", import.meta.url), "utf8");
const script = readFileSync(new URL("../pool-setup.js", import.meta.url), "utf8");

test("worker pool setup loads as a module before using top-level await", () => {
  assert.match(script, /await refresh\(\);/);
  assert.match(html, /<script\s+type="module"\s+src="pool-setup\.js"><\/script>/);
});

test("worker pool setup button dispatches CREATE_WORKER_POOL", () => {
  assert.match(html, /id="createWorkers"[^>]*type="submit"/);
  assert.match(script, /type:\s*"CREATE_WORKER_POOL"/);
});
