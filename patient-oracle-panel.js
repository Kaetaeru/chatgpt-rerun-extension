import { DEFAULT_CONFIG, DEFAULT_RUNTIME, tabConfigKey, tabRuntimeKey } from "./control.js";
import { DEFAULT_TEAM_STATE, teamStateKey } from "./team-control.js";
import {
  DEFAULT_ORACLE_CONFIG,
  DEFAULT_ORACLE_STATE,
  normalizeMaxRedispatches,
  oracleConfigKey,
  oracleStateKey
} from "./utilities/patient-oracle/oracle-control.js";

const ORACLE_PANEL_PORT = "patient-oracle-panel";
let currentTabId = null;
let port = null;
let requestCounter = 0;
const pendingRequests = new Map();

const activeTab = await getActiveChatGptTab();
currentTabId = activeTab.id;
const ui = mountOraclePanel();
connectPanelPort();
await loadForm();
await refreshPanel();
setInterval(refreshPanel, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || currentTabId === null) return;
  const watched = new Set([
    tabConfigKey(currentTabId),
    tabRuntimeKey(currentTabId),
    teamStateKey(currentTabId),
    oracleConfigKey(currentTabId),
    oracleStateKey(currentTabId)
  ]);
  if (Object.keys(changes).some((key) => watched.has(key))) void refreshPanel();
});

for (const element of [ui.path, ui.poll, ui.maxRedispatches]) {
  element.addEventListener("change", persistDraft);
}

ui.toggle.addEventListener("click", async () => {
  ui.error.hidden = true;
  ui.toggle.disabled = true;
  try {
    const state = await loadOracleState();
    if (state.enabled) {
      await request("PATIENT_ORACLE_STOP", { tabId: currentTabId });
    } else {
      await persistDraft();
      await request("PATIENT_ORACLE_START", {
        tabId: currentTabId,
        path: ui.path.value.trim(),
        pollIntervalSeconds: ui.poll.value,
        maxRedispatchesPerRequest: ui.maxRedispatches.value
      });
    }
    await refreshPanel();
  } catch (error) {
    ui.error.hidden = false;
    ui.error.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    ui.toggle.disabled = false;
  }
});

function mountOraclePanel() {
  const section = document.createElement("section");
  section.id = "patientOracleBox";
  section.className = "setupBox patientOracleBox";
  section.innerHTML = `
    <div class="oracleTitleRow">
      <strong>Patient Oracle <span class="muted">MVP</span></strong>
      <span id="oracleModeBadge" class="oracleBadge">Stopped</span>
    </div>
    <p>A question may wait. Its answer must return with its identity intact. GitHub carries the request and durable response; the ChatGPT DOM is never the answer API.</p>
    <label>Runtime path<input id="oraclePath" autocomplete="off" /></label>
    <div class="grid two">
      <label>Poll seconds<input id="oraclePollSeconds" type="number" min="5" /></label>
      <label>Dispatch circuit breaker<input id="oracleMaxRedispatches" type="number" min="1" max="20" /></label>
    </div>
    <div class="oracleRuntimeGrid">
      <div><span>Status</span><strong id="oracleStatus">-</strong></div>
      <div><span>Request</span><strong id="oracleRequest">-</strong></div>
      <div><span>Revision</span><strong id="oracleRevision">-</strong></div>
      <div><span>Dispatches</span><strong id="oracleDispatches">0</strong></div>
      <div><span>18m checkpoint</span><strong id="oracleCheckpoint">-</strong></div>
      <div><span>20m hard stop</span><strong id="oracleHardStop">-</strong></div>
      <div><span>GitHub polling</span><strong id="oracleRate">-</strong></div>
      <div><span>Stop reason</span><strong id="oracleStopReason">-</strong></div>
    </div>
    <p class="hint">If the target repository has no Patient Oracle runtime yet, Start bootstraps the protocol through the current ChatGPT tab. The bootstrap turn obeys the same 18-minute checkpoint and 20-minute hard stop.</p>
    <p class="hint">Single Rerun, Voyage Team, and Patient Oracle are mutually exclusive in one worker tab. GitHub approval remains manual and is never auto-clicked.</p>
    <p id="oracleError" class="error" hidden></p>
    <button id="oracleToggle" class="secondary wide">Start Oracle</button>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .patientOracleBox { border: 1px solid rgba(127,127,127,.35); }
    .oracleTitleRow { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .oracleBadge { font-size:11px; padding:3px 7px; border-radius:999px; border:1px solid rgba(127,127,127,.35); }
    .oracleRuntimeGrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }
    .oracleRuntimeGrid div { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .oracleRuntimeGrid span { font-size:11px; opacity:.7; }
    .oracleRuntimeGrid strong { font-size:12px; overflow-wrap:anywhere; }
  `;
  document.head.appendChild(style);

  const runtimeSection = document.querySelector("section.runtime");
  if (runtimeSection) runtimeSection.before(section);
  else document.querySelector("main")?.appendChild(section);

  return {
    section,
    badge: section.querySelector("#oracleModeBadge"),
    path: section.querySelector("#oraclePath"),
    poll: section.querySelector("#oraclePollSeconds"),
    maxRedispatches: section.querySelector("#oracleMaxRedispatches"),
    status: section.querySelector("#oracleStatus"),
    request: section.querySelector("#oracleRequest"),
    revision: section.querySelector("#oracleRevision"),
    dispatches: section.querySelector("#oracleDispatches"),
    checkpoint: section.querySelector("#oracleCheckpoint"),
    hardStop: section.querySelector("#oracleHardStop"),
    rate: section.querySelector("#oracleRate"),
    stopReason: section.querySelector("#oracleStopReason"),
    error: section.querySelector("#oracleError"),
    toggle: section.querySelector("#oracleToggle")
  };
}

