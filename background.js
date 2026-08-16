import {
  DEFAULT_SETTINGS,
  continuationDisposition,
  effectivePollInterval,
  normalizeMaxRuns,
  parseControlPayload
} from "./control.js";

let lastFetchKey = null;
let lastEtag = null;
let cachedControl = null;
let lastFetchAt = 0;

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const missing = {};
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    if (stored[key] === undefined) missing[key] = value;
  }
  if (Object.keys(missing).length) {
    await chrome.storage.local.set(missing);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch(async (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      await chrome.storage.local.set({ lastError: detail });
      sendResponse({ ok: false, error: detail });
    });
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "POLL":
      return poll(sender);
    case "CLAIM_SEQUENCE":
      return claimSequence(sender, message);
    case "ACK_SEQUENCE":
      return ackSequence(sender, message);
    case "RELEASE_SEQUENCE":
      return releaseSequence(sender, message);
    case "STOP_SESSION":
      return stopSession(message.reason || "stopped");
    default:
      return { action: "none" };
  }
}

async function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(null)) };
}

function assertTargetTab(settings, sender) {
  const senderTabId = sender?.tab?.id ?? null;
  return Boolean(settings.enabled && senderTabId && senderTabId === settings.targetTabId);
}

async function poll(sender) {
  let settings = await loadSettings();
  if (!assertTargetTab(settings, sender)) return { action: "none" };

  const token = String(settings.githubToken || "").trim();
  const intervalSeconds = effectivePollInterval(settings.pollIntervalSeconds, Boolean(token));
  const now = Date.now();

  if (now - lastFetchAt < intervalSeconds * 1000 && cachedControl) {
    return actionForControl(settings, cachedControl, intervalSeconds, now);
  }

  const control = await fetchControl(settings);
  if (!control) return { action: "none" };

  settings = await loadSettings();
  return actionForControl(settings, control, intervalSeconds, now);
}

