import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  buildExecutorPrompt,
  buildGoalSetupPrompt,
  normalizeGoalFile,
  normalizeResultFile,
  tabConfigKey,
  tabRuntimeKey,
  validateConfig
} from "./goal.js";

chrome.runtime.onInstalled.addListener(() => {
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.local.remove([tabConfigKey(tabId), tabRuntimeKey(tabId)]);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }));
  return true;
});

async function handleMessage(message, sender) {
  switch (message?.type) {
    case "REGISTER_CHAT_TAB":
      return { tabId: requireSenderTabId(sender) };
    case "GET_TAB_STATE":
      return getTabState(requireMessageTabId(message));
    case "GET_CURRENT_STATE":
      return getTabState(requireSenderTabId(sender));
    case "BEGIN_GOAL_SETUP":
      return beginGoalSetup(requireMessageTabId(message));
    case "IMPORT_GOAL_FILE":
      return importGoalFile(requireSenderTabId(sender), message.value);
    case "RESUME_GOAL":
      return resumeGoal(requireMessageTabId(message));
    case "PAUSE_GOAL":
      return pauseGoal(resolveTabId(message, sender));
    case "STOP_GOAL":
      return stopGoal(requireMessageTabId(message));
    case "CLAIM_EXECUTION":
      return claimExecution(requireSenderTabId(sender));
    case "ACK_DISPATCH":
      return ackDispatch(requireSenderTabId(sender));
    case "RELEASE_EXECUTION":
      return releaseExecution(requireSenderTabId(sender), message.reason);
    case "REPORT_RESULT_FILE":
      return reportResultFile(requireSenderTabId(sender), message.value);
    case "REPORT_INTERRUPTED":
      return reportInterrupted(requireSenderTabId(sender), message.reason);
    case "SET_APPROVAL_WAIT":
      return setApprovalWait(requireSenderTabId(sender), Boolean(message.waiting));
    case "HANDOFF_NEW_CHAT":
      return handoffToNewChat(requireSenderTabId(sender));
    default:
      throw new Error(`Unknown Rerun V2 message: ${message?.type || "<missing>"}`);
  }
}

async function getTabState(tabId) {
  const keys = [tabConfigKey(tabId), tabRuntimeKey(tabId)];
  const stored = await chrome.storage.local.get(keys);
  return {
    tabId,
    config: { ...DEFAULT_CONFIG, ...(stored[keys[0]] || {}) },
    runtime: { ...DEFAULT_RUNTIME, ...(stored[keys[1]] || {}) }
  };
}

async function beginGoalSetup(tabId) {
  await ensureContentScript(tabId);
  const setupNonce = crypto.randomUUID();
  const runtime = {
    ...DEFAULT_RUNTIME,
    status: "goal_setup",
    phase: "awaiting_goal_file",
    setupNonce,
    setupPending: true
  };
  await chrome.storage.local.set({
    [tabConfigKey(tabId)]: { ...DEFAULT_CONFIG },
    [tabRuntimeKey(tabId)]: runtime
  });

  const response = await chrome.tabs.sendMessage(tabId, {
    type: "RERUN_V2_SEND_DIRECT",
    prompt: buildGoalSetupPrompt(setupNonce)
  });
  if (!response?.sent) {
    const detail = response?.error || "Could not send the goal-setup prompt.";
    await chrome.storage.local.set({
      [tabRuntimeKey(tabId)]: { ...runtime, status: "paused", phase: "paused", setupPending: false, lastError: detail }
    });
    throw new Error(detail);
  }
  return { runtime };
}

async function importGoalFile(tabId, rawValue) {
  const { runtime } = await getTabState(tabId);
  if (!runtime.setupPending || runtime.phase !== "awaiting_goal_file" || !runtime.setupNonce) {
    throw new Error("No active goal-setup request exists in this tab.");
  }

  const contract = normalizeGoalFile(rawValue, runtime.setupNonce);
  const conflict = await findConflictingRun(tabId, contract.config);
  if (conflict !== null) {
    throw new Error(`The same repository/branch Goal Runner is already active in tab ${conflict}.`);
  }

  const runId = crypto.randomUUID();
  const nextRuntime = {
    ...DEFAULT_RUNTIME,
    enabled: true,
    status: "running",
    phase: "ready",
    runId,
    goalId: contract.goalId,
    frozenPrompt: buildExecutorPrompt(contract.config, { runId, goalId: contract.goalId })
  };
  await chrome.storage.local.set({
    [tabConfigKey(tabId)]: contract.config,
    [tabRuntimeKey(tabId)]: nextRuntime
  });
  await wakeTab(tabId);
  return { config: contract.config, runtime: nextRuntime };
}

