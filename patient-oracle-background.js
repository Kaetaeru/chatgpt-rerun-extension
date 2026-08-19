import { DEFAULT_CONFIG, tabConfigKey } from "./control.js";
import {
  DEFAULT_ORACLE_CONFIG,
  DEFAULT_ORACLE_STATE,
  ORACLE_CONTRACT_PATH,
  createExecutionBudget,
  normalizeMaxRedispatches,
  oracleConfigKey,
  oracleStateKey,
  oracleStreamKey
} from "./utilities/patient-oracle/oracle-control.js";
import {
  installPatientOracleRuntime,
  startOracle,
  stopOracle
} from "./utilities/patient-oracle/oracle-background.js";
import { assertOracleStartIsSafe } from "./utilities/patient-oracle/oracle-safety.js";

const ORACLE_PANEL_PORT = "patient-oracle-panel";

installPatientOracleRuntime({ loadRepositoryConfig });

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== ORACLE_PANEL_PORT) return;
  port.onMessage.addListener((message) => {
    const requestId = String(message?.requestId || "");
    handlePanelMessage(message)
      .then((result) => port.postMessage({ requestId, ok: true, ...result }))
      .catch((error) => port.postMessage({
        requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      }));
  });
});

async function handlePanelMessage(message) {
  const tabId = normalizeTabId(message?.tabId);
  if (tabId === null) throw new Error("A valid ChatGPT tabId is required");

  switch (message?.type) {
    case "PATIENT_ORACLE_START":
      return startFromPanel(tabId, message);
    case "PATIENT_ORACLE_STOP":
      return stopOracle(tabId, "manual");
    case "PATIENT_ORACLE_STATUS":
      return {
        config: await loadOracleConfig(tabId),
        state: await loadOracleState(tabId),
        repository: await loadRepositoryConfig(tabId)
      };
    default:
      throw new Error(`Unsupported Patient Oracle panel message: ${String(message?.type || "")}`);
  }
}

