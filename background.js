import {
  DEFAULT_CONFIG,
  DEFAULT_RUNTIME,
  buildExecutorPrompt,
  buildFreshChatResumePrompt,
  buildGoalSetupPrompt,
  buildWorkerPreflightPrompt,
  normalizeGoalFile,
  normalizeResultFile,
  normalizeWorkerReadyFile,
  poolStateKey,
  tabConfigKey,
  tabRuntimeKey,
  validateConfig
} from "./goal.js";

const MAX_GENERATED_JSON_BYTES = 1024 * 1024;
const MAX_WORKER_COUNT = 20;
const POOL_TERMINAL_STATUSES = new Set(["complete", "stopped"]);
const STANDBY_PARK_DELAY_MS = 500;
const CHATGPT_WORKER_HOSTS = new Set(["chatgpt.com", "chat.openai.com"]);

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
    case "GET_POOL_STATE":
      return getPoolState(requireRunId(message));
    case "BEGIN_GOAL_SETUP":
      return beginGoalSetup(requireMessageTabId(message));
    case "IMPORT_GOAL_FILE":
      return importGoalFile(requireSenderTabId(sender), message.value);
    case "CREATE_WORKER_POOL":
      return createWorkerPool(requireRunId(message), message.workerCount);
    case "REPORT_WORKER_READY":
      return reportWorkerReady(requireSenderTabId(sender), message.value);
    case "FETCH_JSON_URL":
      requireSenderTabId(sender);
      return fetchGeneratedJsonUrl(message.url);
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
      return handoffToNewChat(requireSenderTabId(sender), message.reason);
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

async function getPoolState(runId) {
  const key = poolStateKey(runId);
  const stored = await chrome.storage.local.get(key);
  const pool = stored[key] || null;
  if (!pool) throw new Error("Worker pool does not exist.");
  return { pool };
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
    throw new Error(`The same repository/branch Goal Runner is already active in ${conflict}.`);
  }

  const runId = crypto.randomUUID();
  const frozenPrompt = buildExecutorPrompt(contract.config, { runId, goalId: contract.goalId });
  const nextRuntime = {
    ...DEFAULT_RUNTIME,
    enabled: false,
    status: "pool_setup",
    phase: "awaiting_worker_count",
    runId,
    goalId: contract.goalId,
    frozenPrompt,
    poolRunId: runId
  };
  const pool = {
    runId,
    goalId: contract.goalId,
    sourceTabId: tabId,
    allocationTabId: null,
    status: "awaiting_worker_count",
    workerCount: 0,
    activeWorkerIndex: null,
    workers: [],
    config: contract.config,
    frozenPrompt,
    iteration: 0,
    lastCheckpoint: "",
    lastResult: null,
    lastResultId: null,
    processedResultIds: [],
    lastError: null
  };

  await chrome.storage.local.set({
    [tabConfigKey(tabId)]: contract.config,
    [tabRuntimeKey(tabId)]: nextRuntime,
    [poolStateKey(runId)]: pool
  });

  const allocationTab = await chrome.tabs.create({
    url: chrome.runtime.getURL(`pool-setup.html?runId=${encodeURIComponent(runId)}`),
    active: true
  });
  if (Number.isSafeInteger(allocationTab.id)) {
    pool.allocationTabId = allocationTab.id;
    await chrome.storage.local.set({ [poolStateKey(runId)]: pool });
  }

  return { config: contract.config, runtime: nextRuntime, pool };
}

