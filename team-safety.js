import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  tabConfigKey,
  tabRuntimeKey
} from "./control.js";
import {
  DEFAULT_TEAM_CONFIG,
  DEFAULT_TEAM_STATE,
  teamConfigKey,
  teamStateKey
} from "./team-control.js";

const TAB_CONFIG_PREFIX = "tabConfig:";
const TAB_RUNTIME_PREFIX = "tabRuntime:";
const TEAM_CONFIG_PREFIX = "teamConfig:";

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const tabIds = new Set();
  for (const key of Object.keys(changes)) {
    const tabId = tabIdFromChangedKey(key);
    if (tabId !== null) tabIds.add(tabId);
  }
  for (const tabId of tabIds) {
    void enforceTeamSafety(tabId);
  }
});

async function enforceTeamSafety(tabId) {
  const keys = [
    tabConfigKey(tabId),
    tabRuntimeKey(tabId),
    teamConfigKey(tabId),
    teamStateKey(tabId)
  ];
  const stored = await chrome.storage.local.get(keys);
  const teamState = { ...DEFAULT_TEAM_STATE, ...(stored[teamStateKey(tabId)] || {}) };
  if (!teamState.enabled) return;

  const singleRuntime = { ...DEFAULT_RUNTIME, ...(stored[tabRuntimeKey(tabId)] || {}) };
  if (singleRuntime.enabled) {
    await stopTeamForSafety(tabId, teamState, "single_watcher_started", "Single watcher started while Team Runtime was active. Team stopped before another dispatch.");
    return;
  }

  const repositoryConfig = { ...DEFAULT_CONFIG, ...(stored[tabConfigKey(tabId)] || {}) };
  const teamConfig = { ...DEFAULT_TEAM_CONFIG, ...(stored[teamConfigKey(tabId)] || {}) };
  const currentStreamKey = teamStreamKey(repositoryConfig, teamConfig);
  if (teamState.streamKey && currentStreamKey !== teamState.streamKey) {
    await stopTeamForSafety(
      tabId,
      teamState,
      "repository_connection_changed",
      "Repository/branch/Team Runtime path changed while Team Runtime was active. Team stopped before reading or dispatching from the new stream."
    );
  }
}

async function stopTeamForSafety(tabId, state, reason, detail) {
  await chrome.storage.local.set({
    [teamStateKey(tabId)]: {
      ...state,
      enabled: false,
      bootstrapPending: false,
      dispatching: false,
      executing: false,
      executionToken: null,
      stopReason: reason,
      lastError: detail
    }
  });
}

function teamStreamKey(repositoryConfig, teamConfig) {
  return [
    repositoryConfig.owner,
    repositoryConfig.repo,
    repositoryConfig.branch || "main",
    teamConfig.path || DEFAULT_TEAM_CONFIG.path
  ].map((part) => String(part || "").trim()).join("/");
}

function tabIdFromChangedKey(key) {
  for (const prefix of [TAB_CONFIG_PREFIX, TAB_RUNTIME_PREFIX, TEAM_CONFIG_PREFIX]) {
    if (!key.startsWith(prefix)) continue;
    const value = Number(key.slice(prefix.length));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}
