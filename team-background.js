import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  effectivePollInterval,
  tabConfigKey,
  tabRuntimeKey
} from "./control.js";
import {
  DEFAULT_TEAM_CONFIG,
  DEFAULT_TEAM_STATE,
  buildTeamAgentPrompt,
  buildTeamBootstrapPrompt,
  normalizeMaxTaskHandoffs,
  parseTeamRuntimePayload,
  teamConfigKey,
  teamStateKey
} from "./team-control.js";

const teamFetchCaches = new Map();
const TEAM_CONTENT_PORT = "rerun-team-content";
const TEAM_PANEL_PORT = "rerun-team-panel";
const TEAM_TICK_RECOVERY_IDLE_MS = 1500;
const TEAM_TICK_RECOVERY_MIN_EXECUTION_MS = 5000;

class TeamRateLimitPause extends Error {
  constructor(untilMs) {
    super("GitHub API polling is temporarily paused for Team Runtime");
    this.name = "TeamRateLimitPause";
    this.untilMs = untilMs;
  }
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === TEAM_CONTENT_PORT) {
    attachContentPort(port);
    return;
  }
  if (port.name === TEAM_PANEL_PORT) {
    attachPanelPort(port);
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove([
    teamConfigKey(tabId),
    teamStateKey(tabId)
  ]);
});

function attachContentPort(port) {
  const tabId = port.sender?.tab?.id;
  if (!Number.isSafeInteger(tabId)) return;

  port.onMessage.addListener((message) => {
    handleContentMessage(tabId, message).catch((error) => {
      void updateTeamState(tabId, {
        lastError: error instanceof Error ? error.message : String(error)
      });
    });
  });
}

function attachPanelPort(port) {
  port.onMessage.addListener((message) => {
    const requestId = String(message?.requestId || "");
    handlePanelMessage(message)
      .then((result) => port.postMessage({ requestId, ok: true, ...result }))
      .catch((error) => port.postMessage({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
  });
}

async function handlePanelMessage(message) {
  const tabId = normalizeTabId(message?.tabId);
  if (tabId === null) throw new Error("A valid ChatGPT tabId is required");

  switch (message?.type) {
    case "TEAM_START":
      return startTeam(tabId, message);
    case "TEAM_STOP":
      return stopTeam(tabId, "manual");
    case "TEAM_STATUS":
      return {
        config: await loadTeamConfig(tabId),
        state: await loadTeamState(tabId)
      };
    default:
      throw new Error(`Unsupported Team panel message: ${String(message?.type || "")}`);
  }
}

async function handleContentMessage(tabId, message) {
  switch (message?.type) {
    case "TEAM_TURN_FINISHED":
      return handleTeamTurnFinished(tabId, message);
    case "TEAM_POLL":
      return handleTeamRecoveryPoll(tabId, message);
    default:
      return { action: "none" };
  }
}

async function loadRepositoryConfig(tabId) {
  const key = tabConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_CONFIG, ...(stored[key] || {}) };
}

async function loadSingleRuntime(tabId) {
  const key = tabRuntimeKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_RUNTIME, ...(stored[key] || {}) };
}

async function loadTeamConfig(tabId) {
  const key = teamConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_TEAM_CONFIG, ...(stored[key] || {}) };
}

async function loadTeamState(tabId) {
  const key = teamStateKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_TEAM_STATE, ...(stored[key] || {}) };
}

