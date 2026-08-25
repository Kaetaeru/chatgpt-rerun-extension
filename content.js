(() => {
  if (globalThis.__CHATGPT_RERUN_CONTENT_LOADED__) return;
  globalThis.__CHATGPT_RERUN_CONTENT_LOADED__ = true;

  const BASE_TICK_MS = 2000;
  const GENERATION_WATCHDOG_MS = 23 * 60 * 1000;
  const GENERATION_START_GRACE_MS = 15_000;
  const STOP_BUTTON_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="중지"]'
  ];
  let ticking = false;
  let currentTabId = null;
  let generationStartedAtMs = null;
  let generationPausedAtMs = null;
  let generationPausedTotalMs = 0;
  let generationWatchdogFired = false;
  let generationInterruptedByUser = false;
  let normalContinuationPending = false;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "RERUN_PING") {
      sendResponse({ ready: true });
      return;
    }

    if (message?.type === "RERUN_WAKE") {
      sendResponse({ ready: true });
      void tick();
      return;
    }

    if (["RERUN_HANDOFF", "RERUN_BOOTSTRAP", "RERUN_CONNECT"].includes(message?.type)) {
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
    if (!event.isTrusted || generationStartedAtMs === null || generationWatchdogFired) return;
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && isStopButtonElement(button)) {
      generationInterruptedByUser = true;
    }
  }, true);

  void registerCurrentTab();
  setInterval(tick, BASE_TICK_MS);
  void tick();

  async function registerCurrentTab() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "REGISTER_CHAT_TAB" });
      if (response?.ok && Number.isSafeInteger(response.tabId)) {
        currentTabId = response.tabId;
      }
    } catch {
      // The background worker may be restarting. A later call can resolve it.
    }
    return currentTabId;
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const watcherEnabled = await isRerunWatcherEnabled();
      if (!watcherEnabled) {
        resetGenerationWatchdog();
        normalContinuationPending = false;
      }

      const approvalWaiting = Boolean(findGitHubApprovalCard());
      if (watcherEnabled && await enforceGenerationWatchdog(approvalWaiting)) return;
      if (watcherEnabled && approvalWaiting && await isApprovalAwareResumeEnabled()) return;

      const afterGenerationComplete = normalContinuationPending;
      const response = await chrome.runtime.sendMessage({
        type: "POLL",
        afterGenerationComplete
      });
      if (response && afterGenerationComplete) {
        normalContinuationPending = false;
      }
      if (!response?.ok) return;

      if (response.action === "stop_when_idle") {
        if (isChatIdle()) {
          await chrome.runtime.sendMessage({
            type: "STOP_SESSION",
            reason: response.reason || "stopped"
          });
        }
        return;
      }

      if (response.action !== "continue") return;

      const { control, prompt } = response;
      if (!control || !isChatIdle()) return;

      const composer = findComposer();
      if (!composer) return;

      const existingComposerText = readComposerText(composer).trim();
      const staleRerunPrompt = isSameRerunPrompt(existingComposerText, prompt);
      if (existingComposerText && !staleRerunPrompt) {
        await chrome.runtime.sendMessage({ type: "STOP_SESSION", reason: "composer_not_empty" });
        return;
      }

      if (staleRerunPrompt) {
        const handoff = await handoffAfterDispatchFailure();
        if (handoff?.ok) return;

        await chrome.runtime.sendMessage({
          type: "STOP_SESSION",
          reason: `auto_handoff_failed: ${handoff?.error || "stale Rerun prompt could not be handed off"}`
        });
        return;
      }

      const claim = await chrome.runtime.sendMessage({
        type: "CLAIM_SEQUENCE",
        runId: control.runId,
        sequence: control.sequence,
        normalContinuation: Boolean(response.normalContinuation)
      });
      if (!claim?.ok || !claim.claimed) return;

      try {
        await sendPrompt(composer, prompt);
        await chrome.runtime.sendMessage({
          type: "ACK_SEQUENCE",
          runId: control.runId,
          sequence: control.sequence
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await chrome.runtime.sendMessage({
          type: "RELEASE_SEQUENCE",
          runId: control.runId,
          sequence: control.sequence
        });

        if (isConfirmedDispatchFailure(detail)) {
          const handoff = await handoffAfterDispatchFailure();
          if (handoff?.ok) return;

          await chrome.runtime.sendMessage({
            type: "STOP_SESSION",
            reason: `auto_handoff_failed: ${handoff?.error || detail}`
          });
          return;
        }

        await chrome.runtime.sendMessage({
          type: "STOP_SESSION",
          reason: `send_failed: ${detail}`
        });
      }
    } catch {
      // The background worker may be restarting. A later tick will retry.
    } finally {
      ticking = false;
    }
  }

  function armGenerationWatchdog(startedAtMs = Date.now()) {
    generationStartedAtMs = startedAtMs;
    generationPausedAtMs = null;
    generationPausedTotalMs = 0;
    generationWatchdogFired = false;
    generationInterruptedByUser = false;
  }

  async function enforceGenerationWatchdog(approvalWaiting, nowMs = Date.now()) {
    if (generationStartedAtMs === null) return false;

    if (approvalWaiting) {
      if (generationPausedAtMs === null) {
        generationPausedAtMs = nowMs;
      }
      return false;
    }

    if (generationPausedAtMs !== null) {
      generationPausedTotalMs += Math.max(0, nowMs - generationPausedAtMs);
      generationPausedAtMs = null;
    }

    const stopButton = findStopButton();
    if (!stopButton) {
      if (nowMs - generationStartedAtMs < GENERATION_START_GRACE_MS) return false;
      const completedNormally = !generationWatchdogFired && !generationInterruptedByUser;
      resetGenerationWatchdog();
      if (completedNormally) normalContinuationPending = true;
      return false;
    }

    const activeGenerationMs = Math.max(
      0,
      nowMs - generationStartedAtMs - generationPausedTotalMs
    );
    if (activeGenerationMs < GENERATION_WATCHDOG_MS || generationWatchdogFired) {
      return false;
    }

    generationWatchdogFired = true;
    await rearmContinuationAfterWatchdogStop();
    stopButton.click();
    return true;
  }

  async function rearmContinuationAfterWatchdogStop() {
    const tabId = currentTabId ?? await registerCurrentTab();
    if (!Number.isSafeInteger(tabId)) return;

    try {
      const key = `tabRuntime:${tabId}`;
      const stored = await chrome.storage.local.get(key);
      const runtime = stored[key];
      if (!runtime?.enabled) return;

      await chrome.storage.local.set({
        [key]: {
          ...runtime,
          sameSequenceRetryCount: 0,
          pendingSequence: null,
          pendingRunId: null,
          pendingIsRetry: false,
          lastError: null
        }
      });
    } catch {
      // The next content tick can still recover from a fresh GitHub authorization.
    }
  }

  function resetGenerationWatchdog() {
    generationStartedAtMs = null;
    generationPausedAtMs = null;
    generationPausedTotalMs = 0;
    generationWatchdogFired = false;
    generationInterruptedByUser = false;
  }

  async function isRerunWatcherEnabled() {
    const tabId = currentTabId ?? await registerCurrentTab();
    if (!Number.isSafeInteger(tabId)) return false;

    try {
      const key = `tabRuntime:${tabId}`;
      const stored = await chrome.storage.local.get(key);
      return Boolean(stored[key]?.enabled);
    } catch {
      return false;
    }
  }

  async function isApprovalAwareResumeEnabled() {
    const tabId = currentTabId ?? await registerCurrentTab();
    if (!Number.isSafeInteger(tabId)) return false;

    try {
      const key = `tabConfig:${tabId}`;
      const stored = await chrome.storage.local.get(key);
      return Boolean(stored[key]?.approvalAwareResume);
    } catch {
      return false;
    }
  }

  function findGitHubApprovalCard() {
    const buttons = Array.from(document.querySelectorAll("button"));
    for (const button of buttons) {
      const buttonText = normalizeUiText([
        button.textContent,
        button.getAttribute("aria-label")
      ].filter(Boolean).join(" "));
      if (!/^(허용(?:하기)?|Allow)(?:\s|$)/i.test(buttonText)) continue;

      let node = button;
      for (let depth = 0; node && depth < 10; depth += 1, node = node.parentElement) {
        const text = normalizeUiText(node.textContent);
        if (!text || text.length > 1600 || !text.includes("GitHub")) continue;
        if (
          /ChatGPT가\s*GitHub.*사용하도록\s*허용할까요/i.test(text) ||
          /allow\s+ChatGPT\s+to\s+use\s+GitHub/i.test(text)
        ) {
          // Deliberately do not click the approval button. Manual confirmation remains required.
          return node;
        }
      }
    }
    return null;
  }

  function normalizeUiText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isSameRerunPrompt(existing, expected) {
    const existingText = normalizeComposerText(existing);
    const expectedText = normalizeComposerText(expected);
    return Boolean(existingText && expectedText && existingText === expectedText);
  }

  function normalizeComposerText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isConfirmedDispatchFailure(detail) {
    const message = String(detail || "");
    return message.startsWith("prompt inserted but ") ||
      message === "prompt text did not synchronize with the ChatGPT composer";
  }

  async function handoffAfterDispatchFailure() {
    const tabId = currentTabId ?? await registerCurrentTab();
    if (!Number.isSafeInteger(tabId)) {
      return { ok: false, error: "current ChatGPT tab ID is unavailable for automatic handoff" };
    }

    try {
      return await chrome.runtime.sendMessage({
        type: "HANDOFF_NEW_CHAT",
        tabId
      });
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async function sendDirectPrompt(prompt) {
    if (!prompt.trim()) throw new Error("direct prompt is empty");
    if (!isChatIdle()) throw new Error("ChatGPT 탭이 아직 응답 생성 중입니다.");

    const composer = await waitForComposer(10_000);
    if (!composer) throw new Error("ChatGPT 탭에서 입력창을 찾지 못했습니다.");
    if (readComposerText(composer).trim()) {
      throw new Error("ChatGPT 탭 입력창이 비어 있지 않습니다.");
    }

    await sendPrompt(composer, prompt);
  }

  function findComposer() {
    return (
      document.querySelector("#prompt-textarea") ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector("main textarea") ||
      document.querySelector('main [contenteditable="true"]')
    );
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
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      return composer.value || "";
    }
    return composer.textContent || "";
  }

  function isStopButtonElement(button) {
    return STOP_BUTTON_SELECTORS.some((selector) => button.matches(selector));
  }

  function findStopButton() {
    for (const selector of STOP_BUTTON_SELECTORS) {
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

    if (!await waitForComposerText(composer, prompt, 1500)) {
      throw new Error("prompt text did not synchronize with the ChatGPT composer");
    }

    const sendButton = await waitForSendButton(4000);
    const dispatchStartedAtMs = Date.now();
    if (sendButton) {
      sendButton.click();
    } else {
      dispatchEnter(composer);
    }

    if (!await waitForDispatchEvidence(4000)) {
      throw new Error(sendButton
        ? "prompt inserted but send button click did not start sending"
        : "prompt inserted but Enter fallback did not start sending");
    }

    armGenerationWatchdog(dispatchStartedAtMs);
  }

  function writeComposerText(composer, text) {
    composer.focus();

    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) throw new Error("composer value setter unavailable");
      setter.call(composer, text);
      dispatchComposerInput(composer, text);
      return;
    }

    if (composer.getAttribute("contenteditable") === "true") {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);

      if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) {
        dispatchComposerInput(composer, text);
        return;
      }

      composer.replaceChildren();
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      composer.appendChild(paragraph);
      dispatchComposerInput(composer, text);
      return;
    }

    throw new Error("unsupported ChatGPT composer element");
  }

  function dispatchComposerInput(composer, text) {
    if (typeof InputEvent === "function") {
      composer.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text
        })
      );
    } else {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function waitForComposerText(composer, expected, timeoutMs) {
    const expectedText = String(expected || "").trim();
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const current = findComposer() || composer;
      const currentText = readComposerText(current).trim();
      if (currentText === expectedText || currentText.includes(expectedText)) return true;
      await sleep(100);
    }
    return false;
  }

  async function waitForSendButton(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const button = findSendButton();
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") {
        return button;
      }
      await sleep(100);
    }
    return null;
  }

  function findSendButton() {
    const composer = findComposer();
    const form = composer?.closest("form");
    const selectors = [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]',
      'button[aria-label*="send"]',
      'button[aria-label*="전송"]',
      'button[type="submit"]'
    ];

    for (const selector of selectors) {
      const insideForm = form?.querySelector(selector);
      if (insideForm) return insideForm;
      const anywhere = document.querySelector(selector);
      if (anywhere) return anywhere;
    }
    return null;
  }

  function dispatchEnter(composer) {
    composer.focus();
    const options = {
      key: "Enter",
      code: "Enter",
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    };
    composer.dispatchEvent(new KeyboardEvent("keydown", options));
    composer.dispatchEvent(new KeyboardEvent("keyup", options));
  }

  async function waitForDispatchEvidence(timeoutMs) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      const current = findComposer();
      if (!current) return true;
      if (!readComposerText(current).trim()) return true;
      if (!isChatIdle()) return true;
      await sleep(100);
    }
    return false;
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
