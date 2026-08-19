import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  buildNewChatHandoffPrompt,
  buildRepositoryBootstrapPrompt,
  continuationDisposition,
  effectivePollInterval,
  isAutoBootstrapPath,
  parseControlPayload,
  streamKey,
  tabConfigKey,
  tabDraftKey,
  tabIdFromRuntimeKey,
  tabRuntimeKey
} from "./control.js";

const fetchCaches = new Map();

class GitHubRateLimitPause extends Error {
  constructor(untilMs) {
    super("GitHub API polling is temporarily paused for rate limiting");
    this.name = "GitHubRateLimitPause";
    this.untilMs = untilMs;
  }
}

void configureGlobalSidePanel();

chrome.runtime.onInstalled.addListener(() => {
  void configureGlobalSidePanel();
});

chrome.runtime.onStartup.addListener(() => {
  void configureGlobalSidePanel();
});

chrome.action.onClicked.addListener((tab) => {
  void openTabSidePanel(tab);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove([
    tabConfigKey(tabId),
    tabRuntimeKey(tabId),
    tabDraftKey(tabId)
  ]);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch(async (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      const tabId = sender?.tab?.id ?? normalizeMessageTabId(message?.tabId);
      if (tabId !== null) {
        await updateRuntime(tabId, { lastError: detail });
      }
      sendResponse({ ok: false, error: detail });
    });
  return true;
});

async function configureGlobalSidePanel() {
  if (!chrome.sidePanel?.setOptions) return;
  await chrome.sidePanel.setOptions({ enabled: false });
}

async function openTabSidePanel(tab) {
  try {
    const tabId = tab?.id;
    if (!Number.isSafeInteger(tabId)) return;

    const liveTab = tab.url ? tab : await chrome.tabs.get(tabId);
    if (!isChatGptUrl(liveTab?.url || "")) return;

    await configureTabSidePanel(tabId);
    await chrome.sidePanel.open({ tabId });
  } catch (error) {
    console.error("Failed to open tab-specific side panel", error);
  }
}

async function configureTabSidePanel(tabId) {
  await chrome.sidePanel.setOptions({
    tabId,
    path: "popup.html",
    enabled: true
  });
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "REGISTER_CHAT_TAB": {
      const tabId = requireSenderTabId(sender);
      await configureTabSidePanel(tabId);
      return { action: "registered", tabId };
    }
    case "POLL":
      return poll(sender);
    case "TURN_FINISHED":
      return reconcileAfterTurn(sender, message);
    case "CLAIM_SEQUENCE":
      return claimSequence(sender, message);
    case "ACK_SEQUENCE":
      return ackSequence(sender, message);
    case "RELEASE_SEQUENCE":
      return releaseSequence(sender, message);
    case "STOP_SESSION":
      return stopSession(requireSenderTabId(sender), message.reason || "stopped");
    case "START_TAB_SESSION":
      return startTabSession(requireMessageTabId(message));
    case "STOP_TAB_SESSION":
      return stopSession(requireMessageTabId(message), message.reason || "manual");
    case "HANDOFF_NEW_CHAT":
      return handoffToNewChat(requireMessageTabId(message));
    default:
      return { action: "none" };
  }
}

async function loadConfig(tabId) {
  const key = tabConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_CONFIG, ...(stored[key] || {}) };
}

async function loadRuntime(tabId) {
  const key = tabRuntimeKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_RUNTIME, ...(stored[key] || {}) };
}