async function updateTeamState(tabId, patch) {
  const key = teamStateKey(tabId);
  const current = await loadTeamState(tabId);
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

async function saveTeamConfig(tabId, message) {
  const current = await loadTeamConfig(tabId);
  const next = {
    ...current,
    goal: String(message?.goal ?? current.goal ?? "").trim(),
    path: String(message?.path ?? current.path ?? DEFAULT_TEAM_CONFIG.path).replace(/^\/+/, "").trim() || DEFAULT_TEAM_CONFIG.path,
    maxTaskHandoffs: normalizeMaxTaskHandoffs(message?.maxTaskHandoffs ?? current.maxTaskHandoffs)
  };
  await chrome.storage.local.set({ [teamConfigKey(tabId)]: next });
  return next;
}

async function startTeam(tabId, message) {
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGptUrl(tab.url || "")) throw new Error("Team Runtime은 ChatGPT 탭에서만 시작할 수 있습니다.");

  const repositoryConfig = await loadRepositoryConfig(tabId);
  if (!String(repositoryConfig.owner || "").trim() || !String(repositoryConfig.repo || "").trim()) {
    throw new Error("먼저 기존 Rerun connection에서 Owner와 Repository를 연결해주세요.");
  }

  const singleRuntime = await loadSingleRuntime(tabId);
  if (singleRuntime.enabled) {
    throw new Error("Single watcher가 실행 중입니다. 먼저 기존 Start/Stop에서 Stop한 뒤 Team을 시작해주세요.");
  }

  const teamConfig = await saveTeamConfig(tabId, message);
  const wantedStreamKey = teamStreamKey(repositoryConfig, teamConfig);
  const previousTeamState = await loadTeamState(tabId);
  if (previousTeamState.streamKey !== wantedStreamKey) {
    await updateTeamState(tabId, {
      streamKey: wantedStreamKey,
      bootstrapPending: false,
      dispatching: false,
      executing: false,
      executionToken: null,
      lastRunId: null,
      lastRevision: -1,
      lastDispatchedRevision: -1,
      currentAgent: null,
      currentTaskId: null,
      taskHandoffCount: 0,
      lastStatus: null,
      lastReason: null,
      stopReason: null,
      lastError: null
    });
  }

  const conflictTabId = await findConflictingTeamTab(tabId, repositoryConfig, teamConfig);
  if (conflictTabId !== null) {
    throw new Error(`같은 Team Runtime stream이 이미 tab ${conflictTabId}에서 실행 중입니다.`);
  }

  await ensureTeamContentScript(tabId);
  await updateTeamState(tabId, {
    enabled: true,
    stopReason: null,
    lastError: null,
    dispatching: false,
    rateLimitPausedUntil: null
  });

  let runtime;
  try {
    runtime = await fetchTeamRuntime(tabId, repositoryConfig, teamConfig, { allowMissing: true });
  } catch (error) {
    if (!isTeamRateLimitPause(error)) throw error;
    return {
      action: "rate_limited_wait",
      retryAt: new Date(error.untilMs).toISOString()
    };
  }

  if (!runtime) {
    if (!String(teamConfig.goal || "").trim()) {
      await stopTeam(tabId, "missing_goal");
      throw new Error("새 Team Runtime을 만들려면 Team Goal을 입력해주세요.");
    }
    return bootstrapTeam(tabId, teamConfig, repositoryConfig);
  }

  await updateTeamState(tabId, {
    bootstrapPending: false,
    executing: false,
    executionToken: null
  });
  return reconcileTeamRuntime(tabId, runtime, teamConfig, repositoryConfig, "start");
}

