import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const preview = readFileSync(new URL("../preview-reader.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("preview reader loads alongside the normal content script", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js", "preview-reader.js"]);
  assert.match(packageJson.scripts.check, /node --check preview-reader\.js/);
});

test("file-id-only cards remain readable through ChatGPT preview", () => {
  assert.match(preview, /\[data-file-id\]/);
  assert.match(preview, /findNewestExactFileCard/);
  assert.match(preview, /target\.click\(\)/);
  assert.match(preview, /previewCandidates\(\)/);
  assert.match(preview, /readValidatedPreviewJson/);
});

test("friendly link labels still match JSON files by sandbox href filename", () => {
  assert.match(preview, /filenameFromHref\(node\.getAttribute\?\.\("href"\)\)/);
  assert.match(preview, /raw\.startsWith\("sandbox:"\)/);
  assert.match(preview, /path\.split\("\/"\)\.pop\(\)/);
});

test("goal preview is nonce-bound before import", () => {
  assert.match(preview, /value\.kind !== "chatgpt-rerun-goal"/);
  assert.match(preview, /value\.setup_nonce/);
  assert.match(preview, /value\.goal_id/);
  assert.match(preview, /type: mode === "goal" \? "IMPORT_GOAL_FILE" : "REPORT_RESULT_FILE"/);
});

test("result preview ignores the last processed result id", () => {
  assert.match(preview, /value\.result_id/);
  assert.match(preview, /runtime\.lastResultId/);
  assert.match(preview, /nextAttemptAt = Date\.now\(\) \+ RETRY_MS/);
});
