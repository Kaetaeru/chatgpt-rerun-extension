import {
  DEFAULT_ORACLE_CONFIG,
  DEFAULT_ORACLE_STATE,
  ORACLE_TERMINAL_STATUSES,
  buildOracleWorkerPrompt,
  createExecutionBudget,
  normalizeMaxRedispatches,
  oracleConfigKey,
  oracleRequestPath,
  oracleStateKey,
  oracleStreamKey,
  parseOracleRequestPayload,
  parseOracleRuntimePayload
} from "./oracle-control.js";

const ORACLE_CONTENT_PORT = "patient-oracle-content";
const RECOVERY_IDLE_MS = 1500;
const MIN_EXECUTION_MS = 5000;
const caches = new Map();

export function installPatientOracleRuntime({ loadRepositoryConfig }) {
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== ORACLE_CONTENT_PORT) return;
    const tabId = port.sender?.tab?.id;
    if (!Number.isSafeInteger(tabId)) return;
    port.onMessage.addListener((message) => {
      void handleContentMessage(tabId, message, loadRepositoryConfig).catch((error) => {
        void updateState(tabId, { lastError: error instanceof Error ? error.message : String(error) });
      });
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void chrome.storage.local.remove([oracleConfigKey(tabId), oracleStateKey(tabId)]);
  });
}

export async function startOracle(tabId, repositoryConfig, patch = {}) {
  const config = await saveConfig(tabId, patch);
  const streamKey = oracleStreamKey(repositoryConfig, config);
  const conflict = await findConflictingOracleTab(tabId, repositoryConfig, config);
  if (conflict !== null) throw new Error(`Patient Oracle stream is already owned by tab ${conflict}`);

  const previous = await loadState(tabId);
  await updateState(tabId, {
    ...DEFAULT_ORACLE_STATE,
    enabled: true,
    streamKey,
    lastRunId: previous.streamKey === streamKey ? previous.lastRunId : null,
    lastRevision: previous.streamKey === streamKey ? previous.lastRevision : -1,
    lastDispatchedRevision: previous.streamKey === streamKey ? previous.lastDispatchedRevision : -1,
    stopReason: null,
    lastError: null
  });

  await ensureContentScript(tabId);
  return pollOracle(tabId, repositoryConfig, { forceFetch: true, trigger: "start" });
}

export async function stopOracle(tabId, reason = "manual") {
  await updateState(tabId, {
    enabled: false,
    dispatching: false,
    executing: false,
    executionToken: null,
    stopReason: reason
  });
  return { action: "stopped", reason };
}

async function handleContentMessage(tabId, message, loadRepositoryConfig) {
  const state = await loadState(tabId);
  if (!state.enabled) return { action: "none" };
  const repositoryConfig = await loadRepositoryConfig(tabId);

  if (message?.type === "PATIENT_ORACLE_TURN_FINISHED") {
    if (!state.executing || (state.executionToken && state.executionToken !== message.executionToken)) {
      return { action: "none", reason: "stale_execution" };
    }
    await updateState(tabId, {
      executing: false,
      executionToken: null,
      lastFinishedAt: new Date().toISOString()
    });
    return pollOracle(tabId, repositoryConfig, { forceFetch: true, trigger: "turn_finished" });
  }

  if (message?.type === "PATIENT_ORACLE_CHECKPOINT_DUE") {
    if (state.executionToken === message.executionToken) {
      await updateState(tabId, { lastReason: "18-minute checkpoint due" });
    }
    return { action: "checkpoint_due" };
  }

  if (message?.type === "PATIENT_ORACLE_HARD_STOP") {
    if (state.executionToken === message.executionToken) {
      await updateState(tabId, {
        enabled: false,
        executing: false,
        executionToken: null,
        stopReason: "20_minute_hard_stop",
        lastError: message.approvalVisible
          ? "20-minute hard stop reached while GitHub approval remained pending"
          : "20-minute hard stop reached before a durable GitHub handoff was observed"
      });
    }
    return { action: "hard_stopped" };
  }

  if (message?.type === "PATIENT_ORACLE_POLL") {
    const dispatchAt = Date.parse(String(state.lastDispatchAt || ""));
    const age = Number.isFinite(dispatchAt) ? Date.now() - dispatchAt : 0;
    if (state.executing && !message.approvalVisible && Number(message.idleStableForMs || 0) >= RECOVERY_IDLE_MS && age >= MIN_EXECUTION_MS) {
      await updateState(tabId, { executing: false, executionToken: null, lastFinishedAt: new Date().toISOString() });
      return pollOracle(tabId, repositoryConfig, { forceFetch: true, trigger: "idle_recovery" });
    }
    if (!state.executing) return pollOracle(tabId, repositoryConfig, { forceFetch: false, trigger: "fallback_poll" });
  }
  return { action: "none" };
}

