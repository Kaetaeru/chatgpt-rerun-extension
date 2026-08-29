(() => {
  if (globalThis.__CHATGPT_RERUN_V2_LOADED__) return;
  globalThis.__CHATGPT_RERUN_V2_LOADED__ = true;

  const TICK_MS = 1500;
  const START_GRACE_MS = 12_000;
  const WATCHDOG_MS = 23 * 60 * 1000;
  const STOP_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]'
  ];

  let ticking = false;
  let generationStartedAtMs = null;
  let generationObservedActive = false;
  let approvalPausedAtMs = null;
  let approvalPausedTotalMs = 0;
  let watchdogFired = false;
  let manualStopRequested = false;
  let activeResultBaseline = null;
  const seenJsonAttachmentKeys = new Set();

  for (const candidate of listJsonAttachmentCandidates()) {
    seenJsonAttachmentKeys.add(candidate.key);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "RERUN_V2_PING") {
      sendResponse({ ready: true });
      return;
    }
    if (message?.type === "RERUN_V2_WAKE") {
      sendResponse({ ready: true });
      void tick();
      return;
    }
    if (message?.type === "RERUN_V2_SEND_DIRECT") {
      sendDirectPrompt(String(message.prompt || ""))
        .then(() => sendResponse({ sent: true }))
        .catch((error) => sendResponse({
          sent: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      return true;
    }
  });

  document.addEventListener("click", (event) => {
    if (!event.isTrusted || generationStartedAtMs === null) return;
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && isStopButtonElement(button)) manualStopRequested = true;
  }, true);

  setInterval(tick, TICK_MS);
  void tick();

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
      if (!state?.ok) return;
      const runtime = state.runtime || {};

      if (runtime.phase === "awaiting_goal_file") {
        await importGoalFileIfAvailable(runtime);
        return;
      }

      if (runtime.phase === "dispatching") {
        const claimedAt = Date.parse(String(runtime.dispatchClaimedAt || ""));
        if (Number.isFinite(claimedAt) && Date.now() - claimedAt > 15_000) {
          await chrome.runtime.sendMessage({ type: "RELEASE_EXECUTION", reason: "stale_dispatch_claim" });
        }
        return;
      }

      if (runtime.phase === "generating") {
        await observeGeneration(runtime);
        return;
      }

      resetGenerationTracking();
      if (!runtime.enabled || runtime.status !== "running" || runtime.phase !== "ready") return;
      if (!isChatIdle()) return;

      const approvalCard = findGitHubApprovalCard();
      if (approvalCard) {
        await chrome.runtime.sendMessage({ type: "SET_APPROVAL_WAIT", waiting: true });
        return;
      }
      if (runtime.waitingApproval) {
        await chrome.runtime.sendMessage({ type: "SET_APPROVAL_WAIT", waiting: false });
      }

      const composer = findComposer() || await waitForComposer(5_000);
      if (!composer) {
        await chrome.runtime.sendMessage({ type: "HANDOFF_NEW_CHAT" });
        return;
      }
      if (readComposerText(composer).trim()) {
        await chrome.runtime.sendMessage({ type: "PAUSE_GOAL" });
        return;
      }

      const claim = await chrome.runtime.sendMessage({ type: "CLAIM_EXECUTION" });
      if (!claim?.ok || !claim.claimed) return;
      try {
        activeResultBaseline = snapshotResultAttachmentKeys(claim.goalId);
        const startedAt = Date.now();
        await sendPrompt(composer, claim.prompt);
        const ack = await chrome.runtime.sendMessage({ type: "ACK_DISPATCH" });
        if (!ack?.ok || !ack.acknowledged) throw new Error("dispatch_ack_failed");
        armGenerationTracking(startedAt);
      } catch (error) {
        activeResultBaseline = null;
        await chrome.runtime.sendMessage({
          type: "RELEASE_EXECUTION",
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    } catch {
      // Background service worker may be restarting; next tick retries.
    } finally {
      ticking = false;
    }
  }

  async function importGoalFileIfAvailable(runtime) {
    const nonce = String(runtime.setupNonce || "");
    if (!nonce) return;
    const candidate = findNewJsonAttachment(`rerun-goal-${nonce}.json`);
    if (!candidate) return;
    try {
      const value = await readJsonAttachment(candidate);
      const response = await chrome.runtime.sendMessage({ type: "IMPORT_GOAL_FILE", value });
      if (!response?.ok) throw new Error(response?.error || "goal_file_import_failed");
      seenJsonAttachmentKeys.add(candidate.key);
    } catch {
      // File cards can appear before their download URL becomes readable. Retry on the next tick.
    }
  }

  async function observeGeneration(runtime) {
    if (generationStartedAtMs === null) {
      const persistedStart = Date.parse(String(runtime.lastSentAt || ""));
      armGenerationTracking(Number.isFinite(persistedStart) ? persistedStart : Date.now());
      if (!activeResultBaseline) activeResultBaseline = snapshotResultAttachmentKeys(runtime.goalId);
    }

    const approvalCard = findGitHubApprovalCard();
    if (approvalCard) {
      if (approvalPausedAtMs === null) approvalPausedAtMs = Date.now();
      if (!runtime.waitingApproval) {
        await chrome.runtime.sendMessage({ type: "SET_APPROVAL_WAIT", waiting: true });
      }
      return;
    }

    if (approvalPausedAtMs !== null) {
      approvalPausedTotalMs += Math.max(0, Date.now() - approvalPausedAtMs);
      approvalPausedAtMs = null;
    }
    if (runtime.waitingApproval) {
      await chrome.runtime.sendMessage({ type: "SET_APPROVAL_WAIT", waiting: false });
    }

    const stopButton = findStopButton();
    if (stopButton) {
      generationObservedActive = true;
      const activeMs = Math.max(0, Date.now() - generationStartedAtMs - approvalPausedTotalMs);
      if (activeMs >= WATCHDOG_MS && !watchdogFired) {
        watchdogFired = true;
        stopButton.click();
        await chrome.runtime.sendMessage({ type: "REPORT_INTERRUPTED", reason: "watchdog_23m" });
        resetGenerationTracking();
      }
      return;
    }

    if (!generationObservedActive && Date.now() - generationStartedAtMs < START_GRACE_MS) return;

    if (manualStopRequested) {
      resetGenerationTracking();
      await chrome.runtime.sendMessage({ type: "PAUSE_GOAL" });
      return;
    }

    const resultFile = await waitForResultFile(runtime.goalId, 10_000);
    resetGenerationTracking();
    if (!resultFile) {
      await chrome.runtime.sendMessage({ type: "REPORT_INTERRUPTED", reason: "missing_result_json" });
      return;
    }
    const response = await chrome.runtime.sendMessage({ type: "REPORT_RESULT_FILE", value: resultFile.value });
    if (!response?.ok) {
      await chrome.runtime.sendMessage({ type: "REPORT_INTERRUPTED", reason: response?.error || "invalid_result_json" });
      return;
    }
    seenJsonAttachmentKeys.add(resultFile.candidate.key);
  }

  async function waitForResultFile(goalId, timeoutMs) {
    const startedAt = Date.now();
    const expectedName = `rerun-result-${String(goalId || "")}.json`;
    while (Date.now() - startedAt < timeoutMs) {
      const candidate = findNewJsonAttachment(expectedName, activeResultBaseline);
      if (candidate) {
        try {
          return { candidate, value: await readJsonAttachment(candidate) };
        } catch {
          // The attachment may not be readable yet.
        }
      }
      await sleep(200);
    }
    return null;
  }

  function snapshotResultAttachmentKeys(goalId) {
    const expectedName = `rerun-result-${String(goalId || "")}.json`;
    return new Set(
      listJsonAttachmentCandidates()
        .filter((candidate) => candidate.fileName === expectedName)
        .map((candidate) => candidate.key)
    );
  }

  function findNewJsonAttachment(expectedName, baseline = null) {
    for (const candidate of listJsonAttachmentCandidates()) {
      if (candidate.fileName !== expectedName) continue;
      if (seenJsonAttachmentKeys.has(candidate.key)) continue;
      if (baseline?.has(candidate.key)) continue;
      return candidate;
    }
    return null;
  }

  function listJsonAttachmentCandidates() {
    const candidates = [];
    for (const anchor of document.querySelectorAll('a[href]')) {
      const fileName = attachmentFileName(anchor);
      if (!fileName || !fileName.toLowerCase().endsWith(".json")) continue;
      const href = anchor.href || anchor.getAttribute("href") || "";
      if (!href) continue;
      candidates.push({
        href,
        fileName,
        key: `${href}|${fileName}`
      });
    }
    return candidates;
  }

  function attachmentFileName(anchor) {
    const sources = [
      anchor.getAttribute("download"),
      anchor.getAttribute("aria-label"),
      anchor.textContent,
      decodeHrefTail(anchor.getAttribute("href"))
    ];
    for (const source of sources) {
      const match = String(source || "").match(/([A-Za-z0-9._-]+\.json)\b/i);
      if (match) return match[1];
    }
    return "";
  }

  function decodeHrefTail(href) {
    try {
      const url = new URL(String(href || ""), location.href);
      return decodeURIComponent(url.pathname.split("/").at(-1) || "");
    } catch {
      return String(href || "");
    }
  }

  async function readJsonAttachment(candidate) {
    const response = await fetch(candidate.href, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`attachment_fetch_${response.status}`);
    const text = await response.text();
    return JSON.parse(text);
  }

  function armGenerationTracking(startedAtMs) {
    generationStartedAtMs = startedAtMs;
    generationObservedActive = false;
    approvalPausedAtMs = null;
    approvalPausedTotalMs = 0;
    watchdogFired = false;
    manualStopRequested = false;
  }

  function resetGenerationTracking() {
    generationStartedAtMs = null;
    generationObservedActive = false;
    approvalPausedAtMs = null;
    approvalPausedTotalMs = 0;
    watchdogFired = false;
    manualStopRequested = false;
    activeResultBaseline = null;
  }

  function findGitHubApprovalCard() {
    for (const button of document.querySelectorAll("button")) {
      const buttonText = normalizeText([button.textContent, button.getAttribute("aria-label")].filter(Boolean).join(" "));
      if (!/^(허용(?:하기)?|Allow)(?:\s|$)/i.test(buttonText)) continue;
      let node = button;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        const text = normalizeText(node.textContent);
        if (!text || text.length > 1600 || !text.includes("GitHub")) continue;
        if (/ChatGPT가\s*GitHub.*사용하도록\s*허용할까요/i.test(text) || /allow\s+ChatGPT\s+to\s+use\s+GitHub/i.test(text)) return node;
      }
    }
    return null;
  }

  async function sendDirectPrompt(prompt) {
    if (!prompt.trim()) throw new Error("direct_prompt_empty");
    if (!isChatIdle()) throw new Error("chat_is_generating");
    const composer = findComposer() || await waitForComposer(5_000);
    if (!composer) throw new Error("composer_unavailable");
    if (readComposerText(composer).trim()) throw new Error("composer_not_empty");
    await sendPrompt(composer, prompt);
  }

  function findComposer() {
    return document.querySelector("#prompt-textarea") ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector("main textarea") ||
      document.querySelector('main [contenteditable="true"]');
  }

  async function waitForComposer(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const composer = findComposer();
      if (composer) return composer;
      await sleep(100);
    }
    return null;
  }

  function readComposerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value || "";
    return composer.textContent || "";
  }

  function isStopButtonElement(button) {
    return STOP_SELECTORS.some((selector) => button.matches(selector));
  }

  function findStopButton() {
    for (const selector of STOP_SELECTORS) {
      for (const button of document.querySelectorAll(selector)) {
        if (button.disabled || button.getAttribute("aria-disabled") === "true") continue;
        if (typeof button.getClientRects === "function" && button.getClientRects().length === 0) continue;
        return button;
      }
    }
    return null;
  }

  function isChatIdle() {
    return !findStopButton();
  }

  async function sendPrompt(composer, prompt) {
    writeComposerText(composer, prompt);
    if (!await waitForComposerText(prompt, 1500)) throw new Error("composer_sync_failed");
    const button = await waitForSendButton(4000);
    if (button) button.click();
    else dispatchEnter(composer);
    if (!await waitForDispatchEvidence(4000)) throw new Error("dispatch_not_observed");
  }

  function writeComposerText(composer, text) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) throw new Error("composer_setter_unavailable");
      setter.call(composer, text);
      dispatchInput(composer, text);
      return;
    }
    if (composer.getAttribute("contenteditable") === "true") {
      composer.replaceChildren();
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      composer.appendChild(paragraph);
      dispatchInput(composer, text);
      return;
    }
    throw new Error("unsupported_composer");
  }

  function dispatchInput(composer, text) {
    if (typeof InputEvent === "function") {
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } else {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitForComposerText(expected, timeoutMs) {
    const expectedText = String(expected || "").trim();
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const composer = findComposer();
      if (composer && readComposerText(composer).trim().includes(expectedText)) return true;
      await sleep(100);
    }
    return false;
  }

  async function waitForSendButton(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const button = findSendButton();
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
      await sleep(100);
    }
    return null;
  }

  function findSendButton() {
    const composer = findComposer();
    const form = composer?.closest("form");
    for (const selector of [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="전송"]',
      'button[type="submit"]'
    ]) {
      const inside = form?.querySelector(selector);
      if (inside) return inside;
      const anywhere = document.querySelector(selector);
      if (anywhere) return anywhere;
    }
    return null;
  }

  function dispatchEnter(composer) {
    const options = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true };
    composer.dispatchEvent(new KeyboardEvent("keydown", options));
    composer.dispatchEvent(new KeyboardEvent("keyup", options));
  }

  async function waitForDispatchEvidence(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const composer = findComposer();
      if (!composer || !readComposerText(composer).trim() || !isChatIdle()) return true;
      await sleep(100);
    }
    return false;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