function connectPanelPort() {
  if (port) return;
  port = chrome.runtime.connect({ name: ORACLE_PANEL_PORT });
  port.onMessage.addListener((message) => {
    const requestId = String(message?.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message);
    else pending.reject(new Error(message.error || "Patient Oracle request failed"));
  });
  port.onDisconnect.addListener(() => {
    const error = new Error("Patient Oracle background connection restarted. Try again.");
    for (const pending of pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    pendingRequests.clear();
    port = null;
    setTimeout(connectPanelPort, 500);
  });
}

function request(type, payload) {
  connectPanelPort();
  const requestId = `oracle-panel-${Date.now()}-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Patient Oracle request timed out"));
    }, 25_000);
    pendingRequests.set(requestId, { resolve, reject, timer });
    port.postMessage({ type, requestId, ...payload });
  });
}

async function loadForm() {
  const config = await loadOracleConfig();
  ui.path.value = config.path;
  ui.poll.value = String(config.pollIntervalSeconds);
  ui.maxRedispatches.value = String(config.maxRedispatchesPerRequest);
}

async function persistDraft() {
  const current = await loadOracleConfig();
  const poll = Number(ui.poll.value);
  const next = {
    ...current,
    path: ui.path.value.trim() || DEFAULT_ORACLE_CONFIG.path,
    pollIntervalSeconds: Number.isFinite(poll) ? Math.max(5, Math.floor(poll)) : DEFAULT_ORACLE_CONFIG.pollIntervalSeconds,
    maxRedispatchesPerRequest: normalizeMaxRedispatches(ui.maxRedispatches.value)
  };
  await chrome.storage.local.set({ [oracleConfigKey(currentTabId)]: next });
}

async function refreshPanel() {
  if (currentTabId === null) return;
  const [repository, single, team, oracle] = await Promise.all([
    loadRepositoryConfig(),
    loadSingleRuntime(),
    loadTeamState(),
    loadOracleState()
  ]);

  const connected = Boolean(String(repository.owner || "").trim() && String(repository.repo || "").trim());
  ui.badge.textContent = oracle.enabled ? "Running" : "Stopped";
  ui.status.textContent = oracle.dispatching
    ? "Dispatching"
    : oracle.executing
      ? (oracle.lastStatus === "bootstrapping" ? "Bootstrapping" : "Executing")
      : oracle.lastStatus || (oracle.enabled ? "Watching" : "Stopped");
  ui.request.textContent = oracle.currentRequestId || "-";
  ui.revision.textContent = Number(oracle.lastRevision) >= 0 ? String(oracle.lastRevision) : "-";
  ui.dispatches.textContent = String(oracle.requestDispatchCount || 0);
  ui.checkpoint.textContent = formatTime(oracle.checkpointAt);
  ui.hardStop.textContent = formatTime(oracle.executionHardStopAt);
  ui.rate.textContent = formatRate(oracle);
  ui.stopReason.textContent = oracle.stopReason || "-";
  ui.toggle.textContent = oracle.enabled ? "Stop Oracle" : "Start Oracle";
  ui.toggle.classList.toggle("danger", Boolean(oracle.enabled));
  ui.toggle.classList.toggle("secondary", !oracle.enabled);
  ui.toggle.disabled = !oracle.enabled && (!connected || Boolean(single.enabled) || Boolean(team.enabled));

  if (oracle.lastError) {
    ui.error.hidden = false;
    ui.error.textContent = oracle.lastError;
  } else if (!connected) {
    ui.error.hidden = false;
    ui.error.textContent = "Connect a GitHub repository above before starting Patient Oracle.";
  } else if (single.enabled && !oracle.enabled) {
    ui.error.hidden = false;
    ui.error.textContent = "Single Rerun is active. Stop it before starting Patient Oracle.";
  } else if (team.enabled && !oracle.enabled) {
    ui.error.hidden = false;
    ui.error.textContent = "Voyage Team is active. Stop it before starting Patient Oracle.";
  } else {
    ui.error.hidden = true;
    ui.error.textContent = "";
  }
}

async function loadRepositoryConfig() {
  const key = tabConfigKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_CONFIG, ...(stored[key] || {}) };
}

async function loadSingleRuntime() {
  const key = tabRuntimeKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_RUNTIME, ...(stored[key] || {}) };
}

async function loadTeamState() {
  const key = teamStateKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_TEAM_STATE, ...(stored[key] || {}) };
}

async function loadOracleConfig() {
  const key = oracleConfigKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_ORACLE_CONFIG, ...(stored[key] || {}) };
}

async function loadOracleState() {
  const key = oracleStateKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_ORACLE_STATE, ...(stored[key] || {}) };
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

function formatRate(state) {
  const pausedUntil = Date.parse(String(state.rateLimitPausedUntil || ""));
  if (Number.isFinite(pausedUntil) && pausedUntil > Date.now()) return `Paused until ${formatTime(state.rateLimitPausedUntil)}`;
  if (Number.isFinite(Number(state.rateLimitRemaining))) return `${state.rateLimitRemaining} remaining`;
  return state.enabled ? "Watching" : "-";
}

async function getActiveChatGptTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isChatGptUrl(tab.url || "")) {
    throw new Error("Open The Voyage of Theseus Side Panel from an active ChatGPT tab.");
  }
  return tab;
}

function isChatGptUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}
