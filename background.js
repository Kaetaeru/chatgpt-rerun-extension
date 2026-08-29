import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  buildExecutorPrompt,
  normalizeConfig,
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
    case "SAVE_CONFIG":
      return saveConfig(requireMessageTabId(message), message.config);
    case "START_GOAL":
      return startGoal(requireMessageTabId(message));
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
    case "REPORT_RESULT":
      return reportResult(requireSenderTabId(sender), message.result);
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

async function saveConfig(tabId, rawConfig) {
  const config = normalizeConfig(rawConfig);
  await chrome.storage.local.set({ [tabConfigKey(tabId)]: config });
  return { config };
}

async function startGoal(tabId) {
  await ensureContentScript(tabId);
  const { config } = await getTabState(tabId);
  validateConfig(config);
  const conflict = await findConflictingRun(tabId, config);
  if (conflict !== null) {
    throw new Error(`The same repository/branch Goal Runner is already active in tab ${conflict}.`);
  }

  const runtime = {
    ...DEFAULT_RUNTIME,
    enabled: true,
    status: "running",
    phase: "ready",
    runId: crypto.randomUUID()
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: runtime });
  await wakeTab(tabId);
  return { runtime };
}

async function resumeGoal(tabId) {
  await ensureContentScript(tabId);
  const { config, runtime } = await getTabState(tabId);
  validateConfig(config);
  const conflict = await findConflictingRun(tabId, config);
  if (conflict !== null) {
    throw new Error(`The same repository/branch Goal Runner is already active in tab ${conflict}.`);
  }
  if (!runtime.runId) throw new Error("No paused Goal Runner exists in this tab.");

  const next = {
    ...runtime,
    enabled: true,
    status: "running",
    phase: "ready",
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

  const next = {
    ...runtime,
    phase: "dispatching",
    dispatchClaimedAt: new Date().toISOString(),
    lastError: null
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return {
    claimed: true,
    prompt: buildExecutorPrompt(config, runtime)
  };
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

async function reportResult(tabId, rawResult) {
  const { runtime } = await getTabState(tabId);
  const resultRunId = String(rawResult?.runId || "");
  const resultExecution = Number(rawResult?.execution);
  const status = String(rawResult?.status || "").toUpperCase();
  const checkpoint = String(rawResult?.checkpoint || "").trim();
  if (resultRunId !== runtime.runId || resultExecution !== Number(runtime.iteration)) {
    throw new Error("Stale RERUN_RESULT does not match the active run/execution.");
  }
  if (!checkpoint) throw new Error("RERUN_RESULT checkpoint is required.");
  if (!["CONTINUE", "COMPLETE", "NEEDS_USER", "CONFLICT"].includes(status)) {
    throw new Error(`Unsupported RERUN_RESULT status: ${status || "<missing>"}`);
  }

  const common = {
    ...runtime,
    lastCheckpoint: checkpoint,
    lastResult: status,
    lastError: null,
    waitingApproval: false,
    dispatchClaimedAt: null
  };

  let next;
  if (status === "CONTINUE") {
    next = runtime.enabled && runtime.status !== "paused"
      ? { ...common, enabled: true, status: "running", phase: "ready" }
      : { ...common, enabled: false, status: "paused", phase: "paused" };
  } else if (status === "COMPLETE") {
    next = { ...common, enabled: false, status: "complete", phase: "complete" };
  } else if (status === "NEEDS_USER") {
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
  if (!runtime.enabled || runtime.handoffPending) {
    return { handedOff: false, reason: "not_active" };
  }

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
    const otherConfig = normalizeConfig(all[tabConfigKey(otherTabId)] || {});
    if (otherConfig.repository === config.repository && otherConfig.branch === config.branch) {
      return otherTabId;
    }
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