async function createWorkerPool(runId, rawWorkerCount) {
  const workerCount = Number(rawWorkerCount);
  if (!Number.isInteger(workerCount) || workerCount < 1 || workerCount > MAX_WORKER_COUNT) {
    throw new Error(`Worker count must be an integer from 1 to ${MAX_WORKER_COUNT}.`);
  }

  const { pool: storedPool } = await getPoolState(runId);
  if (storedPool.status !== "awaiting_worker_count") {
    if (storedPool.workerCount === workerCount && storedPool.workers.length) return { pool: storedPool };
    throw new Error("This worker pool has already been configured.");
  }

  let pool = {
    ...storedPool,
    status: "provisioning",
    workerCount,
    workers: [],
    activeWorkerIndex: null,
    lastError: null
  };
  await chrome.storage.local.set({ [poolStateKey(runId)]: pool });

  try {
    for (let workerIndex = 0; workerIndex < workerCount; workerIndex += 1) {
      const workerTab = await chrome.tabs.create({ url: "https://chatgpt.com/", active: false });
      if (!Number.isSafeInteger(workerTab.id)) throw new Error("Failed to create a ChatGPT worker tab.");
      await waitForTabComplete(workerTab.id, 20_000);
      await ensureContentScript(workerTab.id);

      const workerNonce = crypto.randomUUID();
      const workerRuntime = {
        ...DEFAULT_RUNTIME,
        enabled: false,
        status: "worker_setup",
        phase: "worker_preflight",
        runId: pool.runId,
        goalId: pool.goalId,
        frozenPrompt: pool.frozenPrompt,
        poolRunId: pool.runId,
        workerIndex,
        workerCount,
        workerNonce,
        workerReady: false
      };
      const worker = {
        index: workerIndex,
        tabId: workerTab.id,
        nonce: workerNonce,
        status: "preflight",
        conversationUrl: null
      };
      pool = { ...pool, workers: [...pool.workers, worker] };
      await chrome.storage.local.set({
        [tabConfigKey(workerTab.id)]: pool.config,
        [tabRuntimeKey(workerTab.id)]: workerRuntime,
        [poolStateKey(runId)]: pool
      });
    }

    pool = { ...pool, status: "awaiting_worker_ready" };
    await chrome.storage.local.set({ [poolStateKey(runId)]: pool });

    for (const worker of pool.workers) {
      const { runtime } = await getTabState(worker.tabId);
      const response = await chrome.tabs.sendMessage(worker.tabId, {
        type: "RERUN_V2_SEND_DIRECT",
        prompt: buildWorkerPreflightPrompt(pool.config, runtime)
      });
      if (!response?.sent) {
        throw new Error(response?.error || `Could not send GitHub preflight to worker ${worker.index + 1}.`);
      }
    }

    if (pool.workers[0]) await focusTab(pool.workers[0].tabId);
    return { pool };
  } catch (error) {
    pool = {
      ...pool,
      status: "needs_user",
      lastError: error instanceof Error ? error.message : String(error)
    };
    await chrome.storage.local.set({ [poolStateKey(runId)]: pool });
    throw error;
  }
}

async function reportWorkerReady(tabId, rawValue) {
  const { config, runtime } = await getTabState(tabId);
  if (runtime.phase !== "worker_preflight" || !runtime.poolRunId || !runtime.workerNonce || !Number.isInteger(runtime.workerIndex)) {
    throw new Error("This tab is not waiting for worker preflight.");
  }

  normalizeWorkerReadyFile(rawValue, {
    runId: runtime.poolRunId,
    goalId: runtime.goalId,
    workerIndex: runtime.workerIndex,
    workerNonce: runtime.workerNonce,
    repository: config.repository,
    branch: config.branch
  });

  const { pool: storedPool } = await getPoolState(runtime.poolRunId);
  if (storedPool.status !== "awaiting_worker_ready") {
    throw new Error("Worker pool is not ready to accept preflight reports yet.");
  }
  const worker = storedPool.workers.find((item) => item.index === runtime.workerIndex);
  if (!worker || worker.tabId !== tabId) throw new Error("Worker-ready file came from the wrong tab.");

  const conversationUrl = await captureWorkerConversationUrl(tabId);
  const poolWithConversation = {
    ...storedPool,
    workers: storedPool.workers.map((item) => item.index === runtime.workerIndex
      ? { ...item, conversationUrl: conversationUrl || item.conversationUrl || null }
      : item)
  };

  const readyRuntime = {
    ...runtime,
    enabled: false,
    status: "standby",
    phase: "standby",
    workerReady: true,
    waitingApproval: false,
    lastError: null
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: readyRuntime });

  let pool = await rebuildWorkerReadiness(poolWithConversation);
  await chrome.storage.local.set({ [poolStateKey(pool.runId)]: pool });

  const nextUnready = pool.workers.find((item) => item.status === "preflight");
  if (nextUnready) {
    await focusTab(nextUnready.tabId);
    return { runtime: readyRuntime, pool };
  }

  pool = { ...pool, status: "running", activeWorkerIndex: 0 };
  await chrome.storage.local.set({ [poolStateKey(pool.runId)]: pool });
  const activated = await activatePoolWorker(pool, 0, false);
  setTimeout(() => { void parkStandbyWorkerTabs(activated.pool.runId, 0); }, STANDBY_PARK_DELAY_MS);
  return { runtime: activated.runtime, pool: activated.pool };
}

