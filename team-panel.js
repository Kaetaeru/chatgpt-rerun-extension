import {
  DEFAULT_TEAM_CONFIG,
  DEFAULT_TEAM_STATE,
  teamConfigKey,
  teamStateKey
} from "./team-control.js";
import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  tabConfigKey,
  tabRuntimeKey
} from "./control.js";

// Legacy wire name retained for v0.4 compatibility.
const TEAM_PANEL_PORT = "rerun-team-panel";
let currentTabId = null;
let port = null;
let requestCounter = 0;
const pendingRequests = new Map();

const activeTab = await getActiveChatGptTab();
currentTabId = activeTab.id;
const ui = mountTeamPanel();
connectPanelPort();
await loadTeamForm();
await refreshTeamPanel();
setInterval(refreshTeamPanel, 1000);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || currentTabId === null) return;
  const keys = new Set([
    teamConfigKey(currentTabId),
    teamStateKey(currentTabId),
    tabConfigKey(currentTabId),
    tabRuntimeKey(currentTabId)
  ]);
  if (Object.keys(changes).some((key) => keys.has(key))) void refreshTeamPanel();
});

ui.goal.addEventListener("input", persistTeamDraft);
ui.maxTaskHandoffs.addEventListener("input", persistTeamDraft);

ui.toggle.addEventListener("click", async () => {
  ui.error.hidden = true;
  ui.toggle.disabled = true;
  try {
    const state = await loadTeamState();
    if (state.enabled) {
      await request("TEAM_STOP", { tabId: currentTabId });
    } else {
      await persistTeamDraft();
      await request("TEAM_START", {
        tabId: currentTabId,
        goal: ui.goal.value.trim(),
        maxTaskHandoffs: ui.maxTaskHandoffs.value
      });
    }
    await refreshTeamPanel();
  } catch (error) {
    ui.error.hidden = false;
    ui.error.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    ui.toggle.disabled = false;
  }
});

function mountTeamPanel() {
  const section = document.createElement("section");
  section.id = "teamRuntimeBox";
  section.className = "setupBox teamRuntimeBox";
  section.innerHTML = `
    <div class="teamTitleRow">
      <strong>Voyage Team <span class="muted">v0.4</span></strong>
      <span id="teamModeBadge" class="teamBadge">Stopped</span>
    </div>
    <p>Planner and Programmer take turns in fresh ChatGPT conversations while reusing this one Chrome tab. GitHub is their only shared durable memory.</p>
    <label>Voyage goal<textarea id="teamGoal" rows="3" placeholder="Example: design, implement, and verify a combat log system"></textarea></label>
    <div class="grid two">
      <label>Task dispatch safety<input id="teamMaxTaskHandoffs" type="number" min="2" max="20" /></label>
      <div class="teamPathWrap"><span class="muted">Runtime</span><strong>.chatgpt-rerun/team/runtime.json</strong></div>
    </div>
    <div class="teamRuntimeGrid">
      <div><span>Status</span><strong id="teamStatus">-</strong></div>
      <div><span>Agent</span><strong id="teamAgent">-</strong></div>
      <div><span>Task</span><strong id="teamTask">-</strong></div>
      <div><span>Revision</span><strong id="teamRevision">-</strong></div>
      <div><span>Task dispatches</span><strong id="teamHandoffs">0</strong></div>
      <div><span>Last dispatch</span><strong id="teamLastDispatch">-</strong></div>
    </div>
    <p class="hint">Start Team resumes an existing Team Runtime or bootstraps one from the current goal. Every agent switch opens a fresh ChatGPT conversation in the same tab. Single watcher mode cannot run at the same time.</p>
    <p id="teamError" class="error" hidden></p>
    <button id="teamToggle" class="secondary wide">Start Team</button>
  `;

  const style = document.createElement("style");
  style.textContent = `
    .teamRuntimeBox { border: 1px solid rgba(127,127,127,.35); }
    .teamTitleRow { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .teamBadge { font-size:11px; padding:3px 7px; border-radius:999px; border:1px solid rgba(127,127,127,.35); }
    .teamRuntimeGrid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin:12px 0; }
    .teamRuntimeGrid div, .teamPathWrap { display:flex; flex-direction:column; gap:3px; min-width:0; }
    .teamRuntimeGrid span, .teamPathWrap span { font-size:11px; opacity:.7; }
    .teamRuntimeGrid strong, .teamPathWrap strong { font-size:12px; overflow-wrap:anywhere; }
  `;
  document.head.appendChild(style);

  const runtimeSection = document.querySelector("section.runtime");
  if (runtimeSection) runtimeSection.before(section);
  else document.querySelector("main")?.appendChild(section);

  return {
    section,
    badge: section.querySelector("#teamModeBadge"),
    goal: section.querySelector("#teamGoal"),
    maxTaskHandoffs: section.querySelector("#teamMaxTaskHandoffs"),
    status: section.querySelector("#teamStatus"),
    agent: section.querySelector("#teamAgent"),
    task: section.querySelector("#teamTask"),
    revision: section.querySelector("#teamRevision"),
    handoffs: section.querySelector("#teamHandoffs"),
    lastDispatch: section.querySelector("#teamLastDispatch"),
    error: section.querySelector("#teamError"),
    toggle: section.querySelector("#teamToggle")
  };
}