async function updateRuntime(tabId, patch) {
  const key = tabRuntimeKey(tabId);
  const current = await loadRuntime(tabId);
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

async function reconcileAfterTurn(sender, message) {
  const tabId = requireSenderTabId(sender);
  const runtime = await loadRuntime(tabId);
  if (!runtime.enabled || runtime.handoffPending) {
    return { action: "none", trigger: "turn_finished" };
  }

  const result = await poll(sender, { forceFetch: true });
  if (result.action === "continue") {
    await chrome.tabs.sendMessage(tabId, {
      type: "RERUN_WAKE",
      trigger: "turn_finished"
    });
  }

  return {
    ...result,
    trigger: "turn_finished",
    executionToken: String(message?.executionToken || "")
  };
}

async function poll(sender, { forceFetch = false } = {}) {
  const tabId = requireSenderTabId(sender);
  const config = await loadConfig(tabId);
  let runtime = await loadRuntime(tabId);
  if (!runtime.enabled || runtime.handoffPending) return { action: "none" };

  const now = Date.now();
  const pausedUntilMs = Date.parse(String(runtime.rateLimitPausedUntil || ""));
  if (Number.isFinite(pausedUntilMs) && pausedUntilMs > now) {
    return {
      action: "wait",
      reason: "rate_limit",
      retryAt: runtime.rateLimitPausedUntil
    };
  }
  if (runtime.rateLimitPausedUntil) {
    runtime = await updateRuntime(tabId, {
      rateLimitPausedUntil: null,
      rateLimitPauseReason: null,
      lastError: null
    });
  }

  const token = String(config.githubToken || "").trim();
  const unauthenticatedWatcherCount = token
    ? 1
    : await countEnabledUnauthenticatedWatchers();
  const intervalSeconds = effectivePollInterval(
    config.pollIntervalSeconds,
    Boolean(token),
    unauthenticatedWatcherCount
  );
  const cache = cacheFor(config);

  let control;
  try {
    if (runtime.bootstrapPending) {
      if (!forceFetch && now - cache.lastFetchAt < intervalSeconds * 1000) {
        if (cache.cachedControl) {
          control = cache.cachedControl;
        } else {
          return { action: "none", phase: "bootstrap_wait" };
        }
      } else {
        control = await fetchControl(config, tabId, { allowMissing: true });
        if (!control) return { action: "none", phase: "bootstrap_wait" };
      }

      runtime = await updateRuntime(tabId, {
        bootstrapPending: false,
        bootstrapCompletedAt: new Date().toISOString(),
        lastError: null
      });
    } else if (!forceFetch && now - cache.lastFetchAt < intervalSeconds * 1000 && cache.cachedControl) {
      control = cache.cachedControl;
    } else {
      control = await fetchControl(config, tabId);
    }
  } catch (error) {
    if (isRateLimitPause(error)) {
      return {
        action: "wait",
        reason: "rate_limit",
        retryAt: new Date(error.untilMs).toISOString()
      };
    }
    throw error;
  }

  runtime = await loadRuntime(tabId);
  return actionForControl(tabId, config, runtime, control, intervalSeconds, now);
}

function cacheFor(config) {
  const key = streamKey(config);
  let cache = fetchCaches.get(key);
  if (!cache) {
    cache = {
      lastEtag: null,
      cachedControl: null,
      controlMissing: false,
      lastFetchAt: 0
    };
    fetchCaches.set(key, cache);
  }
  return cache;
}

async function fetchControl(config, tabId, { allowMissing = false } = {}) {
  const owner = String(config.owner || "").trim();
  const repo = String(config.repo || "").trim();
  const branch = String(config.branch || "main").trim();
  const path = String(config.path || "").replace(/^\/+/, "").trim();

  if (!owner || !repo || !path) {
    throw new Error("GitHub owner, repository, and control file path are required");
  }

  const cache = cacheFor(config);
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`
  );
  url.searchParams.set("ref", branch);

  const headers = githubHeaders(config, "application/vnd.github.raw+json");
  if (cache.lastEtag) headers["If-None-Match"] = cache.lastEtag;

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store"
  });
  cache.lastFetchAt = Date.now();
  await recordRateLimit(tabId, response);
  await pauseForRateLimitIfNeeded(tabId, response);

  if (response.status === 304 && cache.cachedControl) {
    return cache.cachedControl;
  }

  if (response.status === 404 && allowMissing) {
    cache.lastEtag = null;
    cache.cachedControl = null;
    cache.controlMissing = true;
    return null;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("GitHub control file was not found");
    }
    if (response.status === 401) {
      throw new Error("GitHub authentication failed");
    }
    throw new Error(`GitHub request failed with HTTP ${response.status}`);
  }

  cache.lastEtag = response.headers.get("etag");
  cache.cachedControl = parseControlPayload(await response.text());
  cache.controlMissing = false;
  return cache.cachedControl;
}

function githubHeaders(config, accept) {
  const headers = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = String(config.githubToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function recordRateLimit(tabId, response) {
  const remainingRaw = response.headers.get("x-ratelimit-remaining");
  const resetRaw = response.headers.get("x-ratelimit-reset");
  const remaining = remainingRaw === null ? null : Number(remainingRaw);
  const resetSeconds = resetRaw === null ? NaN : Number(resetRaw);
  await updateRuntime(tabId, {
    lastCheckedAt: new Date().toISOString(),
    rateLimitRemaining: Number.isFinite(remaining) ? remaining : null,
    rateLimitResetAt: Number.isFinite(resetSeconds)
      ? new Date(resetSeconds * 1000).toISOString()
      : null
  });
}

async function pauseForRateLimitIfNeeded(tabId, response) {
  const untilMs = await rateLimitPauseUntil(response);
  if (untilMs === null) return;

  const until = new Date(untilMs).toISOString();
  await updateRuntime(tabId, {
    rateLimitPausedUntil: until,
    rateLimitPauseReason: "github_rate_limit",
    lastError: null
  });
  throw new GitHubRateLimitPause(untilMs);
}

async function rateLimitPauseUntil(response, nowMs = Date.now()) {
  if (![403, 429].includes(response.status)) return null;

  const retryAfterSeconds = Number(response.headers.get("retry-after"));
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return nowMs + retryAfterSeconds * 1000;
  }

  const remaining = response.headers.get("x-ratelimit-remaining");
  const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
  if (remaining === "0" && Number.isFinite(resetSeconds)) {
    return Math.max(nowMs + 1000, resetSeconds * 1000);
  }

  if (response.status === 429) return nowMs + 60_000;

  let detail = "";
  try {
    detail = await response.clone().text();
  } catch {
    detail = "";
  }
  if (/secondary rate limit|abuse detection/i.test(detail)) {
    return nowMs + 60_000;
  }

  return null;
}

function isRateLimitPause(error) {
  return error?.name === "GitHubRateLimitPause" && Number.isFinite(error?.untilMs);
}

async function countEnabledUnauthenticatedWatchers() {
  const all = await chrome.storage.local.get(null);
  let count = 0;
  for (const [key, runtime] of Object.entries(all)) {
    const tabId = tabIdFromRuntimeKey(key);
    if (tabId === null || !runtime?.enabled) continue;
    const config = { ...DEFAULT_CONFIG, ...(all[tabConfigKey(tabId)] || {}) };
    if (!String(config.githubToken || "").trim()) count += 1;
  }
  return Math.max(1, count);
}

async function assertRepositoryBranchAccessible(config, tabId) {
  const owner = String(config.owner || "").trim();
  const repo = String(config.repo || "").trim();
  const branch = String(config.branch || "main").trim() || "main";
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents`
  );
  url.searchParams.set("ref", branch);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: githubHeaders(config, "application/vnd.github+json"),
    cache: "no-store"
  });
  await recordRateLimit(tabId, response);
  await pauseForRateLimitIfNeeded(tabId, response);

  if (response.ok) return;

  if (response.status === 401) {
    throw new Error("GitHub authentication failed");
  }
  if (response.status === 404) {
    throw new Error("설정한 GitHub 저장소/branch를 읽을 수 없습니다. Owner, Repository, Branch 또는 token 권한을 확인해주세요.");
  }
  throw new Error(`GitHub repository probe failed with HTTP ${response.status}`);
}