async function resumeGoal(tabId) {
  await ensureContentScript(tabId);
  const { config, runtime } = await getTabState(tabId);
  validateConfig(config);
  if (!runtime.runId || !runtime.goalId || !runtime.frozenPrompt) {
    throw new Error("No paused Goal Runner exists in this tab.");
  }
  const conflict = await findConflictingRun(tabId, config);
  if (conflict !== null) {
    throw new Error(`The same repository/branch Goal Runner is already active in tab ${conflict}.`);
  }
  const next = {
    ...runtime,
    enabled: true,
    status: "running",
    phase: runtime.phase === "generating" ? "generating" : "ready",
    lastError: null,
    waitingApproval: false
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  await wakeTab(tabId);
  return { runtime: next };
}

async function pauseGoal(tabId) {
  const { runtime } = await getTabState(tabId);
  const next = {
    ...runtime,
    enabled: false,
    status: "paused",
    phase: runtime.phase === "generating" ? "generating" : "paused",
    waitingApproval: false
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { runtime: next };
}

async function stopGoal(tabId) {
  const { runtime } = await getTabState(tabId);
  const next = {
    ...runtime,
    enabled: false,
    status: "stopped",
    phase: "idle",
    setupPending: false,
    waitingApproval: false,
    handoffPending: false,
    lastError: null
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { runtime: next };
}

async function claimExecution(tabId) {
  const { config, runtime } = await getTabState(tabId);
  if (!runtime.enabled || runtime.status !== "running" || runtime.phase !== "ready") {
    return { claimed: false, reason: "not_ready" };
  }
  validateConfig(config);
  if (!runtime.frozenPrompt || !runtime.goalId) throw new Error("Goal executor prompt is unavailable.");
  const next = {
    ...runtime,
    phase: "dispatching",
    dispatchClaimedAt: new Date().toISOString(),
    lastError: null
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { claimed: true, prompt: runtime.frozenPrompt, goalId: runtime.goalId };
}

async function ackDispatch(tabId) {
  const { runtime } = await getTabState(tabId);
  if (!runtime.enabled || runtime.phase !== "dispatching") return { acknowledged: false };
  const next = {
    ...runtime,
    phase: "generating",
    iteration: Number(runtime.iteration || 0) + 1,
    lastSentAt: new Date().toISOString(),
    dispatchClaimedAt: null,
    waitingApproval: false
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { acknowledged: true, runtime: next };
}

async function releaseExecution(tabId, reason) {
  const { runtime } = await getTabState(tabId);
  const next = {
    ...runtime,
    phase: runtime.enabled ? "ready" : "paused",
    dispatchClaimedAt: null,
    lastError: String(reason || "dispatch_failed")
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { released: true, runtime: next };
}

async function reportResultFile(tabId, rawValue) {
  const { runtime } = await getTabState(tabId);
  if (!runtime.runId || !runtime.goalId) throw new Error("No active Goal Runner exists.");
  const result = normalizeResultFile(rawValue, runtime.goalId);
  if (result.resultId === runtime.lastResultId) return { ignored: true, runtime };

  const common = {
    ...runtime,
    lastCheckpoint: result.checkpoint,
    lastResult: result.status,
    lastResultId: result.resultId,
    lastError: null,
    waitingApproval: false,
    dispatchClaimedAt: null
  };

  let next;
  if (result.status === "CONTINUE") {
    next = runtime.enabled && runtime.status !== "paused"
      ? { ...common, enabled: true, status: "running", phase: "ready" }
      : { ...common, enabled: false, status: "paused", phase: "paused" };
  } else if (result.status === "COMPLETE") {
    next = { ...common, enabled: false, status: "complete", phase: "complete" };
  } else if (result.status === "NEEDS_USER") {
    next = { ...common, enabled: false, status: "needs_user", phase: "paused" };
  } else {
    next = { ...common, enabled: false, status: "conflict", phase: "paused" };
  }

  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  if (next.enabled && next.phase === "ready") await wakeTab(tabId);
  return { runtime: next };
}

async function reportInterrupted(tabId, reason) {
  const { runtime } = await getTabState(tabId);
  const next = {
    ...runtime,
    phase: runtime.enabled ? "ready" : "paused",
    status: runtime.enabled ? "running" : runtime.status,
    waitingApproval: false,
    dispatchClaimedAt: null,
    lastError: String(reason || "interrupted")
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  if (next.enabled) await wakeTab(tabId);
  return { runtime: next };
}

async function setApprovalWait(tabId, waiting) {
  const { runtime } = await getTabState(tabId);
  if (runtime.waitingApproval === waiting) return { runtime };
  const next = { ...runtime, waitingApproval: waiting };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { runtime: next };
}

async function handoffToNewChat(oldTabId) {
  const { config, runtime } = await getTabState(oldTabId);
  if (!runtime.enabled || runtime.handoffPending) return { handedOff: false, reason: "not_active" };

  await chrome.storage.local.set({
    [tabRuntimeKey(oldTabId)]: { ...runtime, handoffPending: true }
  });

  let transferred = false;
  try {
    const newTab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: true });
    if (!Number.isSafeInteger(newTab.id)) throw new Error("Failed to create a new ChatGPT tab.");
    await waitForTabComplete(newTab.id, 20_000);
    await ensureContentScript(newTab.id);

    const newRuntime = {
      ...runtime,
      enabled: true,
      status: "running",
      phase: "ready",
      waitingApproval: false,
      handoffPending: false,
      handoffFromTabId: oldTabId,
      handoffToTabId: null,
      dispatchClaimedAt: null,
      lastError: null
    };
    await chrome.storage.local.set({
      [tabConfigKey(newTab.id)]: config,
      [tabRuntimeKey(newTab.id)]: newRuntime,
      [tabRuntimeKey(oldTabId)]: {
        ...runtime,
        enabled: false,
        status: "handed_off",
        phase: "idle",
        handoffPending: false,
        handoffToTabId: newTab.id
      }
    });
    transferred = true;
    await wakeTab(newTab.id);
    return { handedOff: true, newTabId: newTab.id };
  } finally {
    if (!transferred) {
      const { runtime: latest } = await getTabState(oldTabId);
      await chrome.storage.local.set({
        [tabRuntimeKey(oldTabId)]: { ...latest, handoffPending: false }
      });
    }
  }
}

async function findConflictingRun(tabId, config) {
  const all = await chrome.storage.local.get(null);
  for (const [key, runtime] of Object.entries(all)) {
    const match = key.match(/^v2:runtime:(\d+)$/);
    if (!match || !runtime?.enabled) continue;
    const otherTabId = Number(match[1]);
    if (otherTabId === tabId) continue;
    const otherConfig = { ...DEFAULT_CONFIG, ...(all[tabConfigKey(otherTabId)] || {}) };
    if (otherConfig.repository === config.repository && otherConfig.branch === config.branch) return otherTabId;
  }
  return null;
}

async function ensureContentScript(tabId) {
  try {
    const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_V2_PING" });
    if (ping?.ready) return;
  } catch {
    // Inject below.
  }
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
  const ping = await chrome.tabs.sendMessage(tabId, { type: "RERUN_V2_PING" });
  if (!ping?.ready) throw new Error("Rerun V2 content script did not initialize.");
}

async function wakeTab(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "RERUN_V2_WAKE" });
  } catch {
    await ensureContentScript(tabId);
    await chrome.tabs.sendMessage(tabId, { type: "RERUN_V2_WAKE" });
  }
}

async function waitForTabComplete(tabId, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === "complete") return;
    await sleep(150);
  }
  throw new Error("New ChatGPT tab did not finish loading in time.");
}

function requireSenderTabId(sender) {
  const tabId = sender?.tab?.id;
  if (!Number.isSafeInteger(tabId)) throw new Error("Message must come from a ChatGPT tab.");
  return tabId;
}

function requireMessageTabId(message) {
  const tabId = Number(message?.tabId);
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error("A valid tabId is required.");
  return tabId;
}

function resolveTabId(message, sender) {
  const explicit = Number(message?.tabId);
  if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
  return requireSenderTabId(sender);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
