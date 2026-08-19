#!/usr/bin/env node

const API_ROOT = "https://api.github.com";
const DEFAULT_BRANCH = "main";
const DEFAULT_POLL_SECONDS = 5;
const DEFAULT_TIMEOUT_SECONDS = 30 * 60;
const RUNTIME_PATH = ".patient-oracle/runtime.json";

const [command = "", ...argv] = process.argv.slice(2);
const args = parseArgs(argv);

main().catch((error) => {
  console.error(`[patient-oracle] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

async function main() {
  if (!["enqueue", "wait", "ask"].includes(command)) {
    throw new Error("Usage: caller.mjs <enqueue|wait|ask> --owner OWNER --repo REPO [--branch BRANCH] [--prompt TEXT] [--id REQUEST_ID]");
  }

  const owner = requiredArg("owner");
  const repo = requiredArg("repo");
  const branch = String(args.branch || DEFAULT_BRANCH).trim() || DEFAULT_BRANCH;
  const token = String(process.env.GITHUB_TOKEN || "").trim();
  if (!token) throw new Error("GITHUB_TOKEN is required for GitHub request/runtime writes");

  const context = { owner, repo, branch, token };

  if (command === "enqueue") {
    const result = await enqueue(context, {
      requestId: args.id,
      prompt: requiredArg("prompt"),
      responseFormat: args["response-format"] || "",
      metadata: parseMetadata(args.metadata)
    });
    printJson(result);
    return;
  }

  if (command === "wait") {
    const result = await waitForResponse(context, {
      requestId: requiredArg("id"),
      pollSeconds: numberArg("poll-seconds", DEFAULT_POLL_SECONDS, 5, 300),
      timeoutSeconds: numberArg("timeout-seconds", DEFAULT_TIMEOUT_SECONDS, 5, 24 * 60 * 60)
    });
    printJson(result);
    return;
  }

  const queued = await enqueue(context, {
    requestId: args.id,
    prompt: requiredArg("prompt"),
    responseFormat: args["response-format"] || "",
    metadata: parseMetadata(args.metadata)
  });
  const result = await waitForResponse(context, {
    requestId: queued.request_id,
    pollSeconds: numberArg("poll-seconds", DEFAULT_POLL_SECONDS, 5, 300),
    timeoutSeconds: numberArg("timeout-seconds", DEFAULT_TIMEOUT_SECONDS, 5, 24 * 60 * 60)
  });
  printJson(result);
}

async function enqueue(context, input) {
  const requestId = normalizeRequestId(input.requestId || makeRequestId());
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new Error("prompt must be non-empty");

  const runtimeFile = await getContentFile(context, RUNTIME_PATH);
  const runtime = parseRuntime(runtimeFile.text);
  if (runtime.status !== "complete") {
    throw new Error(`runtime status is ${runtime.status}; only a terminal complete runtime may accept a new request`);
  }

  const requestPath = requestPathFor(requestId);
  const existing = await getContentFile(context, requestPath, { allow404: true });
  if (existing) throw new Error(`request ${requestId} already exists; request identities are immutable`);

  const now = new Date().toISOString();
  const request = {
    version: 1,
    request_id: requestId,
    prompt,
    created_at: now
  };
  if (input.responseFormat) request.response_format = String(input.responseFormat);
  if (input.metadata) request.metadata = input.metadata;

  await putContentFile(
    context,
    requestPath,
    request,
    `patient-oracle: enqueue ${requestId}`
  );

  const nextRuntime = {
    version: 1,
    run_id: runtime.run_id,
    revision: runtime.revision + 1,
    status: "ready",
    request_id: requestId,
    reason: "queued by Patient Oracle caller",
    updated_at: new Date().toISOString()
  };

  try {
    await putContentFile(
      context,
      RUNTIME_PATH,
      nextRuntime,
      `patient-oracle: dispatch ${requestId}`,
      runtimeFile.sha
    );
  } catch (error) {
    if (Number(error?.status) === 409 || Number(error?.status) === 422) {
      throw new Error(`runtime changed concurrently; ${requestPath} was created but was not authorized for dispatch. Do not overwrite runtime blindly. Inspect GitHub state and enqueue a new request identity when safe.`);
    }
    throw error;
  }

  return {
    request_id: requestId,
    request_path: requestPath,
    response_path: responsePathFor(requestId),
    runtime_revision: nextRuntime.revision,
    status: "ready"
  };
}

async function waitForResponse(context, options) {
  const requestId = normalizeRequestId(options.requestId);
  const responsePath = responsePathFor(requestId);
  const startedAt = Date.now();
  const timeoutMs = options.timeoutSeconds * 1000;
  let responseEtag = null;
  let runtimeEtag = null;

  while (Date.now() - startedAt < timeoutMs) {
    const responseFile = await getContentFile(context, responsePath, {
      allow404: true,
      etag: responseEtag
    });
    if (responseFile?.notModified) {
      responseEtag = responseFile.etag || responseEtag;
    } else if (responseFile) {
      responseEtag = responseFile.etag || responseEtag;
      const response = parseResponse(responseFile.text, requestId);
      if (response.status === "complete") {
        return {
          request_id: requestId,
          status: "complete",
          answer: response.answer,
          completed_at: response.completed_at,
          metadata: response.metadata || undefined
        };
      }
      return {
        request_id: requestId,
        status: response.status,
        reason: response.reason,
        completed_at: response.completed_at || null,
        metadata: response.metadata || undefined
      };
    }

    const runtimeFile = await getContentFile(context, RUNTIME_PATH, { etag: runtimeEtag });
    if (runtimeFile?.notModified) {
      runtimeEtag = runtimeFile.etag || runtimeEtag;
    } else if (runtimeFile) {
      runtimeEtag = runtimeFile.etag || runtimeEtag;
      const runtime = parseRuntime(runtimeFile.text);
      if (runtime.request_id === requestId && ["needs_user", "blocked"].includes(runtime.status)) {
        return {
          request_id: requestId,
          status: runtime.status,
          reason: runtime.reason || "Patient Oracle requires intervention"
        };
      }
    }

    await sleep(options.pollSeconds * 1000);
  }

  throw new Error(`timed out waiting for ${responsePath} after ${options.timeoutSeconds} seconds`);
}

async function getContentFile(context, path, { allow404 = false, etag = null } = {}) {
  const url = contentsUrl(context, path);
  const headers = githubHeaders(context.token);
  if (etag) headers["If-None-Match"] = etag;
  const response = await fetch(url, { method: "GET", headers, cache: "no-store" });

  if (response.status === 304) {
    return { notModified: true, etag: response.headers.get("etag") || etag };
  }
  if (response.status === 404 && allow404) return null;
  if (!response.ok) throw await githubError(response, `read ${path}`);

  const body = await response.json();
  if (body?.type !== "file" || typeof body?.content !== "string" || typeof body?.sha !== "string") {
    throw new Error(`GitHub ${path} did not resolve to a normal file`);
  }

  return {
    sha: body.sha,
    etag: response.headers.get("etag"),
    text: Buffer.from(body.content.replace(/\n/g, ""), "base64").toString("utf8")
  };
}

async function putContentFile(context, path, value, message, sha = null) {
  const body = {
    message,
    branch: context.branch,
    content: Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8").toString("base64")
  };
  if (sha) body.sha = sha;

  const response = await fetch(contentsUrl(context, path), {
    method: "PUT",
    headers: {
      ...githubHeaders(context.token),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await githubError(response, `write ${path}`);
  return response.json();
}

function parseRuntime(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("runtime.json is not valid JSON"); }
  const allowed = new Set(["version", "run_id", "revision", "status", "request_id", "reason", "updated_at"]);
  rejectUnknown(value, allowed, "runtime.json");
  if (value?.version !== 1) throw new Error("runtime.json version must be 1");
  if (typeof value.run_id !== "string" || !value.run_id.trim()) throw new Error("runtime.json run_id must be non-empty");
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) throw new Error("runtime.json revision must be a non-negative integer");
  if (!["ready", "complete", "needs_user", "blocked"].includes(value.status)) throw new Error(`unsupported runtime status ${String(value.status)}`);
  if (value.status === "ready" && (typeof value.request_id !== "string" || !value.request_id.trim())) throw new Error("ready runtime requires request_id");
  return value;
}

function parseResponse(text, requestId) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error("response JSON is invalid"); }
  const allowed = new Set(["version", "request_id", "status", "answer", "reason", "completed_at", "metadata"]);
  rejectUnknown(value, allowed, "response JSON");
  if (value?.version !== 1) throw new Error("response version must be 1");
  if (value.request_id !== requestId) throw new Error("response request_id does not match the requested identity");
  if (!["complete", "needs_user", "blocked"].includes(value.status)) throw new Error(`unsupported response status ${String(value.status)}`);
  if (value.status === "complete" && (typeof value.answer !== "string" || !value.answer.trim())) throw new Error("complete response requires a non-empty answer");
  if (value.status !== "complete" && (typeof value.reason !== "string" || !value.reason.trim())) throw new Error(`${value.status} response requires reason`);
  return value;
}

function rejectUnknown(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length) throw new Error(`${label} contains unsupported fields: ${unknown.join(", ")}`);
}

function requestPathFor(requestId) {
  return `.patient-oracle/requests/${normalizeRequestId(requestId)}.json`;
}

function responsePathFor(requestId) {
  return `.patient-oracle/responses/${normalizeRequestId(requestId)}.json`;
}

function normalizeRequestId(value) {
  const id = String(value || "").trim();
  if (!id || id.includes("/") || id.includes("..") || !/^[A-Za-z0-9._-]+$/.test(id)) {
    throw new Error("request id must use only letters, numbers, dot, underscore, or hyphen and may not contain path traversal");
  }
  return id;
}

function makeRequestId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `REQ-${stamp}-${suffix}`;
}

function contentsUrl(context, path) {
  const encoded = String(path).split("/").map(encodeURIComponent).join("/");
  const url = new URL(`${API_ROOT}/repos/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repo)}/contents/${encoded}`);
  url.searchParams.set("ref", context.branch);
  return url.toString();
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "patient-oracle-caller"
  };
}

async function githubError(response, action) {
  let detail = "";
  try {
    const body = await response.json();
    detail = body?.message ? `: ${body.message}` : "";
  } catch {}
  const error = new Error(`GitHub ${action} failed with HTTP ${response.status}${detail}`);
  error.status = response.status;
  return error;
}

function parseArgs(values) {
  const result = {};
  for (let index = 0; index < values.length; index += 1) {
    const token = values[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const key = token.slice(2);
    const next = values[index + 1];
    if (next === undefined || next.startsWith("--")) throw new Error(`missing value for --${key}`);
    result[key] = next;
    index += 1;
  }
  return result;
}

function requiredArg(name) {
  const value = String(args[name] || "").trim();
  if (!value) throw new Error(`--${name} is required`);
  return value;
}

function numberArg(name, fallback, min, max) {
  if (args[name] === undefined) return fallback;
  const value = Number(args[name]);
  if (!Number.isFinite(value)) throw new Error(`--${name} must be numeric`);
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function parseMetadata(value) {
  if (value === undefined) return null;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new Error("--metadata must be a JSON object string"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("--metadata must be a JSON object string");
  return parsed;
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
