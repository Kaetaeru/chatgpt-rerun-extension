(() => {
  if (globalThis.__CHATGPT_RERUN_V2_PREVIEW_READER__) return;
  globalThis.__CHATGPT_RERUN_V2_PREVIEW_READER__ = true;

  const SCAN_MS = 750;
  const RETRY_MS = 4000;
  const PREVIEW_WAIT_MS = 6000;
  const MAX_PREVIEW_TEXT_CHARS = 2 * 1024 * 1024;
  let inFlight = false;
  let nextAttemptAt = 0;

  const observer = new MutationObserver(() => { void scan(); });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
  setInterval(() => { void scan(); }, SCAN_MS);
  void scan();

  async function scan() {
    if (inFlight || Date.now() < nextAttemptAt || !isChatIdle()) return;

    let state;
    try {
      state = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
    } catch {
      return;
    }
    if (!state?.ok) return;

    const runtime = state.runtime || {};
    let mode = "";
    let expectedFilename = "";
    let expectedId = "";

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

    const card = findNewestExactFileCard(expectedFilename);
    if (!card) return;
    const target = chooseClickTarget(card);
    if (!target) return;

    const baseline = new Set(previewCandidates());
    inFlight = true;
    try {
      target.click();
      const value = await waitForPreviewJson(baseline, mode, expectedId, expectedFilename, PREVIEW_WAIT_MS);
      if (!value) throw new Error(`Found ${expectedFilename}, but no validated JSON preview appeared.`);

      if (mode === "result" && String(value.result_id || "") === String(runtime.lastResultId || "")) {
        nextAttemptAt = Date.now() + RETRY_MS;
        return;
      }

      const response = await chrome.runtime.sendMessage({
        type: mode === "goal" ? "IMPORT_GOAL_FILE" : "REPORT_RESULT_FILE",
        value
      });
      if (!response?.ok) throw new Error(response?.error || "preview_json_import_failed");
      nextAttemptAt = Date.now() + 1000;
    } catch {
      nextAttemptAt = Date.now() + RETRY_MS;
    } finally {
      inFlight = false;
    }
  }

  async function waitForPreviewJson(baseline, mode, expectedId, expectedFilename, timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const value = readValidatedPreviewJson(baseline, mode, expectedId, expectedFilename);
      if (value) return value;
      await sleep(100);
    }
    return null;
  }

  function readValidatedPreviewJson(baseline, mode, expectedId, expectedFilename) {
    for (const node of previewCandidates()) {
      if (!isVisible(node)) continue;
      const isNew = !baseline.has(node);
      const previewScoped = Boolean(node.closest?.('[role="dialog"], [aria-modal="true"], [data-testid*="preview"], [data-testid*="artifact"], [data-testid*="file"], [class*="monaco"]'));
      if (!isNew && !previewScoped && !filenameNearby(node, expectedFilename)) continue;
      const value = extractExpectedJson(previewText(node), mode, expectedId);
      if (value) return value;
    }
    return null;
  }

  function extractExpectedJson(text, mode, expectedId) {
    const source = String(text || "").trim();
    if (!source) return null;

    const direct = parseCandidate(source, mode, expectedId);
    if (direct) return direct;

    let start = source.indexOf("{");
    while (start >= 0) {
      const end = balancedObjectEnd(source, start);
      if (end > start) {
        const parsed = parseCandidate(source.slice(start, end + 1), mode, expectedId);
        if (parsed) return parsed;
      }
      start = source.indexOf("{", start + 1);
    }
    return null;
  }

  function parseCandidate(text, mode, expectedId) {
    let value;
    try { value = JSON.parse(text); } catch { return null; }
    if (!value || typeof value !== "object" || Array.isArray(value) || value.version !== 2) return null;

    if (mode === "goal") {
      if (value.kind !== "chatgpt-rerun-goal") return null;
      if (String(value.setup_nonce || "") !== expectedId) return null;
      if (String(value.goal_id || "") !== expectedId) return null;
      return value;
    }

    if (value.kind !== "chatgpt-rerun-result") return null;
    if (String(value.goal_id || "") !== expectedId) return null;
    if (!String(value.result_id || "").trim()) return null;
    if (!["CONTINUE", "COMPLETE", "NEEDS_USER", "CONFLICT"].includes(String(value.status || "").toUpperCase())) return null;
    return value;
  }

  function balancedObjectEnd(text, start) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') { inString = true; continue; }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return i;
        if (depth < 0) return -1;
      }
    }
    return -1;
  }

  function previewCandidates() {
    return Array.from(document.querySelectorAll([
      '[role="dialog"]', '[aria-modal="true"]',
      '[data-testid*="preview"]', '[data-testid*="artifact"]', '[data-testid*="file"]', '[data-testid*="code"]',
      '[class*="monaco"]', '.view-lines', '.view-line', 'pre', 'code', 'textarea', 'iframe'
    ].join(',')));
  }

  function previewText(node) {
    try {
      if (node instanceof HTMLIFrameElement) {
        return String(node.contentDocument?.body?.innerText || node.contentDocument?.body?.textContent || "").slice(0, MAX_PREVIEW_TEXT_CHARS);
      }
      if (node instanceof HTMLTextAreaElement || node instanceof HTMLInputElement) return String(node.value || "").slice(0, MAX_PREVIEW_TEXT_CHARS);
      return String(node.innerText || node.textContent || "").slice(0, MAX_PREVIEW_TEXT_CHARS);
    } catch {
      return "";
    }
  }

  function findNewestExactFileCard(filename) {
    const wanted = normalizeText(filename).toLowerCase();
    const matches = [];
    const selector = 'button,a,[role="button"],[role="link"],[data-filename],[data-file-name],[data-file-id],[data-testid]';
    for (const node of document.querySelectorAll(selector)) {
      if (!isVisible(node)) continue;
      const labels = [
        node.getAttribute?.("download"), node.getAttribute?.("title"), node.getAttribute?.("aria-label"),
        node.getAttribute?.("data-filename"), node.getAttribute?.("data-file-name"), normalizeText(node.textContent)
      ].map((value) => normalizeText(value).toLowerCase()).filter(Boolean);
      if (!labels.some((label) => label === wanted || label.includes(wanted))) continue;
      matches.push(node);
    }
    return matches.at(-1) || null;
  }

  function chooseClickTarget(node) {
    const candidates = [];
    if (node.matches?.('button,a,[role="button"],[role="link"]')) candidates.push(node);
    let parent = node.parentElement;
    for (let depth = 0; parent && depth < 6; depth += 1, parent = parent.parentElement) {
      if (parent.matches?.('button,a,[role="button"],[role="link"]')) candidates.push(parent);
    }
    for (const child of node.querySelectorAll?.('button,a,[role="button"],[role="link"]') || []) candidates.push(child);
    return candidates.find((candidate) => isVisible(candidate) && !/^(download|다운로드)(?:\s|$)/i.test(normalizeText(`${candidate.textContent || ""} ${candidate.getAttribute?.("aria-label") || ""}`))) || null;
  }

  function filenameNearby(node, expectedFilename) {
    const wanted = String(expectedFilename || "").toLowerCase();
    let current = node;
    for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
      const text = normalizeText(`${current.getAttribute?.("title") || ""} ${current.getAttribute?.("aria-label") || ""} ${current.textContent || ""}`).toLowerCase();
      if (text.includes(wanted)) return true;
    }
    return false;
  }

  function isVisible(node) {
    if (!(node instanceof Element)) return false;
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  }

  function findStopButton() {
    return document.querySelector('button[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="stop"],button[aria-label*="중지"]');
  }

  function isChatIdle() { return !findStopButton(); }
  function normalizeText(value) { return String(value || "").replace(/\s+/g, " ").trim(); }
  function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
})();
