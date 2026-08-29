import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const artifact = readFileSync(new URL("../artifact-reader.js", import.meta.url), "utf8");
const pageArtifact = readFileSync(new URL("../page-artifact-reader.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("existing content protocol still accepts generated JSON through blob or HTTPS URLs", () => {
  assert.match(content, /data-file-url/);
  assert.match(content, /candidateUrls\(node\)/);
  assert.match(content, /url\.startsWith\("blob:"\)/);
  assert.match(content, /type: "FETCH_JSON_URL", url/);
});

test("authenticated artifact reader replaces direct sandbox and preview heuristics", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js", "artifact-reader.js"]);
  assert.deepEqual(manifest.content_scripts[1].js, ["page-artifact-reader.js"]);
  assert.equal(manifest.content_scripts[1].world, "MAIN");
  assert.match(pageArtifact, /interpreter\/download/);
  assert.match(pageArtifact, /backend-api\/files\/download/);
  assert.match(artifact, /URL\.createObjectURL/);
  assert.doesNotMatch(packageJson.scripts.check, /preview-reader/);
  assert.doesNotMatch(packageJson.scripts.check, /sandbox-fetch/);
});

test("background fallback accepts only ChatGPT and oaiusercontent generated-file hosts", () => {
  assert.match(background, /url\.hostname === "chatgpt\.com"/);
  assert.match(background, /url\.hostname === "chat\.openai\.com"/);
  assert.match(background, /url\.hostname\.endsWith\("\.oaiusercontent\.com"\)/);
  assert.match(manifest.host_permissions.join("\n"), /https:\/\/\*\.oaiusercontent\.com\/\*/);
});