async function actionForControl(tabId, config, runtime, control, intervalSeconds, now) {
  if (control.runId !== runtime.lastRunId) {
    runtime = await updateRuntime(tabId, {
      lastRunId: control.runId,
      lastHandledSequence: -1,
      lastSentAt: null,
      sameSequenceRetryCount: 0,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      runCount: 0
    });
  }

  runtime = await updateRuntime(tabId, {
    lastError: null,
    lastStatus: control.status,
    lastSequence: control.sequence
  });

  if (["complete", "needs_user", "blocked"].includes(control.status)) {
    const lastHandled = Number(runtime.lastHandledSequence ?? -1);
    if (control.sequence >= lastHandled) {
      const armedLastHandled = Math.min(lastHandled, control.sequence - 1);
      if (armedLastHandled !== lastHandled) {
        runtime = await updateRuntime(tabId, {
          lastHandledSequence: armedLastHandled,
          sameSequenceRetryCount: 0
        });
      }
    }
    return { action: "wait", reason: control.status, control };
  }

  if (runtime.pendingSequence !== null) {
    return { action: "none", control };
  }

  const disposition = continuationDisposition(
    control,
    { ...config, ...runtime, pollIntervalSeconds: intervalSeconds },
    now
  );

  if (disposition.action === "stale") {
    const detail = `Control sequence regressed from ${runtime.lastHandledSequence} to ${control.sequence}`;
    await updateRuntime(tabId, { lastError: detail });
    return { action: "wait", reason: "sequence_regressed", control };
  }

  if (disposition.action === "retry_limit") {
    return { action: "wait", reason: "retry_limit", control };
  }

  if (disposition.action !== "send") {
    return { action: "none", control };
  }

  return {
    action: "continue",
    control,
    isRetry: disposition.isRetry,
    prompt: String(config.resumePrompt || DEFAULT_CONFIG.resumePrompt)
  };
}

