import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  effectivePollInterval,
  effectiveRetryDelay,
  normalizeMaxRetries,
  normalizeMaxRuns,
  streamKey,
  tabConfigKey,
  tabDraftKey,
  tabRuntimeKey
} from "./control.js";

const LEGACY_DRAFT_KEY = "formDraft";
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
let currentTabId = null;

const activeTab = await getActiveChatGptTab();
currentTabId = activeTab.id;
await migrateLegacySession(currentTabId);
await loadForm();
await refreshRuntime();
setInterval(refreshRuntime, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const relevantKeys = new Set([
    tabConfigKey(currentTabId),
    tabRuntimeKey(currentTabId),
    tabDraftKey(currentTabId)
  ]);
  if (Object.keys(changes).some((key) => relevantKeys.has(key))) {
    void refreshRuntime();
  }
});

for (const element of Object.values(elements)) {
  element.addEventListener("input", () => {
    hideError();
    void persistFormDraft();
  });
}

document.getElementById("save").addEventListener("click", async () => {
  try {
    await saveSettings({ requireTarget: false });
    await refreshRuntime("Saved for this tab");
  } catch (error) {
    showError(error);
  }
});

document.getElementById("start").addEventListener("click", async () => {
  try {
    await persistFormDraft();
    await saveSettings({ requireTarget: true });
    const response = await chrome.runtime.sendMessage({
      type: "START_TAB_SESSION",
      tabId: currentTabId
    });
    if (!response?.ok) throw new Error(response?.error || "Start failed");
    await refreshRuntime(`Running on tab ${currentTabId}`);
  } catch (error) {
    showError(error);
  }
});

document.getElementById("stop").addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: "STOP_TAB_SESSION",
      tabId: currentTabId,
      reason: "manual"
    });
    if (!response?.ok) throw new Error(response?.error || "Stop failed");
    await refreshRuntime();
  } catch (error) {
    showError(error);
  }
});

document.getElementById("handoff").addEventListener("click", async () => {
  try {
    await persistFormDraft();
    await saveSettings({ requireTarget: true });
    statusLine.textContent = "Opening a new ChatGPT tab…";
    const response = await chrome.runtime.sendMessage({
      type: "HANDOFF_NEW_CHAT",
      tabId: currentTabId
    });
    if (!response?.ok) throw new Error(response?.error || "New-chat handoff failed");
    await refreshRuntime(`Handed off to tab ${response.newTabId}`);
  } catch (error) {
    showError(error);
  }
});

async function getActiveChatGptTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isChatGptUrl(tab.url || "")) {
    throw new Error("이 Side Panel은 활성 ChatGPT 탭에서 열어주세요.");
  }
  return tab;
}

async function migrateLegacySession(tabId) {
  const configKey = tabConfigKey(tabId);
  const runtimeKey = tabRuntimeKey(tabId);
  const draftKey = tabDraftKey(tabId);
  const existing = await chrome.storage.local.get([configKey, runtimeKey, draftKey]);
  if (existing[configKey] || existing[runtimeKey] || existing[draftKey]) return;

  const legacy = await chrome.storage.local.get(null);
  const config = { ...DEFAULT_CONFIG };
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (legacy[key] !== undefined) config[key] = legacy[key];
  }

  const runtime = { ...DEFAULT_RUNTIME };
  if (Number(legacy.targetTabId) === tabId) {
    for (const key of Object.keys(DEFAULT_RUNTIME)) {
      if (legacy[key] !== undefined) runtime[key] = legacy[key];
    }
  }

  const legacyDraft = legacy[LEGACY_DRAFT_KEY] && typeof legacy[LEGACY_DRAFT_KEY] === "object"
    ? legacy[LEGACY_DRAFT_KEY]
    : config;

  await chrome.storage.local.set({
    [configKey]: config,
    [runtimeKey]: runtime,
    [draftKey]: legacyDraft
  });
}

async function loadForm() {
  const configKey = tabConfigKey(currentTabId);
  const draftKey = tabDraftKey(currentTabId);
  const stored = await chrome.storage.local.get([configKey, draftKey]);
  const config = { ...DEFAULT_CONFIG, ...(stored[configKey] || {}) };
  const draft = stored[draftKey] && typeof stored[draftKey] === "object"
    ? stored[draftKey]
    : {};

  for (const id of ids) {
    elements[id].value = draft[id] ?? config[id] ?? "";
  }
}

