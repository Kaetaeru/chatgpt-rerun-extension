(() => {
  if (globalThis.__CHATGPT_RERUN_V2_ARTIFACT_READER__) return;
  globalThis.__CHATGPT_RERUN_V2_ARTIFACT_READER__ = true;

  const SCAN_MS = 750;
  const RETRY_MS = 2500;
  const BRIDGE_TIMEOUT_MS = 8000;
  const REQUEST_SOURCE = "chatgpt-rerun-v2-artifact-request";
  const RESPONSE_SOURCE = "chatgpt-rerun-v2-artifact-response";

  let inFlight = false;
  let nextAttemptAt = 0;
  let tabId = null;
  let lastDiagnosticKey = "";
  const bridgeUrls = new Map();

  const observer = new MutationObserver(() => { void scan(); });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(() => { void scan(); }, SCAN_MS);
  void initialize();

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
    } else if (runtime.phase === "generating" && runtime.goalId) {
      mode = "result";
      expectedId = String(runtime.goalId);
      expectedFilename = `rerun-result-${expectedId}.json`;
    } else {
      return;
    }

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