async function rebuildWorkerReadiness(pool) {
  const liveWorkers = pool.workers.filter((worker) => Number.isSafeInteger(worker.tabId));
  const keys = liveWorkers.map((worker) => tabRuntimeKey(worker.tabId));
  const stored = keys.length ? await chrome.storage.local.get(keys) : {};
  const workers = pool.workers.map((worker) => {
    if (!Number.isSafeInteger(worker.tabId)) return worker;
    const runtime = stored[tabRuntimeKey(worker.tabId)] || {};
    if (runtime.workerReady && worker.status === "preflight") return { ...worker, status: "ready" };
    return worker;
  });
  return { ...pool, workers, lastError: null };
}

async function parkStandbyWorkerTabs(runId, activeWorkerIndex) {
  const { pool } = await getPoolState(runId);
  if (pool.status !== "running") return { pool, closedTabIds: [] };

  const closedTabIds = [];
  const replacements = new Map();
  for (const worker of pool.workers) {
    if (worker.index === activeWorkerIndex || worker.status !== "ready" || !Number.isSafeInteger(worker.tabId)) continue;
    const conversationUrl = normalizeWorkerConversationUrl(worker.conversationUrl) || await captureWorkerConversationUrl(worker.tabId);
    if (!conversationUrl) continue;
    replacements.set(worker.index, {
      ...worker,
      tabId: null,
      conversationUrl,
      parkedAt: new Date().toISOString()
    });
    closedTabIds.push(worker.tabId);
  }

  if (!replacements.size) return { pool, closedTabIds: [] };
  const nextPool = {
    ...pool,
    workers: pool.workers.map((worker) => replacements.get(worker.index) || worker)
  };
  await chrome.storage.local.set({ [poolStateKey(runId)]: nextPool });

  for (const tabId of closedTabIds) {
    try { await chrome.tabs.remove(tabId); } catch {}
  }
  return { pool: nextPool, closedTabIds };
}

async function prepareReadyWorkerTab(pool, worker) {
  const conversationUrl = normalizeWorkerConversationUrl(worker.conversationUrl);
  if (conversationUrl) {
    const previousTabId = Number.isSafeInteger(worker.tabId) ? worker.tabId : null;
    const newTab = await chrome.tabs.create({ url: conversationUrl, active: false });
    if (!Number.isSafeInteger(newTab.id)) throw new Error(`Failed to reopen Worker ${worker.index + 1} conversation.`);
    await waitForTabComplete(newTab.id, 20_000);
    await ensureContentScript(newTab.id);

    const standbyRuntime = buildStandbyWorkerRuntime(pool, worker);
    const nextPool = {
      ...pool,
      workers: pool.workers.map((item) => item.index === worker.index
        ? { ...item, tabId: newTab.id, conversationUrl, reopenedAt: new Date().toISOString() }
        : item)
    };
    await chrome.storage.local.set({
      [tabConfigKey(newTab.id)]: pool.config,
      [tabRuntimeKey(newTab.id)]: standbyRuntime,
      [poolStateKey(pool.runId)]: nextPool
    });

    if (previousTabId !== null && previousTabId !== newTab.id) {
      try { await chrome.tabs.remove(previousTabId); } catch {}
    }
    return { tabId: newTab.id, runtime: standbyRuntime, pool: nextPool };
  }

  if (Number.isSafeInteger(worker.tabId)) {
    try {
      await focusTab(worker.tabId);
      await waitForTabComplete(worker.tabId, 20_000);
      await ensureContentScript(worker.tabId);
      const { runtime } = await getTabState(worker.tabId);
      if (runtime.workerReady) return { tabId: worker.tabId, runtime, pool };
    } catch {}
  }

  throw new Error(`Worker ${worker.index + 1} approved conversation URL is unavailable. Re-run worker preflight.`);
}

function buildStandbyWorkerRuntime(pool, worker) {
  return {
    ...DEFAULT_RUNTIME,
    enabled: false,
    status: "standby",
    phase: "standby",
    runId: pool.runId,
    goalId: pool.goalId,
    frozenPrompt: pool.frozenPrompt,
    poolRunId: pool.runId,
    workerIndex: worker.index,
    workerCount: pool.workerCount,
    workerNonce: worker.nonce,
    workerReady: true
  };
}

