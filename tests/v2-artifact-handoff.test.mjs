import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const content = readFileSync(new URL("../content.js", import.meta.url), "utf8");
const background = readFileSync(new URL("../background.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("generated JSON discovery follows Patient Oracle file-card attributes", () => {
  assert.match(content, /data-download-url/);
  assert.match(content, /data-file-url/);
  assert.match(content, /data-href/);
  assert.match(content, /candidateUrls\(node\)/);
  assert.match(content, /for \(let depth = 0; parent && depth < 6/);
});

test("sandbox is treated as a hint while fetchable URLs are handed to background", () => {
  assert.match(content, /if \(url\.startsWith\("sandbox:"\)\) continue/);
  assert.match(content, /type: "FETCH_JSON_URL", url/);
  assert.match(background, /case "FETCH_JSON_URL"/);
  assert.match(background, /fetchGeneratedJsonUrl/);
});

test("background accepts only ChatGPT and oaiusercontent generated-file hosts", () => {
  assert.match(background, /url\.hostname === "chatgpt\.com"/);
  assert.match(background, /url\.hostname === "chat\.openai\.com"/);
  assert.match(background, /url\.hostname\.endsWith\("\.oaiusercontent\.com"\)/);
  assert.match(manifest.host_permissions.join("\n"), /https:\/\/\*\.oaiusercontent\.com\/\*/);
});

test("obsolete sandbox adapter is no longer part of the runtime", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["content.js"]);
  assert.doesNotMatch(packageJson.scripts.check, /sandbox-fetch/);
});
