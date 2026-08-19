import { DEFAULT_RUNTIME, tabConfigKey, tabRuntimeKey } from "../../control.js";
import { DEFAULT_TEAM_STATE, teamStateKey } from "../../team-control.js";
import {
  DEFAULT_ORACLE_CONFIG,
  DEFAULT_ORACLE_STATE,
  oracleConfigKey,
  oracleStateKey,
  oracleStreamKey
} from "./oracle-control.js";

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const tabIds = new Set();
  for (const key of Object.keys(changes)) {
    const tabId = tabIdFromKnownKey(key);
    if (tabId !== null) tabIds.add(tabId);
  }
  for (const tabId of tabIds) void enforceOracleSafety(tabId);
});

export async function assertOracleStartIsSafe(tabId, repositoryConfig, oracleConfig) {
  const all = await chrome.storage.local.get(null);
  const single = { ...DEFAULT_RUNTIME, ...(all[tabRuntimeKey(tabId)] || {}) };
  if (single.enabled) throw new Error("Single Rerun watcher is active. Stop it before starting Patient Oracle.");

  const team = { ...DEFAULT_TEAM_STATE, ...(all[teamStateKey(tabId)] || {}) };
  if (team.enabled) throw new Error("Voyage Team is active. Stop it before starting Patient Oracle.");

  const wanted = oracleStreamKey(repositoryConfig, oracleConfig);
  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith("patientOracleState:") || !value?.enabled) continue;
    const otherTabId = Number(key.slice("patientOracleState:".length));
    if (!Number.isSafeInteger(otherTabId) || otherTabId === tabId) continue;
    const otherRepo = all[tabConfigKey(otherTabId)] || {};
    const otherConfig = { ...DEFAULT_ORACLE_CONFIG, ...(all[oracleConfigKey(otherTabId)] || {}) };
    if (oracleStreamKey(otherRepo, otherConfig) === wanted) {
      throw new Error(`Patient Oracle stream is already owned by tab ${otherTabId}`);
    }
  }
}

async function enforceOracleSafety(tabId) {
  const keys = [
    tabConfigKey(tabId),
    tabRuntimeKey(tabId),
    teamStateKey(tabId),
    oracleConfigKey(tabId),
    oracleStateKey(tabId)
  ];
  const stored = await chrome.storage.local.get(keys);
  const oracle = { ...DEFAULT_ORACLE_STATE, ...(stored[oracleStateKey(tabId)] || {}) };
  if (!oracle.enabled) return;

  const single = { ...DEFAULT_RUNTIME, ...(stored[tabRuntimeKey(tabId)] || {}) };
  if (single.enabled) {
    await stopOracleForSafety(tabId, oracle, "single_watcher_started", "Single Rerun became active while Patient Oracle was running.");
    return;
  }

  const team = { ...DEFAULT_TEAM_STATE, ...(stored[teamStateKey(tabId)] || {}) };
  if (team.enabled) {
    await stopOracleForSafety(tabId, oracle, "team_runtime_started", "Voyage Team became active while Patient Oracle was running.");
    return;
  }

  const repositoryConfig = stored[tabConfigKey(tabId)] || {};
  const oracleConfig = { ...DEFAULT_ORACLE_CONFIG, ...(stored[oracleConfigKey(tabId)] || {}) };
  const currentStreamKey = oracleStreamKey(repositoryConfig, oracleConfig);
  if (oracle.streamKey && oracle.streamKey !== currentStreamKey) {
    await stopOracleForSafety(
      tabId,
      oracle,
      "repository_connection_changed",
      "Repository/branch/Patient Oracle runtime path changed while active. Oracle stopped before dispatching against the new stream."
    );
  }
}

async function stopOracleForSafety(tabId, state, reason, detail) {
  await chrome.storage.local.set({
    [oracleStateKey(tabId)]: {
      ...state,
      enabled: false,
      dispatching: false,
      executing: false,
      executionToken: null,
      stopReason: reason,
      lastError: detail
    }
  });
}

function tabIdFromKnownKey(key) {
  for (const prefix of ["tabConfig:", "tabRuntime:", "teamState:", "patientOracleConfig:", "patientOracleState:"]) {
    if (!key.startsWith(prefix)) continue;
    const value = Number(key.slice(prefix.length));
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  return null;
}