async function captureWorkerConversationUrl(tabId) {
  if (!Number.isSafeInteger(tabId)) return "";
  try {
    const tab = await chrome.tabs.get(tabId);
    return normalizeWorkerConversationUrl(tab?.url || tab?.pendingUrl || "");
  } catch {
    return "";
  }
}

function normalizeWorkerConversationUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || !CHATGPT_WORKER_HOSTS.has(url.hostname)) return "";
    if (!/\/c\/[^/?#]+/.test(url.pathname)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function scheduleInactiveWorkerClose(runId, workerIndex, tabId) {
  if (!Number.isSafeInteger(tabId)) return;
  setTimeout(() => { void closeInactiveWorkerTab(runId, workerIndex, tabId); }, STANDBY_PARK_DELAY_MS);
}

async function closeInactiveWorkerTab(runId, workerIndex, tabId) {
  const { pool } = await getPoolState(runId);
  if (Number(pool.activeWorkerIndex) === Number(workerIndex)) return;
  const worker = pool.workers.find((item) => item.index === workerIndex);
  if (!worker || worker.tabId !== tabId) return;
  const nextPool = {
    ...pool,
    workers: pool.workers.map((item) => item.index === workerIndex
      ? { ...item, tabId: null, closedAt: new Date().toISOString() }
      : item)
  };
  await chrome.storage.local.set({ [poolStateKey(runId)]: nextPool });
  try { await chrome.tabs.remove(tabId); } catch {}
}

async function fetchGeneratedJsonUrl(value) {
  const url = new URL(String(value || ""));
  const allowed = url.protocol === "https:" && (
    url.hostname === "chatgpt.com" ||
    url.hostname === "chat.openai.com" ||
    url.hostname === "files.oaiusercontent.com" ||
    url.hostname.endsWith(".oaiusercontent.com")
  );
  if (!allowed) throw new Error("Rerun rejected an unexpected generated-file host.");

  const response = await fetch(url.href, {
    method: "GET",
    credentials: "include",
    cache: "no-store"
  });
  if (!response.ok) throw new Error(`Generated JSON fetch failed with HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error("Generated JSON file was empty.");
  if (new TextEncoder().encode(text).byteLength > MAX_GENERATED_JSON_BYTES) {
    throw new Error("Generated JSON file exceeded the 1 MiB limit.");
  }
  return { value: JSON.parse(text) };
}

async function resumeGoal(tabId) {
  await ensureContentScript(tabId);
  const { config, runtime } = await getTabState(tabId);
  validateConfig(config);
  if (!runtime.runId || !runtime.goalId || !runtime.frozenPrompt) {
    throw new Error("No paused Goal Runner exists in this tab.");
  }
  const conflict = await findConflictingRun(tabId, config, runtime.runId);
  if (conflict !== null) {
    throw new Error(`The same repository/branch Goal Runner is already active in ${conflict}.`);
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
  await syncPoolStatus(next, "running", null);
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
  await syncPoolStatus(next, "paused", null);
  return { runtime: next };
}

async function stopGoal(tabId) {
  const { runtime } = await getTabState(tabId);
  if (runtime.poolRunId) await stopWorkerPool(runtime.poolRunId);
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
  const prompt = runtime.resumeCapsulePending
    ? buildFreshChatResumePrompt(runtime.frozenPrompt, runtime.lastCheckpoint)
    : runtime.frozenPrompt;
  const next = {
    ...runtime,
    phase: "dispatching",
    dispatchClaimedAt: new Date().toISOString(),
    lastError: null
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  return { claimed: true, prompt, goalId: runtime.goalId };
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
    waitingApproval: false,
    resumeCapsulePending: false
  };
  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  await syncPoolProgress(tabId, next, "running", "active");
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
  const processedResultIds = normalizeProcessedResultIds(runtime);
  if (processedResultIds.includes(result.resultId)) return { ignored: true, runtime };
  const nextProcessedResultIds = [...processedResultIds, result.resultId];

  const common = {
    ...runtime,
    lastCheckpoint: result.checkpoint,
    lastResult: result.status,
    lastResultId: result.resultId,
    processedResultIds: nextProcessedResultIds,
    lastError: null,
    waitingApproval: false,
    dispatchClaimedAt: null
  };

  let next;
  let poolStatus;
  let workerStatus;
  if (result.status === "CONTINUE") {
    next = runtime.enabled && runtime.status !== "paused"
      ? { ...common, enabled: true, status: "running", phase: "ready" }
      : { ...common, enabled: false, status: "paused", phase: "paused" };
    poolStatus = next.enabled ? "running" : "paused";
    workerStatus = next.enabled ? "active" : "paused";
  } else if (result.status === "COMPLETE") {
    next = { ...common, enabled: false, status: "complete", phase: "complete" };
    poolStatus = "complete";
    workerStatus = "complete";
  } else if (result.status === "NEEDS_USER") {
    next = { ...common, enabled: false, status: "needs_user", phase: "paused" };
    poolStatus = "needs_user";
    workerStatus = "paused";
  } else {
    next = { ...common, enabled: false, status: "conflict", phase: "paused" };
    poolStatus = "conflict";
    workerStatus = "paused";
  }

  await chrome.storage.local.set({ [tabRuntimeKey(tabId)]: next });
  await syncPoolProgress(tabId, next, poolStatus, workerStatus);
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
  await syncPoolProgress(tabId, next, next.enabled ? "running" : "paused", next.enabled ? "active" : "paused");
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

async function handoffToNewChat(oldTabId, reason) {
  const { runtime } = await getTabState(oldTabId);
  if (runtime.poolRunId) return advanceWorkerPool(oldTabId, reason);
  return legacyFreshChatHandoff(oldTabId);
}

async function advanceWorkerPool(oldTabId, reason) {
  const { runtime } = await getTabState(oldTabId);
  if (!runtime.enabled || !runtime.poolRunId) return { handedOff: false, reason: "not_active" };

  const { pool: storedPool } = await getPoolState(runtime.poolRunId);
  const currentIndex = Number(storedPool.activeWorkerIndex);
  const currentWorker = storedPool.workers[currentIndex];
  if (!currentWorker || currentWorker.tabId !== oldTabId) {
    return { handedOff: false, reason: "not_active_worker" };
  }

  const nextWorker = storedPool.workers.find((item) => item.index > currentIndex && item.status === "ready");
  if (!nextWorker) {
    const detail = `Preallocated worker pool exhausted after worker ${currentIndex + 1}. No additional approved ChatGPT worker is available.`;
    const exhaustedRuntime = {
      ...runtime,
      enabled: false,
      status: "needs_user",
      phase: "paused",
      lastError: detail
    };
    const pool = {
      ...storedPool,
      status: "needs_user",
      lastCheckpoint: runtime.lastCheckpoint,
      lastResult: runtime.lastResult,
      lastResultId: runtime.lastResultId,
      processedResultIds: normalizeProcessedResultIds(runtime),
      iteration: Number(runtime.iteration || 0),
      lastError: detail,
      workers: storedPool.workers.map((item) => item.index === currentIndex ? { ...item, status: "exhausted" } : item)
    };
    await chrome.storage.local.set({
      [tabRuntimeKey(oldTabId)]: exhaustedRuntime,
      [poolStateKey(pool.runId)]: pool
    });
    return { handedOff: false, reason: "worker_pool_exhausted", runtime: exhaustedRuntime, pool };
  }

  let prepared;
  try {
    prepared = await prepareReadyWorkerTab(storedPool, nextWorker);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const blockedRuntime = {
      ...runtime,
      enabled: false,
      status: "needs_user",
      phase: "paused",
      lastError: detail
    };
    const blockedPool = {
      ...storedPool,
      status: "needs_user",
      lastError: detail
    };
    await chrome.storage.local.set({
      [tabRuntimeKey(oldTabId)]: blockedRuntime,
      [poolStateKey(storedPool.runId)]: blockedPool
    });
    return { handedOff: false, reason: "worker_reopen_failed", runtime: blockedRuntime, pool: blockedPool };
  }

  const nextTabId = prepared.tabId;
  const standbyRuntime = prepared.runtime;
  const preparedPool = prepared.pool;
  const oldRuntime = {
    ...runtime,
    enabled: false,
    status: "handed_off",
    phase: "idle",
    handoffToTabId: nextTabId,
    lastError: null
  };
  const nextRuntime = {
    ...standbyRuntime,
    enabled: true,
    status: "running",
    phase: "ready",
    iteration: Number(runtime.iteration || 0),
    lastCheckpoint: runtime.lastCheckpoint,
    lastResult: runtime.lastResult,
    lastResultId: runtime.lastResultId,
    processedResultIds: normalizeProcessedResultIds(runtime),
    waitingApproval: false,
    handoffFromTabId: oldTabId,
    resumeCapsulePending: Boolean(String(runtime.lastCheckpoint || "").trim()),
    dispatchClaimedAt: null,
    lastError: null
  };
  const pool = {
    ...preparedPool,
    status: "running",
    activeWorkerIndex: nextWorker.index,
    iteration: nextRuntime.iteration,
    lastCheckpoint: nextRuntime.lastCheckpoint,
    lastResult: nextRuntime.lastResult,
    lastResultId: nextRuntime.lastResultId,
    processedResultIds: nextRuntime.processedResultIds,
    lastError: null,
    workers: preparedPool.workers.map((item) => {
      if (item.index === currentIndex) return { ...item, status: "spent", handoffReason: String(reason || "conversation_exhausted") };
      if (item.index === nextWorker.index) return { ...item, status: "active", tabId: nextTabId };
      return item;
    })
  };

  await chrome.storage.local.set({
    [tabRuntimeKey(oldTabId)]: oldRuntime,
    [tabRuntimeKey(nextTabId)]: nextRuntime,
    [poolStateKey(pool.runId)]: pool
  });
  await wakeTab(nextTabId);
  await focusTab(nextTabId);
  scheduleInactiveWorkerClose(pool.runId, currentIndex, oldTabId);
  return { handedOff: true, newTabId: nextTabId, workerIndex: nextWorker.index, runtime: nextRuntime, pool };
}

async function legacyFreshChatHandoff(oldTabId) {
  const { config, runtime } = await getTabState(oldTabId);
  if (!runtime.enabled || runtime.handoffPending) return { handedOff: false, reason: "not_active" };
  if (runtime.handoffUsed || runtime.handoffFromTabId !== null) {
    const next = {
      ...runtime,
      enabled: false,
      status: "needs_user",
      phase: "paused",
      handoffPending: false,
      handoffUsed: true,
      lastError: "Fresh-chat handoff was already used for this legacy run. Resume manually instead of opening another automatic chat."
    };
    await chrome.storage.local.set({ [tabRuntimeKey(oldTabId)]: next });
    return { handedOff: false, reason: "handoff_already_used", runtime: next };
  }

  await chrome.storage.local.set({
    [tabRuntimeKey(oldTabId)]: { ...runtime, handoffPending: true, handoffUsed: true }
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
      handoffUsed: true,
      handoffFromTabId: oldTabId,
      handoffToTabId: null,
      resumeCapsulePending: Boolean(String(runtime.lastCheckpoint || "").trim()),
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
        handoffUsed: true,
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
        [tabRuntimeKey(oldTabId)]: {
          ...latest,
          enabled: false,
          status: "needs_user",
          phase: "paused",
          handoffPending: false,
          handoffUsed: true,
          lastError: "Fresh-chat handoff failed. Resume manually; Rerun will not open another automatic chat for this run."
        }
      });
    }
  }
}

async function activatePoolWorker(pool, workerIndex, resumeCapsule) {
  const worker = pool.workers.find((item) => item.index === workerIndex);
  if (!worker || worker.status !== "ready" || !Number.isSafeInteger(worker.tabId)) {
    throw new Error(`Worker ${workerIndex + 1} is not ready.`);
  }
  await focusTab(worker.tabId);
  await waitForTabComplete(worker.tabId, 20_000);
  await ensureContentScript(worker.tabId);
  const { runtime } = await getTabState(worker.tabId);
  if (!runtime.workerReady) throw new Error(`Worker ${workerIndex + 1} has not completed GitHub preflight.`);

  const nextRuntime = {
    ...runtime,
    enabled: true,
    status: "running",
    phase: "ready",
    iteration: Number(pool.iteration || 0),
    lastCheckpoint: String(pool.lastCheckpoint || ""),
    lastResult: pool.lastResult || null,
    lastResultId: pool.lastResultId || null,
    processedResultIds: Array.isArray(pool.processedResultIds) ? [...pool.processedResultIds] : [],
    resumeCapsulePending: Boolean(resumeCapsule && String(pool.lastCheckpoint || "").trim()),
    lastError: null
  };
  const nextPool = {
    ...pool,
    status: "running",
    activeWorkerIndex: workerIndex,
    workers: pool.workers.map((item) => item.index === workerIndex ? { ...item, status: "active" } : item)
  };
  await chrome.storage.local.set({
    [tabRuntimeKey(worker.tabId)]: nextRuntime,
    [poolStateKey(pool.runId)]: nextPool
  });
  await wakeTab(worker.tabId);
  await focusTab(worker.tabId);
  return { runtime: nextRuntime, pool: nextPool };
}

async function syncPoolProgress(tabId, runtime, poolStatus, workerStatus) {
  if (!runtime.poolRunId) return;
  const { pool } = await getPoolState(runtime.poolRunId);
  if (Number(pool.activeWorkerIndex) !== Number(runtime.workerIndex)) return;
  const nextPool = {
    ...pool,
    status: poolStatus,
    iteration: Number(runtime.iteration || 0),
    lastCheckpoint: String(runtime.lastCheckpoint || ""),
    lastResult: runtime.lastResult || null,
    lastResultId: runtime.lastResultId || null,
    processedResultIds: normalizeProcessedResultIds(runtime),
    lastError: runtime.lastError || null,
    workers: pool.workers.map((item) => item.tabId === tabId ? { ...item, status: workerStatus } : item)
  };
  await chrome.storage.local.set({ [poolStateKey(pool.runId)]: nextPool });
}

async function syncPoolStatus(runtime, status, lastError) {
  if (!runtime.poolRunId) return;
  const { pool } = await getPoolState(runtime.poolRunId);
  await chrome.storage.local.set({
    [poolStateKey(pool.runId)]: { ...pool, status, lastError }
  });
}

async function stopWorkerPool(runId) {
  const { pool } = await getPoolState(runId);
  const updates = {
    [poolStateKey(runId)]: {
      ...pool,
      status: "stopped",
      lastError: null,
      workers: pool.workers.map((worker) => worker.status === "complete" ? worker : { ...worker, status: "stopped" })
    }
  };
  for (const worker of pool.workers) {
    if (!Number.isSafeInteger(worker.tabId)) continue;
    const { runtime } = await getTabState(worker.tabId);
    updates[tabRuntimeKey(worker.tabId)] = {
      ...runtime,
      enabled: false,
      status: "stopped",
      phase: "idle",
      waitingApproval: false,
      lastError: null
    };
  }
  await chrome.storage.local.set(updates);
}

async function findConflictingRun(tabId, config, excludedRunId = null) {
  const all = await chrome.storage.local.get(null);
  for (const [key, pool] of Object.entries(all)) {
    const match = key.match(/^v2:pool:(.+)$/);
    if (!match || !pool || POOL_TERMINAL_STATUSES.has(String(pool.status || ""))) continue;
    if (excludedRunId && String(pool.runId || "") === String(excludedRunId)) continue;
    if (pool.config?.repository === config.repository && pool.config?.branch === config.branch) {
      return `worker pool ${pool.runId}`;
    }
  }

  for (const [key, runtime] of Object.entries(all)) {
    const match = key.match(/^v2:runtime:(\d+)$/);
    if (!match || !runtime?.enabled) continue;
    if (excludedRunId && String(runtime.runId || "") === String(excludedRunId)) continue;
    const otherTabId = Number(match[1]);
    if (otherTabId === tabId) continue;
    const otherConfig = { ...DEFAULT_CONFIG, ...(all[tabConfigKey(otherTabId)] || {}) };
    if (otherConfig.repository === config.repository && otherConfig.branch === config.branch) return `tab ${otherTabId}`;
  }
  return null;
}

function normalizeProcessedResultIds(runtime) {
  const ids = Array.isArray(runtime.processedResultIds)
    ? runtime.processedResultIds.map((value) => String(value || "").trim()).filter(Boolean)
    : [];
  const lastResultId = String(runtime.lastResultId || "").trim();
  if (lastResultId && !ids.includes(lastResultId)) ids.push(lastResultId);
  return ids;
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

async function focusTab(tabId) {
  try {
    await chrome.tabs.update(tabId, { active: true });
  } catch {
    // The user may have closed the tab between state transitions.
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

function requireRunId(message) {
  const runId = String(message?.runId || "").trim();
  if (!runId) throw new Error("A valid runId is required.");
  return runId;
}

function resolveTabId(message, sender) {
  const explicit = Number(message?.tabId);
  if (Number.isSafeInteger(explicit) && explicit >= 0) return explicit;
  return requireSenderTabId(sender);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