export async function pollOracle(tabId, repositoryConfig, { forceFetch = false, trigger = "poll" } = {}) {
  const state = await loadState(tabId);
  if (!state.enabled || state.dispatching || state.executing) return { action: "none", trigger };

  const pausedUntilMs = Date.parse(String(state.rateLimitPausedUntil || ""));
  if (Number.isFinite(pausedUntilMs) && pausedUntilMs > Date.now()) {
    return { action: "wait", reason: "rate_limit", retryAt: state.rateLimitPausedUntil, trigger };
  }

  const config = await loadConfig(tabId);
  const runtime = await fetchRuntime(tabId, repositoryConfig, config, { forceFetch });
  return reconcileRuntime(tabId, runtime, repositoryConfig, config, trigger);
}

async function reconcileRuntime(tabId, runtime, repositoryConfig, config, trigger) {
  let state = await loadState(tabId);
  const runChanged = runtime.runId !== state.lastRunId;
  if (!runChanged && state.lastRevision >= 0 && runtime.revision < state.lastRevision) {
    await stopOracle(tabId, "revision_regressed");
    await updateState(tabId, { lastError: `Patient Oracle revision regressed from ${state.lastRevision} to ${runtime.revision}` });
    return { action: "needs_user", reason: "revision_regressed", runtime, trigger };
  }

  if (runChanged) {
    state = await updateState(tabId, {
      lastRunId: runtime.runId,
      lastDispatchedRevision: -1,
      currentRequestId: null,
      requestDispatchCount: 0
    });
  }

  state = await updateState(tabId, {
    lastRunId: runtime.runId,
    lastRevision: runtime.revision,
    lastStatus: runtime.status,
    lastReason: runtime.reason,
    lastCheckedAt: new Date().toISOString(),
    lastError: null
  });

  if (ORACLE_TERMINAL_STATUSES.has(runtime.status)) return { action: "wait", reason: runtime.status, runtime, trigger };
  if (runtime.status !== "ready") return { action: "none", runtime, trigger };
  if (runtime.revision <= Number(state.lastDispatchedRevision ?? -1)) return { action: "none", reason: "already_dispatched", runtime, trigger };

  const nextCount = runtime.requestId === state.currentRequestId ? Number(state.requestDispatchCount || 0) + 1 : 1;
  const maxRedispatches = normalizeMaxRedispatches(config.maxRedispatchesPerRequest);
  if (nextCount > maxRedispatches) {
    await stopOracle(tabId, "request_redispatch_limit");
    await updateState(tabId, { lastError: `Request ${runtime.requestId} exceeded the local ${maxRedispatches}-dispatch circuit breaker` });
    return { action: "needs_user", reason: "request_redispatch_limit", runtime, trigger };
  }

  return dispatchRequest(tabId, runtime, repositoryConfig, config, nextCount, trigger);
}

async function dispatchRequest(tabId, runtime, repositoryConfig, config, nextCount, trigger) {
  const request = await fetchRequest(tabId, repositoryConfig, runtime.requestId);
  if (request.requestId !== runtime.requestId) throw new Error("runtime/request identity mismatch");

  const budget = createExecutionBudget();
  const executionToken = `oracle:${runtime.revision}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const prompt = buildOracleWorkerPrompt(runtime, request, repositoryConfig, config, budget);

  await updateState(tabId, { dispatching: true, executionToken, lastError: null });
  try {
    await chrome.tabs.update(tabId, { url: "https://chatgpt.com/" });
    await waitForTabComplete(tabId, 20_000);
    await ensureContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "PATIENT_ORACLE_PROMPT",
      prompt,
      executionToken,
      checkpointAt: budget.checkpointAt,
      hardStopAt: budget.hardStopAt
    });
    if (!response?.sent) throw new Error(response?.error || "Patient Oracle prompt send failed");
  } catch (error) {
    await stopOracle(tabId, "dispatch_failed");
    await updateState(tabId, { lastError: error instanceof Error ? error.message : String(error) });
    throw error;
  }

  await updateState(tabId, {
    dispatching: false,
    executing: true,
    executionToken,
    executionStartedAt: budget.startedAt,
    checkpointAt: budget.checkpointAt,
    executionHardStopAt: budget.hardStopAt,
    lastDispatchedRevision: runtime.revision,
    currentRequestId: runtime.requestId,
    requestDispatchCount: nextCount,
    lastDispatchAt: new Date().toISOString(),
    lastStatus: "executing"
  });

  return { action: "dispatched", requestId: runtime.requestId, revision: runtime.revision, executionToken, trigger };
}

async function fetchRuntime(tabId, repositoryConfig, config, { forceFetch = false } = {}) {
  const cache = cacheFor(repositoryConfig, config);
  const intervalMs = effectivePollMs(repositoryConfig, config);
  if (!forceFetch && cache.runtime && Date.now() - cache.lastFetchAt < intervalMs) return cache.runtime;
  const result = await githubRawFetch(tabId, repositoryConfig, config.path, cache.etag);
  if (result.notModified && cache.runtime) return cache.runtime;
  cache.etag = result.etag;
  cache.lastFetchAt = Date.now();
  cache.runtime = parseOracleRuntimePayload(result.text);
  return cache.runtime;
}

async function fetchRequest(tabId, repositoryConfig, requestId) {
  const result = await githubRawFetch(tabId, repositoryConfig, oracleRequestPath(requestId), null);
  return parseOracleRequestPayload(result.text);
}

async function githubRawFetch(tabId, repositoryConfig, path, etag) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const url = new URL(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${String(path).split("/").map(encodeURIComponent).join("/")}`);
  url.searchParams.set("ref", branch);
  const headers = { Accept: "application/vnd.github.raw+json", "X-GitHub-Api-Version": "2022-11-28" };
  const token = String(repositoryConfig.githubToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (etag) headers["If-None-Match"] = etag;

  const response = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
  await recordRateLimit(tabId, response);
  await pauseForRateLimitIfNeeded(tabId, response);
  if (response.status === 304) return { notModified: true, etag, text: "" };
  if (!response.ok) throw new Error(`GitHub Patient Oracle request failed with HTTP ${response.status}`);
  return { notModified: false, etag: response.headers.get("etag"), text: await response.text() };
}

