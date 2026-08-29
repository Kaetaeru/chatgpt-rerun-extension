import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adapter = readFileSync(new URL("../sandbox-fetch.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

test("sandbox adapter loads before the Goal Runner content script", () => {
  assert.deepEqual(manifest.content_scripts[0].js, ["sandbox-fetch.js", "content.js"]);
  assert.match(packageJson.scripts.check, /node --check sandbox-fetch\.js/);
});

test("sandbox attachment fetch uses ChatGPT interpreter download metadata", () => {
  assert.match(adapter, /requestUrl\.toLowerCase\(\)\.startsWith\("sandbox:"\)/);
  assert.match(adapter, /\/backend-api\/conversation\/\$\{encodeURIComponent\(conversationId\)\}\/interpreter\/download/);
  assert.match(adapter, /message_id: messageId/);
  assert.match(adapter, /sandbox_path: sandboxPath/);
  assert.match(adapter, /metadata\?\.download_url/);
});

test("sandbox identity is bound to the current conversation and assistant message", () => {
  assert.match(adapter, /location\.pathname\.match\(\/\\\/c\\\/\(\[\^\/?#\]\+\)\/\)/);
  assert.match(adapter, /data-message-author-role=\\"assistant\\"/);
  assert.match(adapter, /data-message-id/);
});