async function claimSequence(sender, message) {
  const tabId = requireSenderTabId(sender);
  const config = await loadConfig(tabId);
  const runtime = await loadRuntime(tabId);
  if (!runtime.enabled || runtime.handoffPending || runtime.bootstrapPending) {
    return { claimed: false, reason: "stopped" };
  }

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  const cache = cacheFor(config);
  const control = cache.cachedControl || await fetchControl(config, tabId);
  if (control.runId !== runId || control.sequence !== sequence || control.status !== "continue") {
    return { claimed: false, reason: "stale_control" };
  }
  if (runtime.pendingSequence !== null) return { claimed: false, reason: "already_claimed" };

  const token = String(config.githubToken || "").trim();
  const unauthenticatedWatcherCount = token
    ? 1
    : await countEnabledUnauthenticatedWatchers();
  const intervalSeconds = effectivePollInterval(
    config.pollIntervalSeconds,
    Boolean(token),
    unauthenticatedWatcherCount
  );
  const disposition = continuationDisposition(
    control,
    { ...config, ...runtime, pollIntervalSeconds: intervalSeconds },
    Date.now()
  );
  if (disposition.action !== "send") {
    return { claimed: false, reason: disposition.action };
  }

  await updateRuntime(tabId, {
    pendingSequence: sequence,
    pendingRunId: runId,
    pendingIsRetry: disposition.isRetry
  });
  return { claimed: true, isRetry: disposition.isRetry };
}

async function ackSequence(sender, message) {
  const tabId = requireSenderTabId(sender);
  const runtime = await loadRuntime(tabId);
  if (!runtime.enabled) return { acknowledged: false };

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (runtime.pendingRunId !== runId || Number(runtime.pendingSequence) !== sequence) {
    return { acknowledged: false };
  }

  const isRetry = Boolean(runtime.pendingIsRetry);
  await updateRuntime(tabId, {
    lastHandledSequence: sequence,
    lastSentAt: new Date().toISOString(),
    sameSequenceRetryCount: isRetry ? Number(runtime.sameSequenceRetryCount || 0) + 1 : 0,
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false,
    runCount: Number(runtime.runCount || 0) + 1,
    lastError: null
  });
  return { acknowledged: true };
}

async function releaseSequence(sender, message) {
  const tabId = requireSenderTabId(sender);
  const runtime = await loadRuntime(tabId);

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (runtime.pendingRunId !== runId || Number(runtime.pendingSequence) !== sequence) {
    return { released: false };
  }

  await updateRuntime(tabId, {
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false
  });
  return { released: true };
}

