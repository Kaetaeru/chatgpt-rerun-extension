import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../popup.html", import.meta.url), "utf8");

test("GitHub rate limiting pauses polling instead of stopping the watcher", () => {
  assert.match(background, /rateLimitPausedUntil/);
  assert.match(background, /reason: "rate_limit"/);
  assert.match(background, /action: "rate_limited_wait"/);
  assert.doesNotMatch(background, /GitHub API rate limit reached; wait for reset or use a token/);
});

test("primary and secondary rate-limit responses derive a retry time", () => {
  assert.match(background, /response\.headers\.get\("retry-after"\)/);
  assert.match(background, /x-ratelimit-reset/);
  assert.match(background, /secondary rate limit\|abuse detection/i);
});

test("unauthenticated watcher count participates in the effective poll interval", () => {
  assert.match(background, /countEnabledUnauthenticatedWatchers\(\)/);
  assert.match(background, /effectivePollInterval\([\s\S]*unauthenticatedWatcherCount/);
});

test("fresh-chat handoff can fall back to cached runtime state during an API pause", () => {
  assert.match(background, /async function controlForHandoff/);
  assert.match(background, /const cached = cacheFor\(config\)\.cachedControl/);
  assert.match(background, /runtime\.lastRunId/);
});

test("side panel shows API polling state instead of raw remaining quota", () => {
  assert.match(html, /API polling/);
  assert.doesNotMatch(html, /Rate remaining/);
  assert.match(popup, /Paused until/);
  assert.match(popup, /Authenticated · conditional/);
  assert.match(popup, /Public · rate-safe/);
});
