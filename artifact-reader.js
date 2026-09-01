(() => {
  const SCRIPT_REVISION = "goal-supersede-v229-20260901";
  const EVENT_REVISION = "worker-ready-event-v229-20260901";
  if (
    globalThis.__CHATGPT_RERUN_V2_ARTIFACT_READER__ === SCRIPT_REVISION &&
    globalThis.__CHATGPT_RERUN_V2_ARTIFACT_EVENT_REVISION__ === EVENT_REVISION
  ) return;
  globalThis.__CHATGPT_RERUN_V2_ARTIFACT_READER__ = SCRIPT_REVISION;
  globalThis.__CHATGPT_RERUN_V2_ARTIFACT_EVENT_REVISION__ = EVENT_REVISION;

  const SCAN_MS = 750;
  const RETRY_MS = 2500;
  const BRIDGE_TIMEOUT_MS = 8000;
  const REQUEST_SOURCE = "chatgpt-rerun-v2-artifact-request";
  const RESPONSE_SOURCE = "chatgpt-rerun-v2-artifact-response";
  const TERMINAL_POOL_STATUSES = new Set(["complete", "stopped"]);

  let inFlight = false;
  let immediateScanPending = false;
  let nextAttemptAt = 0;
  let tabId = null;
  let lastDiagnosticKey = "";
  let expectedFilenameHint = "";
  const bridgeUrls = new Map();

  const observer = new MutationObserver((records) => {
    if (mutationsMentionExpectedArtifact(records, expectedFilenameHint)) forceScan();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) forceScan();
  });
  window.addEventListener("focus", forceScan);
  setInterval(() => { void scan(); }, SCAN_MS);
  void initialize();

  function forceScan() {
    nextAttemptAt = 0;
    if (inFlight) {
      immediateScanPending = true;
      return;
    }
    void scan();
  }

  async function initialize() {
    try {
      const registration = await chrome.runtime.sendMessage({ type: "REGISTER_CHAT_TAB" });
      if (registration?.ok && Number.isSafeInteger(registration.tabId)) tabId = registration.tabId;
    } catch {}
    void scan();
  }

  async function scan() {
    if (inFlight || Date.now() < nextAttemptAt) return;

    let state;
    try {
      state = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
    } catch {
      return;
    }
    if (!state?.ok) return;

    const runtime = state.runtime || {};
    let mode = "";
    let expectedId = "";
    let expectedFilename = "";

    if (runtime.phase === "awaiting_goal_file" && runtime.setupPending && runtime.setupNonce) {
      mode = "goal";
      expectedId = String(runtime.setupNonce);
      expectedFilename = `rerun-goal-${expectedId}.json`;
    } else if (runtime.phase === "worker_preflight" && runtime.goalId && runtime.workerNonce && Number.isInteger(runtime.workerIndex)) {
      mode = "worker_ready";
      expectedId = `${runtime.goalId}:${runtime.workerIndex + 1}`;
      expectedFilename = `rerun-worker-ready-${runtime.goalId}-${runtime.workerIndex + 1}-${runtime.workerNonce}.json`;
    } else if (runtime.phase === "generating" && runtime.goalId) {
      mode = "result";
      expectedId = String(runtime.goalId);
      expectedFilename = `rerun-result-${expectedId}.json`;
    } else {
      expectedFilenameHint = "";
      return;
    }

    expectedFilenameHint = expectedFilename;
    inFlight = true;
    try {
      await writeDiagnostic(mode, expectedId, "resolving", "Resolving generated JSON through the ChatGPT file API.");
      let value = await readFromPage(expectedFilename);

      if (value?.downloadUrl) {
        const fetched = await chrome.runtime.sendMessage({ type: "FETCH_JSON_URL", url: value.downloadUrl });
        if (!fetched?.ok) throw new Error(fetched?.error || "external_download_fetch_failed");
        value = { value: fetched.value };
      }

      if (!value?.value || typeof value.value !== "object" || Array.isArray(value.value)) {
        throw new Error("generated_json_payload_missing");
      }

      if (mode === "result") {
        const resultId = String(value.value.result_id || "");
        const processedResultIds = Array.isArray(runtime.processedResultIds) ? runtime.processedResultIds : [];
        if (resultId && (resultId === String(runtime.lastResultId || "") || processedResultIds.includes(resultId))) {
          await writeDiagnostic(mode, expectedId, "waiting", "Waiting for a new result JSON from the active execution.");
          nextAttemptAt = Date.now() + RETRY_MS;
          return;
        }
      }

      if (mode === "goal") {
        const supersededCount = await supersedeOlderRuns(value.value, expectedId);
        const imported = await chrome.runtime.sendMessage({ type: "IMPORT_GOAL_FILE", value: value.value });
        if (!imported?.ok) {
          const latest = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
          const alreadyImported = latest?.ok &&
            String(latest.runtime?.goalId || "") === expectedId &&
            latest.runtime?.phase !== "awaiting_goal_file";
          if (!alreadyImported) throw new Error(imported?.error || "goal_file_import_failed");
        }
        const detail = supersededCount > 0
          ? `Goal JSON resolved and imported. Superseded ${supersededCount} older same-target run(s).`
          : "Goal JSON resolved and imported.";
        await writeDiagnostic(mode, expectedId, "ready", detail);
        nextAttemptAt = Date.now() + RETRY_MS;
        return;
      }

      if (mode === "worker_ready") {
        const reported = await chrome.runtime.sendMessage({ type: "REPORT_WORKER_READY", value: value.value });
        if (!reported?.ok) {
          const latest = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
          const alreadyReady = latest?.ok &&
            latest.runtime?.workerReady === true &&
            latest.runtime?.phase !== "worker_preflight";
          if (!alreadyReady) throw new Error(reported?.error || "worker_ready_import_failed");
        }
        await writeDiagnostic(mode, expectedId, "ready", "Worker-ready JSON resolved and imported.");
        nextAttemptAt = Date.now() + RETRY_MS;
        return;
      }

      exposeBlob(expectedFilename, value.value);
      await writeDiagnostic(mode, expectedId, "ready", "Generated JSON resolved and exposed to the Goal Runner.");
      nextAttemptAt = Date.now() + RETRY_MS;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await writeDiagnostic(mode, expectedId, "error", detail);
      console.warn("ChatGPT Rerun V2 artifact reader:", detail);
      nextAttemptAt = Date.now() + RETRY_MS;
    } finally {
      inFlight = false;
      if (immediateScanPending) {
        immediateScanPending = false;
        nextAttemptAt = 0;
        queueMicrotask(() => { void scan(); });
      }
    }
  }

  function readFromPage(expectedFilename) {
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener("message", onMessage);
        reject(new Error("artifact_bridge_timeout"));
      }, BRIDGE_TIMEOUT_MS);

      function onMessage(event) {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || data.source !== RESPONSE_SOURCE || data.requestId !== requestId) return;
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        if (!data.ok) {
          reject(new Error(String(data.error || "artifact_bridge_failed")));
          return;
        }
        resolve({ value: data.value || null, downloadUrl: data.downloadUrl || null });
      }

      window.addEventListener("message", onMessage);
      window.postMessage({
        source: REQUEST_SOURCE,
        requestId,
        expectedFilename
      }, "*");
    });
  }

  async function supersedeOlderRuns(goalValue, expectedGoalId) {
    const target = validatedSupersessionTarget(goalValue, expectedGoalId);
    if (!target) return 0;

    const all = await chrome.storage.local.get(null);
    const updates = {};
    const supersededRunIds = new Set();
    const supersededExecutions = new Set();
    const reason = `Superseded by newer Goal ${target.goalId}.`;

    for (const [key, pool] of Object.entries(all)) {
      const match = key.match(/^v2:pool:(.+)$/);
      if (!match || !pool || TERMINAL_POOL_STATUSES.has(String(pool.status || ""))) continue;
      if (String(pool.config?.repository || "") !== target.repository) continue;
      if ((String(pool.config?.branch || "main").trim() || "main") !== target.branch) continue;

      const runId = String(pool.runId || match[1] || "").trim();
      if (runId) {
        supersededRunIds.add(runId);
        supersededExecutions.add(`pool:${runId}`);
      }
      updates[key] = {
        ...pool,
        status: "stopped",
        supersededByGoalId: target.goalId,
        lastError: reason,
        workers: Array.isArray(pool.workers)
          ? pool.workers.map((worker) => worker?.status === "complete" ? worker : { ...worker, status: "stopped" })
          : []
      };
    }

    for (const [key, existingRuntime] of Object.entries(all)) {
      const match = key.match(/^v2:runtime:(\d+)$/);
      if (!match || !existingRuntime) continue;
      const runtimeTabId = Number(match[1]);
      if (Number.isSafeInteger(tabId) && runtimeTabId === tabId) continue;

      const runtimeRunId = String(existingRuntime.poolRunId || existingRuntime.runId || "").trim();
      let shouldStop = runtimeRunId && supersededRunIds.has(runtimeRunId);

      if (!shouldStop && existingRuntime.enabled) {
        const config = all[`v2:config:${runtimeTabId}`] || {};
        const repository = String(config.repository || "").trim();
        const branch = String(config.branch || "main").trim() || "main";
        shouldStop = repository === target.repository && branch === target.branch;
        if (shouldStop) supersededExecutions.add(`legacy:${runtimeRunId || runtimeTabId}`);
      }
      if (!shouldStop) continue;

      updates[key] = {
        ...existingRuntime,
        enabled: false,
        status: "stopped",
        phase: "idle",
        setupPending: false,
        waitingApproval: false,
        handoffPending: false,
        dispatchClaimedAt: null,
        poolRunId: null,
        workerReady: false,
        lastError: reason
      };
    }

    if (Object.keys(updates).length) await chrome.storage.local.set(updates);
    return supersededExecutions.size;
  }

  function validatedSupersessionTarget(goalValue, expectedGoalId) {
    const expected = String(expectedGoalId || "").trim();
    if (!expected || !goalValue || typeof goalValue !== "object" || Array.isArray(goalValue)) return null;
    if (Number(goalValue.version) !== 2 || String(goalValue.kind || "") !== "chatgpt-rerun-goal") return null;
    if (String(goalValue.setup_nonce || "") !== expected || String(goalValue.goal_id || "") !== expected) return null;

    const repository = String(goalValue.repository || "").trim();
    const branch = String(goalValue.branch || "main").trim() || "main";
    const goal = String(goalValue.goal || "").trim();
    if (!/^[^/\s]+\/[^/\s]+$/.test(repository) || !goal) return null;
    return { repository, branch, goalId: expected };
  }

  function mutationsMentionExpectedArtifact(records, expectedFilename) {
    if (!expectedFilename) return false;
    const mentions = (node) => {
      if (!node) return false;
      const text = typeof node.textContent === "string" ? node.textContent : "";
      if (text.includes(expectedFilename)) return true;
      if (typeof node.getAttribute !== "function") return false;
      for (const attr of [
        "href", "download", "title", "aria-label", "data-filename", "data-file-name",
        "data-testid", "data-file-url", "data-download-url"
      ]) {
        if (String(node.getAttribute(attr) || "").includes(expectedFilename)) return true;
      }
      return false;
    };

    for (const record of records || []) {
      if (mentions(record?.target)) return true;
      for (const node of Array.from(record?.addedNodes || [])) {
        if (mentions(node)) return true;
      }
    }
    return false;
  }

  function exposeBlob(expectedFilename, value) {
    const previous = bridgeUrls.get(expectedFilename);
    if (previous) URL.revokeObjectURL(previous);

    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(value)], { type: "application/json" }));
    bridgeUrls.set(expectedFilename, blobUrl);

    let node = document.querySelector(`[data-rerun-artifact-bridge="${cssEscape(expectedFilename)}"]`);
    if (!node) {
      node = document.createElement("a");
      node.hidden = true;
      node.setAttribute("data-rerun-artifact-bridge", expectedFilename);
      node.setAttribute("data-filename", expectedFilename);
      node.setAttribute("href", `sandbox:/mnt/data/${expectedFilename}`);
      document.documentElement.appendChild(node);
    }
    node.setAttribute("data-file-url", blobUrl);
  }

  async function writeDiagnostic(mode, expectedId, status, detail) {
    if (!Number.isSafeInteger(tabId)) return;
    const key = `${mode}:${expectedId}:${status}:${detail}`;
    if (key === lastDiagnosticKey) return;
    lastDiagnosticKey = key;
    try {
      await chrome.storage.local.set({
        [`v2:artifact:${tabId}`]: {
          mode,
          expectedId,
          status,
          detail,
          updatedAt: new Date().toISOString()
        }
      });
    } catch {}
  }

  function cssEscape(value) {
    if (globalThis.CSS?.escape) return CSS.escape(value);
    return String(value).replace(/[^A-Za-z0-9_-]/g, "\\$&");
  }
})();