async function startTabSession(tabId) {
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGptUrl(tab.url || "")) {
    throw new Error("Start는 ChatGPT 탭에서만 사용할 수 있습니다.");
  }

  const config = await loadConfig(tabId);
  if (!String(config.owner || "").trim() || !String(config.repo || "").trim()) {
    throw new Error("Owner와 Repository를 입력해주세요.");
  }

  const conflictTabId = await findConflictingTab(tabId, config);
  if (conflictTabId !== null) {
    throw new Error(`같은 GitHub control stream이 이미 tab ${conflictTabId}에서 실행 중입니다.`);
  }

  await configureTabSidePanel(tabId);
  await ensureContentScript(tabId);

  let control;
  try {
    control = await fetchControl(config, tabId, { allowMissing: true });
  } catch (error) {
    if (!isRateLimitPause(error)) throw error;

    await updateRuntime(tabId, {
      enabled: true,
      stopReason: null,
      lastError: null,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      handoffPending: false,
      handoffToTabId: null,
      bootstrapPending: false,
      bootstrapCompletedAt: null
    });

    const wake = await chrome.tabs.sendMessage(tabId, { type: "RERUN_WAKE" });
    if (!wake?.ready) {
      await stopSession(tabId, "start_failed");
      throw new Error("ChatGPT 탭의 rerun content script가 응답하지 않습니다.");
    }

    return {
      action: "rate_limited_wait",
      tabId,
      retryAt: new Date(error.untilMs).toISOString()
    };
  }

  if (!control) {
    if (!isAutoBootstrapPath(config)) {
      throw new Error("Custom control file이 존재하지 않습니다. 자동 초기화는 기본 .chatgpt-rerun/control.json 경로에서만 동작합니다.");
    }

    await assertRepositoryBranchAccessible(config, tabId);
    await updateRuntime(tabId, {
      enabled: true,
      stopReason: null,
      lastError: null,
      lastRunId: null,
      lastHandledSequence: -1,
      lastSentAt: null,
      sameSequenceRetryCount: 0,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      runCount: 0,
      lastStatus: "initializing",
      lastSequence: null,
      handoffPending: false,
      handoffToTabId: null,
      bootstrapPending: true,
      bootstrapRequestedAt: new Date().toISOString(),
      bootstrapCompletedAt: null
    });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: "RERUN_BOOTSTRAP",
      prompt: buildRepositoryBootstrapPrompt(config)
    });
    if (!response?.sent) {
      const detail = response?.error || "ChatGPT 탭에 repository bootstrap 프롬프트를 보내지 못했습니다.";
      await stopSession(tabId, "bootstrap_send_failed");
      await updateRuntime(tabId, { lastError: detail });
      throw new Error(detail);
    }

    return { action: "bootstrapping", tabId };
  }

  await updateRuntime(tabId, {
    enabled: true,
    stopReason: null,
    lastError: null,
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false,
    handoffPending: false,
    handoffToTabId: null,
    bootstrapPending: false,
    bootstrapCompletedAt: null
  });

  const wake = await chrome.tabs.sendMessage(tabId, { type: "RERUN_WAKE" });
  if (!wake?.ready) {
    await stopSession(tabId, "start_failed");
    throw new Error("ChatGPT 탭의 rerun content script가 응답하지 않습니다.");
  }

  return { action: "started", tabId };
}

async function findConflictingTab(tabId, config) {
  const all = await chrome.storage.local.get(null);
  const wanted = streamKey(config);
  for (const [key, value] of Object.entries(all)) {
    const otherTabId = tabIdFromRuntimeKey(key);
    if (otherTabId === null || otherTabId === tabId || !value?.enabled) continue;
    const otherConfigKey = tabConfigKey(otherTabId);
    const otherConfig = { ...DEFAULT_CONFIG, ...(all[otherConfigKey] || {}) };
    if (streamKey(otherConfig) === wanted) return otherTabId;
  }
  return null;
}

async function controlForHandoff(config, tabId, runtime) {
  try {
    return await fetchControl(config, tabId);
  } catch (error) {
    if (!isRateLimitPause(error)) throw error;

    const cached = cacheFor(config).cachedControl;
    if (cached) return cached;

    const sequence = Number(runtime.lastSequence);
    if (String(runtime.lastRunId || "").trim() && Number.isSafeInteger(sequence) && sequence >= 0) {
      return {
        runId: runtime.lastRunId,
        sequence,
        status: ["continue", "complete", "needs_user", "blocked"].includes(runtime.lastStatus)
          ? runtime.lastStatus
          : "unknown",
        reason: "",
        updatedAt: "",
        taskId: ""
      };
    }

    throw error;
  }
}

