export const ORACLE_RUNTIME_PATH = ".patient-oracle/runtime.json";
export const ORACLE_CONTRACT_PATH = ".patient-oracle/CONTRACT.md";
export const ORACLE_STATUSES = new Set(["ready", "complete", "needs_user", "blocked"]);
export const ORACLE_TERMINAL_STATUSES = new Set(["complete", "needs_user", "blocked"]);

const ORACLE_CONFIG_PREFIX = "patientOracleConfig:";
const ORACLE_STATE_PREFIX = "patientOracleState:";

export const DEFAULT_ORACLE_CONFIG = Object.freeze({
  path: ORACLE_RUNTIME_PATH,
  pollIntervalSeconds: 90,
  maxRedispatchesPerRequest: 6
});

export const DEFAULT_ORACLE_STATE = Object.freeze({
  enabled: false,
  streamKey: null,
  dispatching: false,
  executing: false,
  executionToken: null,
  executionStartedAt: null,
  executionHardStopAt: null,
  checkpointAt: null,
  lastRunId: null,
  lastRevision: -1,
  lastDispatchedRevision: -1,
  currentRequestId: null,
  requestDispatchCount: 0,
  lastStatus: null,
  lastReason: null,
  lastCheckedAt: null,
  lastDispatchAt: null,
  lastFinishedAt: null,
  rateLimitPausedUntil: null,
  rateLimitRemaining: null,
  rateLimitResetAt: null,
  stopReason: null,
  lastError: null
});

export function oracleConfigKey(tabId) {
  return `${ORACLE_CONFIG_PREFIX}${normalizeTabId(tabId)}`;
}

export function oracleStateKey(tabId) {
  return `${ORACLE_STATE_PREFIX}${normalizeTabId(tabId)}`;
}

export function parseOracleRuntimePayload(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("oracle runtime is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("oracle runtime must contain a JSON object");
  }

  const allowedKeys = new Set([
    "version", "run_id", "revision", "status", "request_id", "reason", "updated_at"
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`oracle runtime contains unsupported fields: ${unknownKeys.join(", ")}`);
  }

  if (value.version !== 1) throw new Error("oracle runtime version must be 1");
  if (typeof value.run_id !== "string" || !value.run_id.trim()) {
    throw new Error("oracle runtime run_id must be a non-empty string");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("oracle runtime revision must be a non-negative integer");
  }
  if (!ORACLE_STATUSES.has(value.status)) {
    throw new Error(`Unsupported oracle runtime status: ${String(value.status)}`);
  }
  if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) {
    throw new Error("oracle runtime updated_at must be an ISO-8601 date-time string");
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    throw new Error("oracle runtime reason must be a string when present");
  }

  const requestId = typeof value.request_id === "string" ? value.request_id.trim() : "";
  if (value.status === "ready" && !requestId) {
    throw new Error("ready oracle runtime requires a non-empty request_id");
  }
  if (value.request_id !== undefined && !requestId) {
    throw new Error("oracle runtime request_id must be non-empty when present");
  }

  return {
    version: 1,
    runId: value.run_id.trim(),
    revision: value.revision,
    status: value.status,
    requestId,
    reason: typeof value.reason === "string" ? value.reason : "",
    updatedAt: value.updated_at
  };
}

export function parseOracleRequestPayload(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("oracle request is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("oracle request must contain a JSON object");
  }

  const allowedKeys = new Set([
    "version", "request_id", "prompt", "created_at", "response_format", "metadata"
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`oracle request contains unsupported fields: ${unknownKeys.join(", ")}`);
  }

  if (value.version !== 1) throw new Error("oracle request version must be 1");
  if (typeof value.request_id !== "string" || !value.request_id.trim()) {
    throw new Error("oracle request request_id must be a non-empty string");
  }
  if (typeof value.prompt !== "string" || !value.prompt.trim()) {
    throw new Error("oracle request prompt must be a non-empty string");
  }
  if (typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) {
    throw new Error("oracle request created_at must be an ISO-8601 date-time string");
  }
  if (value.response_format !== undefined && typeof value.response_format !== "string") {
    throw new Error("oracle request response_format must be a string when present");
  }
  if (value.metadata !== undefined && (!value.metadata || typeof value.metadata !== "object" || Array.isArray(value.metadata))) {
    throw new Error("oracle request metadata must be an object when present");
  }

  return {
    version: 1,
    requestId: value.request_id.trim(),
    prompt: value.prompt,
    createdAt: value.created_at,
    responseFormat: typeof value.response_format === "string" ? value.response_format : "",
    metadata: value.metadata || null
  };
}

