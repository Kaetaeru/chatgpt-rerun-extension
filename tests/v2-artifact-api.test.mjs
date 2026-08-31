import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const isolated = readFileSync(new URL("../artifact-reader.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../page-artifact-reader.js", import.meta.url), "utf8");
const popup = readFileSync(new URL("../popup.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("artifact reader uses a MAIN-world authenticated resolver", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js", "conversation-limit.js", "artifact-reader.js"]);
  assert.deepEqual(manifest.content_scripts[1].js, ["page-artifact-reader.js"]);
  assert.equal(manifest.content_scripts[1].world, "MAIN");
  assert.match(packageJson.scripts.check, /conversation-limit\.js/);
  assert.match(packageJson.scripts.check, /artifact-reader\.js/);
  assert.match(packageJson.scripts.check, /page-artifact-reader\.js/);
});

test("page resolver uses ChatGPT session and Team account context", () => {
  assert.match(page, /\/api\/auth\/session/);
  assert.match(page, /session\?\.accessToken/);
  assert.match(page, /session\?\.account\?\.id/);
  assert.match(page, /chatgpt-account-id/);
});

test("sandbox artifacts resolve through conversation identity and supported download routes", () => {
  assert.match(page, /backend-api\/conversation/);
  assert.match(page, /interpreter\/download/);
  assert.match(page, /download_from_sandbox\/v2/);
  assert.match(page, /backend-api\/files\/download/);
  assert.match(page, /artifact_message_not_found/);
});

test("resolved JSON is exposed as a blob for the existing content protocol", () => {
  assert.match(isolated, /URL\.createObjectURL/);
  assert.match(isolated, /data-file-url/);
  assert.match(isolated, /sandbox:\/mnt\/data/);
  assert.doesNotMatch(isolated, /IMPORT_GOAL_FILE/);
  assert.doesNotMatch(isolated, /REPORT_RESULT_FILE/);
});

test("artifact reader waits instead of re-exposing any processed result id", () => {
  assert.match(isolated, /runtime\.processedResultIds/);
  assert.match(isolated, /processedResultIds\.includes\(resultId\)/);
  assert.match(isolated, /Waiting for a new result JSON from the active execution/);
});

test("side panel restores all readers on already-open ChatGPT tabs", () => {
  assert.match(popup, /ensureRerunScripts\(tabId\)/);
  assert.match(popup, /files: \["page-artifact-reader\.js"\]/);
  assert.match(popup, /world: "MAIN"/);
  assert.match(popup, /files: \["content\.js", "conversation-limit\.js", "artifact-reader\.js"\]/);
  assert.match(popup, /\["awaiting_goal_file", "ready", "dispatching", "generating"\]/);
});

test("artifact failures are visible in the side panel without mutating runtime", () => {
  assert.match(isolated, /v2:artifact:/);
  assert.match(popup, /getArtifactDiagnostic/);
  assert.match(popup, /Artifact reader:/);
});