async function handoffToNewChat(oldTabId) {
  const config = await loadConfig(oldTabId);
  const oldRuntime = await loadRuntime(oldTabId);
  if (!String(config.owner || "").trim() || !String(config.repo || "").trim()) {
    throw new Error("새 채팅 handoff 전에 Owner와 Repository를 설정해야 합니다.");
  }
  if (oldRuntime.bootstrapPending) {
    throw new Error("저장소 bootstrap이 끝난 뒤 새 채팅으로 이어갈 수 있습니다.");
  }

  const conflictTabId = await findConflictingTab(oldTabId, config);
  if (conflictTabId !== null) {
    throw new Error(`같은 GitHub control stream이 이미 tab ${conflictTabId}에서 실행 중입니다.`);
  }

  const control = await controlForHandoff(config, oldTabId, oldRuntime);

  await updateRuntime(oldTabId, { handoffPending: true, lastError: null });
  let oldSessionTransferred = false;

  try {
    const newTab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: true });
    const newTabId = newTab.id;
    if (!Number.isSafeInteger(newTabId)) {
      throw new Error("새 ChatGPT 탭을 만들지 못했습니다.");
    }

    await waitForTabComplete(newTabId, 20_000);
    await configureTabSidePanel(newTabId);
    await ensureContentScript(newTabId);

    const newRuntime = {
      ...oldRuntime,
      enabled: true,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      stopReason: null,
      lastError: null,
      handoffPending: true,
      handoffFromTabId: oldTabId,
      handoffToTabId: null,
      bootstrapPending: false
    };

    await chrome.storage.local.set({
      [tabConfigKey(newTabId)]: config,
      [tabDraftKey(newTabId)]: config,
      [tabRuntimeKey(newTabId)]: newRuntime
    });

    await updateRuntime(oldTabId, {
      enabled: false,
      handoffPending: false,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      bootstrapPending: false,
      stopReason: `handed_off_to_tab_${newTabId}`,
      handoffToTabId: newTabId
    });
    oldSessionTransferred = true;

    const prompt = buildNewChatHandoffPrompt(config, control);
    const response = await chrome.tabs.sendMessage(newTabId, {
      type: "RERUN_HANDOFF",
      prompt
    });

    if (!response?.sent) {
      const detail = response?.error || "새 ChatGPT 탭에 handoff 프롬프트를 보내지 못했습니다.";
      await updateRuntime(newTabId, {
        enabled: false,
        handoffPending: false,
        stopReason: "handoff_send_failed",
        lastError: detail
      });
      throw new Error(detail);
    }

    const isRetry = control.sequence === Number(oldRuntime.lastHandledSequence);
    await updateRuntime(newTabId, {
      enabled: true,
      handoffPending: false,
      lastRunId: control.runId,
      lastHandledSequence: control.sequence,
      lastSentAt: new Date().toISOString(),
      sameSequenceRetryCount: isRetry ? Number(oldRuntime.sameSequenceRetryCount || 0) + 1 : 0,
      runCount: Number(oldRuntime.runCount || 0) + 1,
      lastStatus: control.status,
      lastSequence: control.sequence,
      stopReason: null,
      lastError: null
    });

    return {
      action: "handed_off",
      oldTabId,
      newTabId,
      runId: control.runId,
      sequence: control.sequence,
      status: control.status
    };
  } catch (error) {
    if (!oldSessionTransferred) {
      await updateRuntime(oldTabId, { handoffPending: false });
    }
    throw error;
  }
}

async function stopSession(tabId, reason) {
  await updateRuntime(tabId, {
    enabled: false,
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false,
    handoffPending: false,
    bootstrapPending: false,
    stopReason: reason
  });
  return { action: "stop", reason, tabId };
}

async function ensureContentScript(tabId) {
  let contentReady = false;
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_PING" });
    contentReady = Boolean(ping?.ready);
  } catch {
    // The tab may predate the current unpacked-extension load/reload.
  }

  if (!contentReady) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });

    const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_PING" });
    if (!ping?.ready) {
      throw new Error("ChatGPT 탭에 rerun content script를 주입하지 못했습니다.");
    }
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["turn-observer.js"]
  });
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(150);
  }
  throw new Error("새 ChatGPT 탭 로딩이 제한 시간 안에 끝나지 않았습니다.");
}

function requireSenderTabId(sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isSafeInteger(tabId)) {
    throw new Error("This message must come from a Chrome tab");
  }
  return tabId;
}

function normalizeMessageTabId(tabId) {
  const value = Number(tabId);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function requireMessageTabId(message) {
  const tabId = normalizeMessageTabId(message?.tabId);
  if (tabId === null) throw new Error("A valid tabId is required");
  return tabId;
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