async function fetchControl(settings) {
  const owner = String(settings.owner || "").trim();
  const repo = String(settings.repo || "").trim();
  const branch = String(settings.branch || "main").trim();
  const path = String(settings.path || "").replace(/^\/+/, "").trim();

  if (!owner || !repo || !path) {
    throw new Error("GitHub owner, repository, and control file path are required");
  }

  const key = `${owner}/${repo}@${branch}:${path}`;
  if (key !== lastFetchKey) {
    lastFetchKey = key;
    lastEtag = null;
    cachedControl = null;
    lastFetchAt = 0;
  }

  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path
      .split("/")
      .map(encodeURIComponent)
      .join("/")}`
  );
  url.searchParams.set("ref", branch);

  const headers = {
    Accept: "application/vnd.github.raw+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  const token = String(settings.githubToken || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (lastEtag) headers["If-None-Match"] = lastEtag;

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store"
  });
  lastFetchAt = Date.now();

  const remaining = response.headers.get("x-ratelimit-remaining");
  const reset = response.headers.get("x-ratelimit-reset");
  await chrome.storage.local.set({
    lastCheckedAt: new Date().toISOString(),
    rateLimitRemaining: remaining === null ? null : Number(remaining),
    rateLimitResetAt: reset === null ? null : new Date(Number(reset) * 1000).toISOString()
  });

  if (response.status === 304 && cachedControl) {
    return cachedControl;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("GitHub control file was not found");
    }
    if (response.status === 401) {
      throw new Error("GitHub authentication failed");
    }
    if (response.status === 403 && remaining === "0") {
      throw new Error("GitHub API rate limit reached; wait for reset or use a token");
    }
    throw new Error(`GitHub request failed with HTTP ${response.status}`);
  }

  lastEtag = response.headers.get("etag");
  cachedControl = parseControlPayload(await response.text());
  return cachedControl;
}

async function actionForControl(settings, control, intervalSeconds, now) {
  await chrome.storage.local.set({
    lastError: null,
    lastStatus: control.status,
    lastSequence: control.sequence
  });

  if (control.runId !== settings.lastRunId) {
    await chrome.storage.local.set({
      lastRunId: control.runId,
      lastHandledSequence: -1,
      lastSentAt: null,
      sameSequenceRetryCount: 0,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      runCount: 0
    });
    settings = {
      ...settings,
      lastRunId: control.runId,
      lastHandledSequence: -1,
      lastSentAt: null,
      sameSequenceRetryCount: 0,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false,
      runCount: 0
    };
  }

  if (["complete", "needs_user", "blocked"].includes(control.status)) {
    await stopSession(control.status);
    return { action: "stop", reason: control.status, control };
  }

  if (settings.pendingSequence !== null) {
    return { action: "none", control };
  }

  const maxRuns = normalizeMaxRuns(settings.maxRuns);
  if (Number(settings.runCount || 0) >= maxRuns) {
    return { action: "stop_when_idle", reason: "max_runs", control };
  }

  const disposition = continuationDisposition(
    control,
    { ...settings, pollIntervalSeconds: intervalSeconds },
    now
  );

  if (disposition.action === "stale") {
    const detail = `Control sequence regressed from ${settings.lastHandledSequence} to ${control.sequence}`;
    await chrome.storage.local.set({ lastError: detail });
    await stopSession("sequence_regressed");
    return { action: "stop", reason: "sequence_regressed", control };
  }

  if (disposition.action === "retry_limit") {
    return { action: "stop_when_idle", reason: "retry_limit", control };
  }

  if (disposition.action !== "send") {
    return { action: "none", control };
  }

  return {
    action: "continue",
    control,
    isRetry: disposition.isRetry,
    prompt: String(settings.resumePrompt || DEFAULT_SETTINGS.resumePrompt)
  };
}

async function claimSequence(sender, message) {
  const settings = await loadSettings();
  if (!assertTargetTab(settings, sender)) return { claimed: false, reason: "wrong_tab" };

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (!cachedControl || cachedControl.runId !== runId || cachedControl.sequence !== sequence || cachedControl.status !== "continue") {
    return { claimed: false, reason: "stale_control" };
  }
  if (settings.pendingSequence !== null) return { claimed: false, reason: "already_claimed" };
  if (Number(settings.runCount || 0) >= normalizeMaxRuns(settings.maxRuns)) {
    return { claimed: false, reason: "max_runs" };
  }

  const token = String(settings.githubToken || "").trim();
  const intervalSeconds = effectivePollInterval(settings.pollIntervalSeconds, Boolean(token));
  const disposition = continuationDisposition(
    cachedControl,
    { ...settings, pollIntervalSeconds: intervalSeconds },
    Date.now()
  );
  if (disposition.action !== "send") {
    return { claimed: false, reason: disposition.action };
  }

  await chrome.storage.local.set({
    pendingSequence: sequence,
    pendingRunId: runId,
    pendingIsRetry: disposition.isRetry
  });
  return { claimed: true, isRetry: disposition.isRetry };
}

async function ackSequence(sender, message) {
  const settings = await loadSettings();
  if (!assertTargetTab(settings, sender)) return { acknowledged: false };

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (settings.pendingRunId !== runId || Number(settings.pendingSequence) !== sequence) {
    return { acknowledged: false };
  }

  const isRetry = Boolean(settings.pendingIsRetry);
  await chrome.storage.local.set({
    lastHandledSequence: sequence,
    lastSentAt: new Date().toISOString(),
    sameSequenceRetryCount: isRetry ? Number(settings.sameSequenceRetryCount || 0) + 1 : 0,
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false,
    runCount: Number(settings.runCount || 0) + 1,
    lastError: null
  });
  return { acknowledged: true };
}

async function releaseSequence(sender, message) {
  const settings = await loadSettings();
  if (!assertTargetTab(settings, sender)) return { released: false };

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (settings.pendingRunId !== runId || Number(settings.pendingSequence) !== sequence) {
    return { released: false };
  }

  await chrome.storage.local.set({
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false
  });
  return { released: true };
}

async function stopSession(reason) {
  await chrome.storage.local.set({
    enabled: false,
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false,
    stopReason: reason
  });
  return { action: "stop", reason };
}