async function startFromPanel(tabId, message) {
  const tab = await chrome.tabs.get(tabId);
  if (!isChatGptUrl(tab.url || "")) {
    throw new Error("Patient Oracle can only start from a ChatGPT tab.");
  }

  const repositoryConfig = await loadRepositoryConfig(tabId);
  if (!String(repositoryConfig.owner || "").trim() || !String(repositoryConfig.repo || "").trim()) {
    throw new Error("Connect a GitHub Owner and Repository before starting Patient Oracle.");
  }

  const oracleConfig = normalizeOracleConfig({
    ...await loadOracleConfig(tabId),
    path: message?.path,
    pollIntervalSeconds: message?.pollIntervalSeconds,
    maxRedispatchesPerRequest: message?.maxRedispatchesPerRequest
  });

  await assertOracleStartIsSafe(tabId, repositoryConfig, oracleConfig);

  try {
    return await startOracle(tabId, repositoryConfig, oracleConfig);
  } catch (error) {
    if (isPatientOracleRateLimitPause(error)) {
      return {
        action: "wait",
        reason: "rate_limit",
        retryAt: new Date(error.untilMs).toISOString()
      };
    }
    if (isMissingRuntimeError(error)) {
      await stopOracle(tabId, "bootstrap_prepare");
      return bootstrapOracle(tabId, repositoryConfig, oracleConfig);
    }

    await stopOracle(tabId, "start_failed");
    await updateOracleState(tabId, {
      lastError: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

async function bootstrapOracle(tabId, repositoryConfig, oracleConfig) {
  await assertOracleStartIsSafe(tabId, repositoryConfig, oracleConfig);
  const budget = createExecutionBudget();
  const executionToken = `oracle-bootstrap:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  const streamKey = oracleStreamKey(repositoryConfig, oracleConfig);
  const prompt = buildBootstrapPrompt(repositoryConfig, oracleConfig, budget);

  await chrome.storage.local.set({
    [oracleConfigKey(tabId)]: oracleConfig,
    [oracleStateKey(tabId)]: {
      ...DEFAULT_ORACLE_STATE,
      enabled: true,
      streamKey,
      dispatching: true,
      executionToken,
      executionStartedAt: budget.startedAt,
      checkpointAt: budget.checkpointAt,
      executionHardStopAt: budget.hardStopAt,
      lastStatus: "bootstrapping",
      lastDispatchAt: new Date().toISOString()
    }
  });

  try {
    await ensureOracleContentScript(tabId);
    const response = await chrome.tabs.sendMessage(tabId, {
      type: "PATIENT_ORACLE_PROMPT",
      prompt,
      executionToken,
      checkpointAt: budget.checkpointAt,
      hardStopAt: budget.hardStopAt
    });
    if (!response?.sent) throw new Error(response?.error || "Patient Oracle bootstrap prompt send failed");
  } catch (error) {
    await updateOracleState(tabId, {
      enabled: false,
      dispatching: false,
      executing: false,
      executionToken: null,
      stopReason: "bootstrap_send_failed",
      lastError: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }

  await updateOracleState(tabId, {
    dispatching: false,
    executing: true
  });

  return { action: "bootstrapping", executionToken };
}

function buildBootstrapPrompt(repositoryConfig, oracleConfig, budget) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const runtimePath = oracleConfig.path;

  return [
    "Initialize the Patient Oracle protocol in the connected GitHub repository.",
    `Target repository: ${owner}/${repo}, branch ${branch}.`,
    `Create ${ORACLE_CONTRACT_PATH} and ${runtimePath}. Do not create a fake user request.`,
    "The contract must state that GitHub is the only durable source of truth; requests live under .patient-oracle/requests/<request_id>.json; responses live under .patient-oracle/responses/<request_id>.json; runtime.json is the final authoritative handoff write; revision is monotonic; only a newer ready revision dispatches; terminal statuses are complete, needs_user, and blocked; assistant DOM text is never the durable response channel.",
    "Preserve all Rerun safety invariants: one owner per stream, no revision regression, no duplicate revision dispatch, execution-token matching, bounded redispatch, protect non-empty user composer text, require visible submission evidence, never auto-click GitHub approval/OAuth/admin controls, pause on GitHub rate limits, use DOM completion only as a wake signal, keep polling as recovery, stop on repository-coordinate changes, and never run concurrently with Single Rerun or Voyage Team.",
    "The contract must include the 20-minute execution law: checkpoint around minute 18, begin no new long work after the checkpoint, persist exact resumable state, never claim incomplete work complete, publish a higher ready revision for the same request when continuation is required, and end before 20 minutes.",
    `Initialize ${runtimePath} last as strict JSON with exactly version, run_id, revision, status, reason, updated_at. Use version 1, a new non-empty run_id, revision 0, status complete, reason \"initialized; waiting for caller request\", and a current ISO-8601 updated_at.`,
    "Verify both GitHub writes. Do not invent successful writes or repository state.",
    `This bootstrap turn started at ${budget.startedAt}; checkpoint at ${budget.checkpointAt}; hard stop before ${budget.hardStopAt}.`,
    "If GitHub requires manual approval, wait. Never click or bypass the approval yourself."
  ].join(" ");
}

async function loadRepositoryConfig(tabId) {
  const key = tabConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_CONFIG, ...(stored[key] || {}) };
}

async function loadOracleConfig(tabId) {
  const key = oracleConfigKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return normalizeOracleConfig({ ...DEFAULT_ORACLE_CONFIG, ...(stored[key] || {}) });
}

async function loadOracleState(tabId) {
  const key = oracleStateKey(tabId);
  const stored = await chrome.storage.local.get(key);
  return { ...DEFAULT_ORACLE_STATE, ...(stored[key] || {}) };
}

async function updateOracleState(tabId, patch) {
  const key = oracleStateKey(tabId);
  const next = { ...await loadOracleState(tabId), ...patch };
  await chrome.storage.local.set({ [key]: next });
  return next;
}

function normalizeOracleConfig(value) {
  const path = String(value?.path || DEFAULT_ORACLE_CONFIG.path).replace(/^\/+/, "").trim() || DEFAULT_ORACLE_CONFIG.path;
  const poll = Number(value?.pollIntervalSeconds);
  return {
    path,
    pollIntervalSeconds: Number.isFinite(poll) ? Math.max(5, Math.floor(poll)) : DEFAULT_ORACLE_CONFIG.pollIntervalSeconds,
    maxRedispatchesPerRequest: normalizeMaxRedispatches(value?.maxRedispatchesPerRequest)
  };
}

async function ensureOracleContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "PATIENT_ORACLE_PING" });
    if (ping?.ready) return;
  } catch {}

  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["utilities/patient-oracle/oracle-content.js"]
  });
  const ping = await chrome.tabs.sendMessage(tabId, { type: "PATIENT_ORACLE_PING" });
  if (!ping?.ready) throw new Error("Patient Oracle content script injection failed");
}

function isMissingRuntimeError(error) {
  return /HTTP 404|runtime.*not found|not found/i.test(String(error?.message || error || ""));
}

function isPatientOracleRateLimitPause(error) {
  return error?.name === "PatientOracleRateLimitPause" && Number.isFinite(error?.untilMs);
}

function normalizeTabId(tabId) {
  const value = Number(tabId);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function isChatGptUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "chatgpt.com" || parsed.hostname === "chat.openai.com";
  } catch {
    return false;
  }
}