function connectPanelPort() {
  if (port) return;
  port = chrome.runtime.connect({ name: TEAM_PANEL_PORT });
  port.onMessage.addListener((message) => {
    const requestId = String(message?.requestId || "");
    const pending = pendingRequests.get(requestId);
    if (!pending) return;
    pendingRequests.delete(requestId);
    clearTimeout(pending.timer);
    if (message.ok) pending.resolve(message);
    else pending.reject(new Error(message.error || "Team Runtime request failed"));
  });
  port.onDisconnect.addListener(() => {
    const error = new Error("The Team Runtime background connection restarted. Try again.");
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
  const requestId = `team-panel-${Date.now()}-${++requestCounter}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      reject(new Error("Team Runtime request timed out"));
    }, 25_000);
    pendingRequests.set(requestId, { resolve, reject, timer });
    port.postMessage({ type, requestId, ...payload });
  });
}

async function loadTeamForm() {
  const config = await loadTeamConfig();
  ui.goal.value = config.goal || "";
  ui.maxTaskHandoffs.value = String(config.maxTaskHandoffs || DEFAULT_TEAM_CONFIG.maxTaskHandoffs);
}

async function persistTeamDraft() {
  const config = await loadTeamConfig();
  await chrome.storage.local.set({
    [teamConfigKey(currentTabId)]: {
      ...config,
      goal: ui.goal.value.trim(),
      maxTaskHandoffs: ui.maxTaskHandoffs.value || DEFAULT_TEAM_CONFIG.maxTaskHandoffs
    }
  });
}

async function refreshTeamPanel() {
  if (currentTabId === null) return;
  const [teamState, repositoryConfig, singleRuntime] = await Promise.all([
    loadTeamState(),
    loadRepositoryConfig(),
    loadSingleRuntime()
  ]);

  const connected = Boolean(String(repositoryConfig.owner || "").trim() && String(repositoryConfig.repo || "").trim());
  ui.badge.textContent = teamState.enabled ? "Running" : "Stopped";
  ui.status.textContent = teamState.bootstrapPending
    ? "Bootstrapping"
    : teamState.dispatching
      ? "Dispatching"
      : teamState.executing
        ? "Executing"
        : teamState.lastStatus || (teamState.enabled ? "Watching" : "Stopped");
  ui.agent.textContent = teamState.currentAgent || "-";
  ui.task.textContent = teamState.currentTaskId || "-";
  ui.revision.textContent = teamState.lastRevision >= 0 ? String(teamState.lastRevision) : "-";
  ui.handoffs.textContent = String(teamState.taskHandoffCount || 0);
  ui.lastDispatch.textContent = formatTime(teamState.lastDispatchAt);
  ui.toggle.textContent = teamState.enabled ? "Stop Team" : "Start Team";
  ui.toggle.classList.toggle("danger", Boolean(teamState.enabled));
  ui.toggle.classList.toggle("secondary", !teamState.enabled);
  ui.toggle.disabled = !teamState.enabled && (!connected || Boolean(singleRuntime.enabled));
  const singleToggle = document.getElementById("sessionToggle");
  if (singleToggle) {
    singleToggle.disabled = Boolean(teamState.enabled);
    singleToggle.title = teamState.enabled ? "Single watcher mode is unavailable while Team Runtime is active." : "";
  }

  if (teamState.lastError) {
    ui.error.hidden = false;
    ui.error.textContent = teamState.lastError;
  } else if (!connected) {
    ui.error.hidden = false;
    ui.error.textContent = "Connect a GitHub repository above before starting the voyage.";
  } else if (singleRuntime.enabled && !teamState.enabled) {
    ui.error.hidden = false;
    ui.error.textContent = "Single watcher mode is running. Stop it before starting Team Runtime.";
  } else {
    ui.error.hidden = true;
    ui.error.textContent = "";
  }
}

async function loadTeamConfig() {
  const key = teamConfigKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_TEAM_CONFIG, ...(stored[key] || {}) };
}

async function loadTeamState() {
  const key = teamStateKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_TEAM_STATE, ...(stored[key] || {}) };
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

async function getActiveChatGptTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isChatGptUrl(tab.url || "")) {
    throw new Error("Open The Voyage of Theseus Side Panel from an active ChatGPT tab.");
  }
  return tab;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleTimeString();
}

function isChatGptUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}
