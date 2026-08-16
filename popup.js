import {
  DEFAULT_SETTINGS,
  effectivePollInterval,
  effectiveRetryDelay,
  normalizeMaxRetries,
  normalizeMaxRuns,
  streamKey
} from "./control.js";

const ids = [
  "owner",
  "repo",
  "branch",
  "path",
  "resumePrompt",
  "pollIntervalSeconds",
  "retryDelaySeconds",
  "maxRetriesPerSequence",
  "githubToken",
  "maxRuns"
];

const elements = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
const statusLine = document.getElementById("statusLine");
const statusDot = document.getElementById("statusDot");
const errorBox = document.getElementById("errorBox");

await loadForm();
await refreshRuntime();
setInterval(refreshRuntime, 1000);

chrome.storage.onChanged.addListener(() => refreshRuntime());

document.getElementById("save").addEventListener("click", async () => {
  try {
    await saveSettings();
    await refreshRuntime("Saved");
  } catch (error) {
    showError(error);
  }
});

document.getElementById("start").addEventListener("click", async () => {
  try {
    await saveSettings();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isChatGptUrl(tab.url || "")) {
      throw new Error("ChatGPT 탭에서 Start를 눌러주세요.");
    }
    await chrome.storage.local.set({
      enabled: true,
      targetTabId: tab.id,
      stopReason: null,
      lastError: null,
      pendingSequence: null,
      pendingRunId: null,
      pendingIsRetry: false
    });
    await refreshRuntime();
  } catch (error) {
    showError(error);
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  await chrome.storage.local.set({
    enabled: false,
    stopReason: "manual",
    pendingSequence: null,
    pendingRunId: null,
    pendingIsRetry: false
  });
  await refreshRuntime();
});

async function loadForm() {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(null)) };
  for (const id of ids) {
    elements[id].value = settings[id] ?? "";
  }
}

async function saveSettings() {
  const before = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(null)) };
  const token = elements.githubToken.value.trim();
  const pollIntervalSeconds = effectivePollInterval(
    elements.pollIntervalSeconds.value,
    Boolean(token)
  );
  const next = {
    owner: elements.owner.value.trim(),
    repo: elements.repo.value.trim(),
    branch: elements.branch.value.trim() || "main",
    path: elements.path.value.trim() || DEFAULT_SETTINGS.path,
    resumePrompt: elements.resumePrompt.value || DEFAULT_SETTINGS.resumePrompt,
    githubToken: token,
    pollIntervalSeconds,
    retryDelaySeconds: effectiveRetryDelay(elements.retryDelaySeconds.value, pollIntervalSeconds),
    maxRetriesPerSequence: normalizeMaxRetries(elements.maxRetriesPerSequence.value),
    maxRuns: normalizeMaxRuns(elements.maxRuns.value)
  };

  if (!next.owner || !next.repo) throw new Error("Owner와 Repository를 입력해주세요.");

  const changedStream = streamKey(before) !== streamKey(next);
  const reset = changedStream
    ? {
        lastRunId: null,
        lastHandledSequence: -1,
        lastSentAt: null,
        sameSequenceRetryCount: 0,
        pendingSequence: null,
        pendingRunId: null,
        pendingIsRetry: false,
        runCount: 0,
        lastStatus: null,
        lastSequence: null
      }
    : {};

  await chrome.storage.local.set({ ...next, ...reset });
  elements.pollIntervalSeconds.value = String(next.pollIntervalSeconds);
  elements.retryDelaySeconds.value = String(next.retryDelaySeconds);
  elements.maxRetriesPerSequence.value = String(next.maxRetriesPerSequence);
}

async function refreshRuntime(transientMessage) {
  const settings = { ...DEFAULT_SETTINGS, ...(await chrome.storage.local.get(null)) };
  statusDot.classList.toggle("running", Boolean(settings.enabled));
  statusLine.textContent = transientMessage || (settings.enabled ? "Running" : `Stopped${settings.stopReason ? ` · ${settings.stopReason}` : ""}`);
  document.getElementById("runId").textContent = settings.lastRunId || "-";
  document.getElementById("sequence").textContent = settings.lastSequence ?? "-";
  document.getElementById("githubStatus").textContent = settings.lastStatus || "-";
  document.getElementById("runCount").textContent = String(settings.runCount || 0);
  document.getElementById("retryCount").textContent = `${settings.sameSequenceRetryCount || 0}/${settings.maxRetriesPerSequence}`;
  document.getElementById("lastSentAt").textContent = formatTime(settings.lastSentAt);
  document.getElementById("rateLimit").textContent = settings.rateLimitRemaining ?? "-";

  if (settings.lastError) {
    errorBox.hidden = false;
    errorBox.textContent = settings.lastError;
  } else {
    errorBox.hidden = true;
    errorBox.textContent = "";
  }
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleTimeString();
}

function isChatGptUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}

function showError(error) {
  errorBox.hidden = false;
  errorBox.textContent = error instanceof Error ? error.message : String(error);
}
