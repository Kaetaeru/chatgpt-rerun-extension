import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  buildRerunConnectionPrompt,
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
const sessionToggle = document.getElementById("sessionToggle");
const handoffButton = document.getElementById("handoff");
const connectPromptButton = document.getElementById("connectPrompt");
let currentTabId = null;
let connectPromptBusy = false;

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

connectPromptButton.addEventListener("click", async () => {
  hideError();
  connectPromptBusy = true;
  connectPromptButton.disabled = true;
  try {
    const runtime = await loadCurrentRuntime();
    if (runtime.enabled) {
      throw new Error("GitHub watcher가 켜져 있을 때는 연결 프롬프트를 보낼 수 없습니다. 먼저 Stop을 눌러주세요.");
    }

    await ensureContentScript(currentTabId);
    const prompt = buildRerunConnectionPrompt();
    const response = await chrome.tabs.sendMessage(currentTabId, {
      type: "RERUN_CONNECT",
      prompt
    });
    if (!response?.sent) {
      throw new Error(response?.error || "Rerun 연결 프롬프트를 전송하지 못했습니다.");
    }
    await refreshRuntime("연결 프롬프트 전송됨 · 채팅의 RERUN_CONNECTION 결과를 확인하세요");
  } catch (error) {
    showError(error);
  } finally {
    connectPromptBusy = false;
    await refreshRuntime();
  }
});

sessionToggle.addEventListener("click", async () => {
  hideError();
  sessionToggle.disabled = true;
  try {
    const runtime = await loadCurrentRuntime();
    if (runtime.enabled) {
      const response = await chrome.runtime.sendMessage({
        type: "STOP_TAB_SESSION",
        tabId: currentTabId,
        reason: "manual"
      });
      if (!response?.ok) throw new Error(response?.error || "Stop failed");
      await refreshRuntime();
      return;
    }

    await persistFormDraft();
    await saveSettings({ requireTarget: true });
    const response = await chrome.runtime.sendMessage({
      type: "START_TAB_SESSION",
      tabId: currentTabId
    });
    if (!response?.ok) throw new Error(response?.error || "Start failed");

    const message = response.action === "bootstrapping"
      ? `Initializing repository · tab ${currentTabId}`
      : response.action === "rate_limited_wait"
        ? `Watching GitHub · API pause until ${formatTime(response.retryAt)}`
        : `Watching GitHub · tab ${currentTabId}`;
    await refreshRuntime(message);
  } catch (error) {
    showError(error);
  } finally {
    sessionToggle.disabled = false;
  }
});

handoffButton.addEventListener("click", async () => {
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
  const ownsLegacySession = Number(legacy.targetTabId) === tabId;
  const config = { ...DEFAULT_CONFIG };
  if (ownsLegacySession) {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (legacy[key] !== undefined) config[key] = legacy[key];
    }
  }

  const runtime = { ...DEFAULT_RUNTIME };
  if (ownsLegacySession) {
    for (const key of Object.keys(DEFAULT_RUNTIME)) {
      if (legacy[key] !== undefined) runtime[key] = legacy[key];
    }
  }

  const legacyDraft = ownsLegacySession && legacy[LEGACY_DRAFT_KEY] && typeof legacy[LEGACY_DRAFT_KEY] === "object"
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
    throw new Error("아직 repository가 연결되지 않았습니다. 연결 프롬프트의 CONNECTED 결과에서 Owner와 Repository를 확인해 입력해주세요.");
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
        rateLimitRemaining: null,
        rateLimitResetAt: null,
        rateLimitPausedUntil: null,
        rateLimitPauseReason: null,
        handoffPending: false,
        handoffFromTabId: null,
        handoffToTabId: null,
        bootstrapPending: false,
        bootstrapRequestedAt: null,
        bootstrapCompletedAt: null
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

async function loadCurrentConfig() {
  const key = tabConfigKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_CONFIG, ...(stored[key] || {}) };
}

async function loadCurrentRuntime() {
  const key = tabRuntimeKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_RUNTIME, ...(stored[key] || {}) };
}

function renderSessionToggle(runtime) {
  const running = Boolean(runtime.enabled);
  sessionToggle.textContent = running ? "Stop" : "Start";
  sessionToggle.classList.toggle("primary", !running);
  sessionToggle.classList.toggle("danger", running);
  sessionToggle.setAttribute("aria-pressed", String(running));
  sessionToggle.setAttribute(
    "aria-label",
    running ? "Stop GitHub watcher on this tab" : "Start GitHub watcher on this tab"
  );
}

async function refreshRuntime(transientMessage) {
  if (currentTabId === null) return;
  const [config, runtime] = await Promise.all([
    loadCurrentConfig(),
    loadCurrentRuntime()
  ]);
  const watching = Boolean(runtime.enabled);
  const connected = Boolean(String(config.owner || "").trim() && String(config.repo || "").trim());
  const branch = String(config.branch || "").trim() || "main";
  const hasToken = Boolean(String(config.githubToken || "").trim());
  const pauseUntilMs = Date.parse(String(runtime.rateLimitPausedUntil || ""));
  const rateLimited = Number.isFinite(pauseUntilMs) && pauseUntilMs > Date.now();

  statusDot.classList.toggle("running", watching);
  const persistentStatus = runtime.bootstrapPending
    ? `Initializing repository · tab ${currentTabId}`
    : watching && rateLimited
      ? `Watching GitHub · API pause until ${formatTime(runtime.rateLimitPausedUntil)}`
      : watching
        ? `Watching GitHub · tab ${currentTabId}`
        : `Stopped · tab ${currentTabId}${runtime.stopReason ? ` · ${runtime.stopReason}` : ""}`;
  statusLine.textContent = transientMessage || persistentStatus;
  renderSessionToggle(runtime);
  handoffButton.disabled = Boolean(runtime.bootstrapPending);
  connectPromptButton.disabled = watching || connectPromptBusy;
  document.getElementById("tabId").textContent = String(currentTabId);
  document.getElementById("connectionState").textContent = connected
    ? `${config.owner}/${config.repo} @ ${branch}`
    : "Unconnected";
  document.getElementById("tabWatcher").textContent = watching ? "Watching" : "Stopped";
  document.getElementById("runId").textContent = runtime.lastRunId || "-";
  document.getElementById("sequence").textContent = runtime.lastSequence ?? "-";
  document.getElementById("githubStatus").textContent = runtime.lastStatus === "continue"
    ? "continue · start"
    : runtime.lastStatus || "-";
  document.getElementById("runCount").textContent = String(runtime.runCount || 0);
  document.getElementById("retryCount").textContent = `${runtime.sameSequenceRetryCount || 0}/${elements.maxRetriesPerSequence.value || DEFAULT_CONFIG.maxRetriesPerSequence}`;
  document.getElementById("lastSentAt").textContent = formatTime(runtime.lastSentAt);
  document.getElementById("apiPolling").textContent = rateLimited
    ? `Paused until ${formatTime(runtime.rateLimitPausedUntil)}`
    : hasToken
      ? "Authenticated · conditional"
      : "Public · rate-safe";

  if (runtime.lastError) {
    errorBox.hidden = false;
    errorBox.textContent = runtime.lastError;
  } else if (!transientMessage) {
    hideError();
  }
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_PING" });
    if (ping?.ready) return;
  } catch {
    // The tab may predate the current unpacked-extension load/reload.
  }

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"]
  });

  const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_PING" });
  if (!ping?.ready) {
    throw new Error("ChatGPT 탭에 Rerun content script를 주입하지 못했습니다.");
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