async function recordRateLimit(tabId, response) {
  const remaining = Number(response.headers.get("x-ratelimit-remaining"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  await updateState(tabId, {
    lastCheckedAt: new Date().toISOString(),
    rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
    rateLimitResetAt: Number.isFinite(reset) ? new Date(reset * 1000).toISOString() : null
  });
}

async function pauseForRateLimitIfNeeded(tabId, response) {
  if (![403, 429].includes(response.status)) return;
  const now = Date.now();
  const retryAfter = Number(response.headers.get("retry-after"));
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  let until = Number.isFinite(retryAfter) && retryAfter > 0 ? now + retryAfter * 1000 : null;
  if (until === null && response.headers.get("x-ratelimit-remaining") === "0" && Number.isFinite(reset)) until = Math.max(now + 1000, reset * 1000);
  if (until === null && response.status === 429) until = now + 60_000;
  if (until === null) return;
  await updateState(tabId, { rateLimitPausedUntil: new Date(until).toISOString(), lastError: null });
  const error = new Error("Patient Oracle GitHub polling paused for rate limiting");
  error.name = "PatientOracleRateLimitPause";
  error.untilMs = until;
  throw error;
}

function cacheFor(repositoryConfig, config) {
  const key = oracleStreamKey(repositoryConfig, config);
  if (!caches.has(key)) caches.set(key, { etag: null, runtime: null, lastFetchAt: 0 });
  return caches.get(key);
}

function effectivePollMs(repositoryConfig, config) {
  const token = Boolean(String(repositoryConfig.githubToken || "").trim());
  const requested = Number(config.pollIntervalSeconds);
  return Math.max(token ? 5 : 90, Number.isFinite(requested) ? Math.floor(requested) : (token ? 10 : 90)) * 1000;
}

async function loadConfig(tabId) {
  const key = oracleConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_ORACLE_CONFIG, ...(stored[key] || {}) };
}

async function saveConfig(tabId, patch) {
  const next = { ...await loadConfig(tabId), ...patch };
  next.path = String(next.path || DEFAULT_ORACLE_CONFIG.path).replace(/^\/+/, "").trim() || DEFAULT_ORACLE_CONFIG.path;
  next.maxRedispatchesPerRequest = normalizeMaxRedispatches(next.maxRedispatchesPerRequest);
  await chrome.storage.local.set({ [oracleConfigKey(tabId)]: next });
  return next;
}

async function loadState(tabId) {
  const key = oracleStateKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_ORACLE_STATE, ...(stored[key] || {}) };
}

async function updateState(tabId, patch) {
  const next = { ...await loadState(tabId), ...patch };
  await chrome.storage.local.set({ [oracleStateKey(tabId)]: next });
  return next;
}

async function findConflictingOracleTab(tabId, repositoryConfig, config) {
  const all = await chrome.storage.local.get(null);
  const wanted = oracleStreamKey(repositoryConfig, config);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("patientOracleState:") || !value?.enabled) continue;
    const otherTabId = Number(key.slice("patientOracleState:".length));
    if (!Number.isSafeInteger(otherTabId) || otherTabId === tabId) continue;
    const otherConfig = { ...DEFAULT_ORACLE_CONFIG, ...(all[oracleConfigKey(otherTabId)] || {}) };
    const repositoryKey = `tabConfig:${otherTabId}`;
    const otherRepo = all[repositoryKey] || {};
    if (oracleStreamKey(otherRepo, otherConfig) === wanted) return otherTabId;
  }
  return null;
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PATIENT_ORACLE_PING" });
    if (ping?.ready) return;
  } catch {}
  await chrome.scripting.executeScript({ target: { tabId }, files: ["utilities/patient-oracle/oracle-content.js"] });
  const ping = await chrome.tabs.sendMessage(tabId, { type: "PATIENT_ORACLE_PING" });
  if (!ping?.ready) throw new Error("Patient Oracle content script injection failed");
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Patient Oracle fresh ChatGPT conversation did not load in time");
}