async function bootstrapTeam(tabId, teamConfig, repositoryConfig) {
  const executionToken = makeExecutionToken("bootstrap");
  const prompt = buildTeamBootstrapPrompt(teamConfig, repositoryConfig);

  await updateTeamState(tabId, {
    bootstrapPending: true,
    dispatching: true,
    executing: false,
    executionToken,
    lastStatus: "bootstrapping",
    lastDispatchAt: new Date().toISOString(),
    lastError: null
  });

  try {
    await sendPromptToCurrentChat(tabId, prompt, executionToken);
  } catch (error) {
    await updateTeamState(tabId, {
      enabled: false,
      bootstrapPending: false,
      dispatching: false,
      executing: false,
      stopReason: "bootstrap_send_failed",
      lastError: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  await updateTeamState(tabId, {
    dispatching: false,
    executing: true
  });
  return { action: "bootstrapping", executionToken };
}

async function handleTeamTurnFinished(tabId, message) {
  let state = await loadTeamState(tabId);
  const executionToken = String(message?.executionToken || "");
  if (!state.enabled) return { action: "none" };
  if (!state.executing) return { action: "none" };
  if (state.executionToken && executionToken && state.executionToken !== executionToken) {
    return { action: "none", reason: "stale_execution" };
  }

  state = await updateTeamState(tabId, {
    executing: false,
    executionToken: null,
    lastFinishedAt: new Date().toISOString(),
    lastError: null
  });

  const repositoryConfig = await loadRepositoryConfig(tabId);
  const teamConfig = await loadTeamConfig(tabId);
  let runtime;
  try {
    runtime = await fetchTeamRuntime(tabId, repositoryConfig, teamConfig, {
      allowMissing: state.bootstrapPending,
      forceFetch: true
    });
  } catch (error) {
    if (isTeamRateLimitPause(error)) {
      return { action: "rate_limited_wait", retryAt: new Date(error.untilMs).toISOString() };
    }
    throw error;
  }

  if (!runtime) {
    await updateTeamState(tabId, {
      enabled: false,
      bootstrapPending: false,
      stopReason: "bootstrap_runtime_missing",
      lastError: "Team bootstrap turn finished but the team runtime file is still missing."
    });
    return { action: "stop", reason: "bootstrap_runtime_missing" };
  }

  if (state.bootstrapPending) {
    await updateTeamState(tabId, { bootstrapPending: false });
  }
  return reconcileTeamRuntime(tabId, runtime, teamConfig, repositoryConfig, "turn_finished");
}

async function handleTeamRecoveryPoll(tabId, message) {
  let state = await loadTeamState(tabId);
  if (!state.enabled || state.dispatching) return { action: "none" };

  const singleRuntime = await loadSingleRuntime(tabId);
  if (singleRuntime.enabled) {
    await stopTeam(tabId, "single_watcher_started");
    await updateTeamState(tabId, {
      lastError: "Single watcher가 시작되어 Team Runtime을 안전하게 중지했습니다."
    });
    return { action: "stopped", reason: "single_watcher_started" };
  }

  const idleStableForMs = Number(message?.idleStableForMs || 0);
  const approvalVisible = Boolean(message?.approvalVisible);
  const dispatchAt = Date.parse(String(state.lastDispatchAt || ""));
  const executionAgeMs = Number.isFinite(dispatchAt) ? Date.now() - dispatchAt : 0;

  if (
    state.executing &&
    !approvalVisible &&
    idleStableForMs >= TEAM_TICK_RECOVERY_IDLE_MS &&
    executionAgeMs >= TEAM_TICK_RECOVERY_MIN_EXECUTION_MS
  ) {
    state = await updateTeamState(tabId, {
      executing: false,
      executionToken: null,
      lastFinishedAt: new Date().toISOString()
    });
    return pollTeam(tabId, { forceFetch: true, trigger: "idle_recovery" });
  }

  if (state.executing) return { action: "none", reason: "executing" };
  return pollTeam(tabId, { forceFetch: false, trigger: "fallback_poll" });
}

async function pollTeam(tabId, { forceFetch = false, trigger = "poll" } = {}) {
  const state = await loadTeamState(tabId);
  if (!state.enabled || state.dispatching || state.executing) return { action: "none", trigger };

  const pausedUntilMs = Date.parse(String(state.rateLimitPausedUntil || ""));
  if (Number.isFinite(pausedUntilMs) && pausedUntilMs > Date.now()) {
    return { action: "wait", reason: "rate_limit", retryAt: state.rateLimitPausedUntil, trigger };
  }
  if (state.rateLimitPausedUntil) {
    await updateTeamState(tabId, { rateLimitPausedUntil: null });
  }

  const repositoryConfig = await loadRepositoryConfig(tabId);
  const teamConfig = await loadTeamConfig(tabId);
  const intervalSeconds = await effectiveTeamPollInterval(repositoryConfig);
  const cache = cacheFor(repositoryConfig, teamConfig);

  let runtime;
  try {
    if (!forceFetch && cache.cachedRuntime && Date.now() - cache.lastFetchAt < intervalSeconds * 1000) {
      runtime = cache.cachedRuntime;
    } else {
      runtime = await fetchTeamRuntime(tabId, repositoryConfig, teamConfig, {
        allowMissing: state.bootstrapPending,
        forceFetch
      });
    }
  } catch (error) {
    if (isTeamRateLimitPause(error)) {
      return { action: "wait", reason: "rate_limit", retryAt: new Date(error.untilMs).toISOString(), trigger };
    }
    throw error;
  }

  if (!runtime) return { action: "wait", reason: "runtime_missing", trigger };
  return reconcileTeamRuntime(tabId, runtime, teamConfig, repositoryConfig, trigger);
}

async function reconcileTeamRuntime(tabId, runtime, teamConfig, repositoryConfig, trigger) {
  let state = await loadTeamState(tabId);
  if (!state.enabled) return { action: "none", trigger };

  const previousRevision = Number(state.lastRevision ?? -1);
  const runChanged = runtime.runId !== state.lastRunId;
  if (!runChanged && previousRevision >= 0 && runtime.revision < previousRevision) {
    await updateTeamState(tabId, {
      enabled: false,
      stopReason: "revision_regressed",
      lastError: `Team Runtime revision regressed from ${previousRevision} to ${runtime.revision}.`
    });
    return { action: "needs_user", reason: "revision_regressed", runtime, trigger };
  }

  if (runChanged) {
    state = await updateTeamState(tabId, {
      lastRunId: runtime.runId,
      lastDispatchedRevision: -1,
      currentAgent: null,
      currentTaskId: null,
      taskHandoffCount: 0
    });
  }

  state = await updateTeamState(tabId, {
    lastRunId: runtime.runId,
    lastRevision: runtime.revision,
    lastStatus: runtime.status,
    lastReason: runtime.reason,
    lastCheckedAt: new Date().toISOString(),
    lastError: null
  });

  if (["complete", "needs_user", "blocked"].includes(runtime.status)) {
    return { action: "wait", reason: runtime.status, runtime, trigger };
  }
  if (runtime.status !== "ready") return { action: "none", runtime, trigger };
  if (state.executing || state.dispatching) return { action: "none", runtime, trigger };
  if (runtime.revision <= Number(state.lastDispatchedRevision ?? -1)) {
    return { action: "none", reason: "already_dispatched", runtime, trigger };
  }

  const nextHandoffCount = runtime.taskId === state.currentTaskId
    ? Number(state.taskHandoffCount || 0) + 1
    : 1;
  const maxTaskHandoffs = normalizeMaxTaskHandoffs(teamConfig.maxTaskHandoffs);
  if (nextHandoffCount > maxTaskHandoffs) {
    await updateTeamState(tabId, {
      enabled: false,
      stopReason: "task_handoff_limit",
      lastError: `Task ${runtime.taskId} exceeded the local ${maxTaskHandoffs}-dispatch safety limit.`
    });
    return { action: "needs_user", reason: "task_handoff_limit", runtime, trigger };
  }

  return dispatchTeamAgent(
    tabId,
    runtime,
    teamConfig,
    repositoryConfig,
    nextHandoffCount,
    trigger
  );
}

async function dispatchTeamAgent(tabId, runtime, teamConfig, repositoryConfig, nextHandoffCount, trigger) {
  const executionToken = makeExecutionToken(`${runtime.agent}-${runtime.revision}`);
  const prompt = buildTeamAgentPrompt(runtime, teamConfig, repositoryConfig);

  await updateTeamState(tabId, {
    dispatching: true,
    executing: false,
    executionToken,
    lastError: null
  });

  try {
    await openFreshChatInSameTab(tabId);
    await ensureTeamContentScript(tabId);
    await sendPromptToCurrentChat(tabId, prompt, executionToken);
  } catch (error) {
    await updateTeamState(tabId, {
      enabled: false,
      dispatching: false,
      executing: false,
      executionToken: null,
      stopReason: "agent_dispatch_failed",
      lastError: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  await updateTeamState(tabId, {
    dispatching: false,
    executing: true,
    executionToken,
    lastDispatchedRevision: runtime.revision,
    currentAgent: runtime.agent,
    currentTaskId: runtime.taskId,
    taskHandoffCount: nextHandoffCount,
    lastDispatchAt: new Date().toISOString(),
    lastStatus: "executing",
    stopReason: null,
    lastError: null
  });

  return {
    action: "dispatched",
    agent: runtime.agent,
    taskId: runtime.taskId,
    revision: runtime.revision,
    executionToken,
    trigger
  };
}

async function stopTeam(tabId, reason) {
  await updateTeamState(tabId, {
    enabled: false,
    bootstrapPending: false,
    dispatching: false,
    executing: false,
    executionToken: null,
    stopReason: reason
  });
  return { action: "stopped", reason, tabId };
}

async function fetchTeamRuntime(tabId, repositoryConfig, teamConfig, { allowMissing = false } = {}) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const path = String(teamConfig.path || DEFAULT_TEAM_CONFIG.path).replace(/^\/+/, "").trim();
  if (!owner || !repo || !path) throw new Error("Team Runtime requires GitHub owner, repository, and runtime path");

  const cache = cacheFor(repositoryConfig, teamConfig);
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`
  );
  url.searchParams.set("ref", branch);

  const headers = githubHeaders(repositoryConfig, "application/vnd.github.raw+json");
  if (cache.lastEtag) headers["If-None-Match"] = cache.lastEtag;
  const response = await fetch(url.toString(), { method: "GET", headers, cache: "no-store" });
  cache.lastFetchAt = Date.now();
  await recordTeamRateLimit(tabId, response);
  await pauseTeamForRateLimitIfNeeded(tabId, response);

  if (response.status === 304 && cache.cachedRuntime) return cache.cachedRuntime;
  if (response.status === 404 && allowMissing) {
    cache.lastEtag = null;
    cache.cachedRuntime = null;
    return null;
  }
  if (!response.ok) {
    if (response.status === 404) throw new Error("Team Runtime file was not found");
    if (response.status === 401) throw new Error("GitHub authentication failed");
    throw new Error(`GitHub Team Runtime request failed with HTTP ${response.status}`);
  }

  cache.lastEtag = response.headers.get("etag");
  cache.cachedRuntime = parseTeamRuntimePayload(await response.text());
  return cache.cachedRuntime;
}

function cacheFor(repositoryConfig, teamConfig) {
  const key = [
    repositoryConfig.owner,
    repositoryConfig.repo,
    repositoryConfig.branch || "main",
    teamConfig.path || DEFAULT_TEAM_CONFIG.path
  ].map((part) => String(part || "").trim()).join("/");
  let cache = teamFetchCaches.get(key);
  if (!cache) {
    cache = { lastEtag: null, cachedRuntime: null, lastFetchAt: 0 };
    teamFetchCaches.set(key, cache);
  }
  return cache;
}

function githubHeaders(repositoryConfig, accept) {
  const headers = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = String(repositoryConfig.githubToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function effectiveTeamPollInterval(repositoryConfig) {
  const token = String(repositoryConfig.githubToken || "").trim();
  const watcherCount = token ? 1 : await countUnauthenticatedWatchers();
  return effectivePollInterval(repositoryConfig.pollIntervalSeconds, Boolean(token), watcherCount);
}

async function findConflictingTeamTab(tabId, repositoryConfig, teamConfig) {
  const all = await chrome.storage.local.get(null);
  const wanted = teamStreamKey(repositoryConfig, teamConfig);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("teamState:") || !value?.enabled) continue;
    const otherTabId = Number(key.slice("teamState:".length));
    if (!Number.isSafeInteger(otherTabId) || otherTabId < 0 || otherTabId === tabId) continue;
    const otherRepositoryConfig = { ...DEFAULT_CONFIG, ...(all[tabConfigKey(otherTabId)] || {}) };
    const otherTeamConfig = { ...DEFAULT_TEAM_CONFIG, ...(all[teamConfigKey(otherTabId)] || {}) };
    if (teamStreamKey(otherRepositoryConfig, otherTeamConfig) === wanted) return otherTabId;
  }
  return null;
}

function teamStreamKey(repositoryConfig, teamConfig) {
  return [
    repositoryConfig.owner,
    repositoryConfig.repo,
    repositoryConfig.branch || "main",
    teamConfig.path || DEFAULT_TEAM_CONFIG.path
  ].map((part) => String(part || "").trim()).join("/");
}

async function countUnauthenticatedWatchers() {
  const all = await chrome.storage.local.get(null);
  const tabIds = new Set();
  for (const [key, value] of Object.entries(all)) {
    if (!value?.enabled) continue;
    if (key.startsWith("tabRuntime:")) tabIds.add(Number(key.slice("tabRuntime:".length)));
    if (key.startsWith("teamState:")) tabIds.add(Number(key.slice("teamState:".length)));
  }

  let count = 0;
  for (const tabId of tabIds) {
    if (!Number.isSafeInteger(tabId) || tabId < 0) continue;
    const repositoryConfig = { ...DEFAULT_CONFIG, ...(all[tabConfigKey(tabId)] || {}) };
    if (!String(repositoryConfig.githubToken || "").trim()) count += 1;
  }
  return Math.max(1, count);
}

async function recordTeamRateLimit(tabId, response) {
  const remainingRaw = response.headers.get("x-ratelimit-remaining");
  const resetRaw = response.headers.get("x-ratelimit-reset");
  const remaining = remainingRaw === null ? null : Number(remainingRaw);
  const resetSeconds = resetRaw === null ? NaN : Number(resetRaw);
  await updateTeamState(tabId, {
    lastCheckedAt: new Date().toISOString(),
    rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
    rateLimitResetAt: Number.isFinite(resetSeconds) ? new Date(resetSeconds * 1000).toISOString() : null
  });
}

async function pauseTeamForRateLimitIfNeeded(tabId, response) {
  if (![403, 429].includes(response.status)) return;
  const now = Date.now();
  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  const remaining = response.headers.get("x-ratelimit-remaining");

  let untilMs = null;
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    untilMs = now + retryAfterSeconds * 1000;
  } else if (remaining === "0" && Number.isFinite(resetSeconds)) {
    untilMs = Math.max(now + 1000, resetSeconds * 1000);
  } else if (response.status === 429) {
    untilMs = now + 60_000;
  }

  if (untilMs === null) {
    let detail = "";
    try {
      detail = await response.clone().text();
    } catch {
      detail = "";
    }
    if (/secondary rate limit|abuse detection/i.test(detail)) untilMs = now + 60_000;
  }
  if (untilMs === null) return;

  const until = new Date(untilMs).toISOString();
  await updateTeamState(tabId, { rateLimitPausedUntil: until, lastError: null });
  throw new TeamRateLimitPause(untilMs);
}

function isTeamRateLimitPause(error) {
  return error?.name === "TeamRateLimitPause" && Number.isFinite(error?.untilMs);
}

async function openFreshChatInSameTab(tabId) {
  await chrome.tabs.update(tabId, { url: "https://chatgpt.com/" });
  await waitForTabComplete(tabId, 20_000);
}

async function ensureTeamContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_TEAM_PING" });
    if (ping?.ready) return;
  } catch {
    // Existing tab may predate the extension reload.
  }

  await chrome.scripting.executeScript({ target: { tabId }, files: ["team-content.js"] });
  const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_TEAM_PING" });
  if (!ping?.ready) throw new Error("ChatGPT 탭에 Team Runtime content script를 주입하지 못했습니다.");
}

async function sendPromptToCurrentChat(tabId, prompt, executionToken) {
  const response = await chrome.tabs.sendMessage(tabId, {
    type: "RERUN_TEAM_PROMPT",
    prompt,
    executionToken
  });
  if (!response?.sent) {
    throw new Error(response?.error || "Team Runtime prompt를 ChatGPT에 보내지 못했습니다.");
  }
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(150);
  }
  throw new Error("새 Team Agent 채팅 로딩이 제한 시간 안에 끝나지 않았습니다.");
}

function makeExecutionToken(label) {
  return `${label}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeTabId(value) {
  const tabId = Number(value);
  return Number.isSafeInteger(tabId) && tabId >= 0 ? tabId : null;
}

function isChatGptUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
