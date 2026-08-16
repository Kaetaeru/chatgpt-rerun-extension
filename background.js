import {
  DEFAULT_SETTINGS,
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
    return actionForControl(settings, cachedControl);
  }

  const control = await fetchControl(settings);
  if (!control) return { action: "none" };

  settings = await loadSettings();
  return actionForControl(settings, control);
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
  await chrome.storage.local.set({
    lastError: null,
    lastStatus: cachedControl.status,
    lastSequence: cachedControl.sequence
  });
  return cachedControl;
}

async function actionForControl(settings, control) {
  if (control.runId !== settings.lastRunId) {
    await chrome.storage.local.set({
      lastRunId: control.runId,
      lastHandledSequence: -1,
      pendingSequence: null,
      pendingRunId: null,
      runCount: 0
    });
    settings = { ...settings, lastRunId: control.runId, lastHandledSequence: -1, pendingSequence: null, pendingRunId: null, runCount: 0 };
  }

  if (["complete", "needs_user", "blocked"].includes(control.status)) {
    await stopSession(control.status);
    return { action: "stop", reason: control.status, control };
  }

  if (control.status !== "continue") return { action: "none", control };

  if (settings.pendingSequence !== null) {
    return { action: "none", control };
  }

  if (control.sequence <= Number(settings.lastHandledSequence ?? -1)) {
    return { action: "none", control };
  }

  const maxRuns = normalizeMaxRuns(settings.maxRuns);
  if (Number(settings.runCount || 0) >= maxRuns) {
    await stopSession("max_runs");
    return { action: "stop", reason: "max_runs", control };
  }

  return {
    action: "continue",
    control,
    prompt: String(settings.resumePrompt || "진행")
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
  if (sequence <= Number(settings.lastHandledSequence ?? -1)) return { claimed: false, reason: "already_handled" };

  await chrome.storage.local.set({ pendingSequence: sequence, pendingRunId: runId });
  return { claimed: true };
}

async function ackSequence(sender, message) {
  const settings = await loadSettings();
  if (!assertTargetTab(settings, sender)) return { acknowledged: false };

  const runId = String(message.runId || "");
  const sequence = Number(message.sequence);
  if (settings.pendingRunId !== runId || Number(settings.pendingSequence) !== sequence) {
    return { acknowledged: false };
  }

  await chrome.storage.local.set({
    lastHandledSequence: sequence,
    pendingSequence: null,
    pendingRunId: null,
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

  await chrome.storage.local.set({ pendingSequence: null, pendingRunId: null });
  return { released: true };
}

async function stopSession(reason) {
  await chrome.storage.local.set({
    enabled: false,
    pendingSequence: null,
    pendingRunId: null,
    stopReason: reason
  });
  return { action: "stop", reason };
}