export function normalizeMaxRedispatches(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_ORACLE_CONFIG.maxRedispatchesPerRequest;
  return Math.min(20, Math.max(1, Math.floor(parsed)));
}

export function createExecutionBudget(nowMs = Date.now()) {
  const hardStopMs = nowMs + 20 * 60 * 1000;
  const checkpointMs = nowMs + 18 * 60 * 1000;
  return {
    startedAt: new Date(nowMs).toISOString(),
    checkpointAt: new Date(checkpointMs).toISOString(),
    hardStopAt: new Date(hardStopMs).toISOString()
  };
}

export function buildOracleWorkerPrompt(runtime, request, repositoryConfig, oracleConfig, budget) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const runtimePath = normalizedOraclePath(oracleConfig.path);
  const requestPath = `.patient-oracle/requests/${request.requestId}.json`;
  const responsePath = `.patient-oracle/responses/${request.requestId}.json`;

  return [
    "You are the Patient Oracle worker. Treat this ChatGPT conversation as disposable execution state; GitHub is the only durable source of truth.",
    `Target GitHub repository: ${owner}/${repo}, branch ${branch}.`,
    `Runtime: ${runtimePath}; run_id=${runtime.runId}; revision=${runtime.revision}; request_id=${runtime.requestId}.`,
    `Read ${ORACLE_CONTRACT_PATH}, then ${runtimePath}, then ${requestPath}. If current GitHub state differs from this prompt, GitHub is authoritative.`,
    `The user's question is stored in ${requestPath}. Do not rely on this prompt as a replacement for reading the request file.`,
    `Write the durable result to ${responsePath}. The extension will not scrape your assistant answer from the DOM.`,
    "For a successful answer, write response JSON first, verify it exists, then update runtime.json last with a higher revision and status `complete` for the same request_id.",
    "If a human decision or manual permission is required, write durable reason/state and publish a higher runtime revision with `needs_user`. If safe progress is impossible, use `blocked`.",
    `Execution started at ${budget.startedAt}. The 18-minute checkpoint begins at ${budget.checkpointAt}. Hard stop is before ${budget.hardStopAt}.`,
    "At the checkpoint, do not begin new long operations. Prioritize durable GitHub state. If the answer cannot be completed safely before the hard stop, do not pretend it is complete: preserve the same request identity, publish a higher `ready` runtime revision for continuation, and end before 20 minutes.",
    "Never click or attempt to bypass GitHub approval/OAuth/admin controls. If ChatGPT presents an approval decision, wait for the user.",
    "Do not invent repository state, test results, citations, or completed writes. Verify before declaring complete."
  ].join(" ");
}

export function oracleStreamKey(repositoryConfig, oracleConfig) {
  return [
    repositoryConfig.owner,
    repositoryConfig.repo,
    repositoryConfig.branch || "main",
    oracleConfig.path || ORACLE_RUNTIME_PATH
  ].map((part) => String(part || "").trim()).join("/");
}

export function oracleRequestPath(requestId) {
  const id = String(requestId || "").trim();
  if (!id || id.includes("/") || id.includes("..")) throw new Error("invalid oracle request ID");
  return `.patient-oracle/requests/${id}.json`;
}

function normalizedOraclePath(path) {
  return String(path || ORACLE_RUNTIME_PATH).replace(/^\/+/, "").trim() || ORACLE_RUNTIME_PATH;
}

function normalizeTabId(tabId) {
  const value = Number(tabId);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("A valid Chrome tab ID is required");
  return value;
}