function collectFormDraft() {
  return Object.fromEntries(ids.map((id) => [id, elements[id].value]));
}

async function persistFormDraft() {
  await chrome.storage.local.set({
    [tabDraftKey(currentTabId)]: collectFormDraft()
  });
}

async function saveSettings({ requireTarget }) {
  const configKey = tabConfigKey(currentTabId);
  const runtimeKey = tabRuntimeKey(currentTabId);
  const stored = await chrome.storage.local.get([configKey, runtimeKey]);
  const before = { ...DEFAULT_CONFIG, ...(stored[configKey] || {}) };
  const runtime = { ...DEFAULT_RUNTIME, ...(stored[runtimeKey] || {}) };

  const token = elements.githubToken.value.trim();
  const pollIntervalSeconds = effectivePollInterval(
    elements.pollIntervalSeconds.value,
    Boolean(token)
  );
  const next = {
    owner: elements.owner.value.trim(),
    repo: elements.repo.value.trim(),
    branch: elements.branch.value.trim() || "main",
    path: elements.path.value.trim() || DEFAULT_CONFIG.path,
    resumePrompt: elements.resumePrompt.value || DEFAULT_CONFIG.resumePrompt,
    githubToken: token,
    pollIntervalSeconds,
    retryDelaySeconds: effectiveRetryDelay(elements.retryDelaySeconds.value, pollIntervalSeconds),
    maxRetriesPerSequence: normalizeMaxRetries(elements.maxRetriesPerSequence.value),
    maxRuns: normalizeMaxRuns(elements.maxRuns.value)
  };

  if (requireTarget && (!next.owner || !next.repo)) {
    throw new Error("Owner와 Repository를 입력해주세요.");
  }

  const changedStream = streamKey(before) !== streamKey(next);
  const nextRuntime = changedStream
    ? {
        ...runtime,
        enabled: false,
        lastRunId: null,
        lastHandledSequence: -1,
        lastSentAt: null,
        sameSequenceRetryCount: 0,
        pendingSequence: null,
        pendingRunId: null,
        pendingIsRetry: false,
        runCount: 0,
        stopReason: null,
        lastError: null,
        lastStatus: null,
        lastSequence: null,
        handoffPending: false,
        handoffFromTabId: null,
        handoffToTabId: null
      }
    : runtime;

  await chrome.storage.local.set({
    [configKey]: next,
    [runtimeKey]: nextRuntime
  });

  elements.branch.value = next.branch;
  elements.path.value = next.path;
  elements.pollIntervalSeconds.value = String(next.pollIntervalSeconds);
  elements.retryDelaySeconds.value = String(next.retryDelaySeconds);
  elements.maxRetriesPerSequence.value = String(next.maxRetriesPerSequence);
  elements.maxRuns.value = String(next.maxRuns);
  await persistFormDraft();
}

async function refreshRuntime(transientMessage) {
  if (currentTabId === null) return;
  const key = tabRuntimeKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  const runtime = { ...DEFAULT_RUNTIME, ...(stored[key] || {}) };

  statusDot.classList.toggle("running", Boolean(runtime.enabled));
  statusLine.textContent = transientMessage || (runtime.enabled
    ? `Running · tab ${currentTabId}`
    : `Stopped · tab ${currentTabId}${runtime.stopReason ? ` · ${runtime.stopReason}` : ""}`);
  document.getElementById("tabId").textContent = String(currentTabId);
  document.getElementById("runId").textContent = runtime.lastRunId || "-";
  document.getElementById("sequence").textContent = runtime.lastSequence ?? "-";
  document.getElementById("githubStatus").textContent = runtime.lastStatus || "-";
  document.getElementById("runCount").textContent = String(runtime.runCount || 0);
  document.getElementById("retryCount").textContent = `${runtime.sameSequenceRetryCount || 0}/${elements.maxRetriesPerSequence.value || DEFAULT_CONFIG.maxRetriesPerSequence}`;
  document.getElementById("lastSentAt").textContent = formatTime(runtime.lastSentAt);
  document.getElementById("rateLimit").textContent = runtime.rateLimitRemaining ?? "-";

  if (runtime.lastError) {
    errorBox.hidden = false;
    errorBox.textContent = runtime.lastError;
  } else if (!transientMessage) {
    hideError();
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

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showError(error) {
  errorBox.hidden = false;
  errorBox.textContent = error instanceof Error ? error.message : String(error);
}
