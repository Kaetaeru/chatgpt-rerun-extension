(() => {
  if (globalThis.__PATIENT_ORACLE_CONTENT_LOADED__) return;
  globalThis.__PATIENT_ORACLE_CONTENT_LOADED__ = true;

  const ORACLE_CONTENT_PORT = "patient-oracle-content";
  const BASE_TICK_MS = 2000;
  const STABLE_IDLE_MS = 600;

  let port = null;
  let reconnectTimer = null;
  let armedToken = null;
  let sawGenerating = false;
  let lastCompletedToken = null;
  let completionTimer = null;
  let idleSince = null;
  let checkpointTimer = null;
  let hardStopTimer = null;
  let hardStopAtMs = null;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "PATIENT_ORACLE_PING") {
      sendResponse({ ready: true });
      return;
    }

    if (message?.type === "PATIENT_ORACLE_PROMPT") {
      sendOraclePrompt(
        String(message.prompt || ""),
        String(message.executionToken || ""),
        String(message.checkpointAt || ""),
        String(message.hardStopAt || "")
      )
        .then(() => sendResponse({ sent: true }))
        .catch((error) => sendResponse({
          sent: false,
          error: error instanceof Error ? error.message : String(error)
        }));
      return true;
    }
  });

  connectPort();

  const observer = new MutationObserver(() => observeLifecycle());
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true
  });

  setInterval(() => {
    observeLifecycle();
    postToPort({
      type: "PATIENT_ORACLE_POLL",
      idleStableForMs: idleSince === null ? 0 : Math.max(0, Date.now() - idleSince),
      approvalVisible: Boolean(findGitHubApprovalCard()),
      hardStopReached: Number.isFinite(hardStopAtMs) && Date.now() >= hardStopAtMs
    });
  }, BASE_TICK_MS);

  observeLifecycle();

  function connectPort() {
    if (port) return;
    try {
      port = chrome.runtime.connect({ name: ORACLE_CONTENT_PORT });
      port.onDisconnect.addListener(() => {
        port = null;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connectPort, 1000);
      });
    } catch {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(connectPort, 1000);
    }
  }

  function postToPort(message) {
    if (!port) connectPort();
    try {
      port?.postMessage(message);
    } catch {
      port = null;
      connectPort();
    }
  }

  async function sendOraclePrompt(prompt, executionToken, checkpointAt, hardStopAt) {
    if (!prompt.trim()) throw new Error("Patient Oracle prompt is empty");
    if (!executionToken.trim()) throw new Error("Patient Oracle execution token is missing");
    if (!isChatIdle()) throw new Error("ChatGPT tab is still generating");
    if (findGitHubApprovalCard()) throw new Error("GitHub approval is pending; Patient Oracle will not dispatch");

    const checkpointMs = Date.parse(checkpointAt);
    const hardStopMs = Date.parse(hardStopAt);
    if (!Number.isFinite(checkpointMs) || !Number.isFinite(hardStopMs) || checkpointMs >= hardStopMs) {
      throw new Error("Patient Oracle execution budget is invalid");
    }
    if (hardStopMs <= Date.now()) throw new Error("Patient Oracle hard stop already elapsed");

    const composer = await waitForComposer(10_000);
    if (!composer) throw new Error("ChatGPT composer was not found");
    if (readComposerText(composer).trim()) {
      throw new Error("ChatGPT composer is not empty; user draft is protected");
    }

    writeComposerText(composer, prompt);
    if (!await waitForComposerText(composer, prompt, 1500)) {
      throw new Error("Patient Oracle prompt text did not synchronize with the ChatGPT composer");
    }

    armExecution(executionToken, checkpointMs, hardStopMs);
    const sendButton = await waitForSendButton(4000);
    if (sendButton) sendButton.click();
    else dispatchEnter(composer);

    if (!await waitForDispatchEvidence(4000)) {
      disarmExecution(executionToken);
      throw new Error(sendButton
        ? "Patient Oracle prompt inserted but send button click did not start sending"
        : "Patient Oracle prompt inserted but Enter fallback did not start sending");
    }
    observeLifecycle();
  }

  function armExecution(executionToken, checkpointMs, hardStopMs) {
    clearBudgetTimers();
    armedToken = executionToken;
    sawGenerating = false;
    hardStopAtMs = hardStopMs;

    const checkpointDelay = Math.max(0, checkpointMs - Date.now());
    checkpointTimer = setTimeout(() => {
      if (!armedToken || armedToken !== executionToken) return;
      postToPort({ type: "PATIENT_ORACLE_CHECKPOINT_DUE", executionToken });
    }, checkpointDelay);

    const hardStopDelay = Math.max(0, hardStopMs - Date.now());
    hardStopTimer = setTimeout(() => {
      enforceHardStop(executionToken);
    }, hardStopDelay);

    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = null;
    observeLifecycle();
  }

  function disarmExecution(executionToken) {
    if (executionToken && armedToken !== executionToken) return;
    armedToken = null;
    sawGenerating = false;
    hardStopAtMs = null;
    clearBudgetTimers();
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = null;
  }

  function clearBudgetTimers() {
    if (checkpointTimer) clearTimeout(checkpointTimer);
    if (hardStopTimer) clearTimeout(hardStopTimer);
    checkpointTimer = null;
    hardStopTimer = null;
  }

  function enforceHardStop(executionToken) {
    if (!armedToken || armedToken !== executionToken) return;

    // Never touch approval controls. A stop-generation control is the only UI action
    // allowed here, and only as a final local failsafe for the inherited 20-minute law.
    const stopButton = findStopButton();
    if (stopButton) stopButton.click();

    postToPort({
      type: "PATIENT_ORACLE_HARD_STOP",
      executionToken,
      approvalVisible: Boolean(findGitHubApprovalCard()),
      stopClicked: Boolean(stopButton)
    });
    disarmExecution(executionToken);
  }

  function observeLifecycle() {
    const approvalVisible = Boolean(findGitHubApprovalCard());
    const idle = isChatIdle();

    if (approvalVisible || !idle) {
      idleSince = null;
      if (!idle && armedToken) sawGenerating = true;
      if (completionTimer) clearTimeout(completionTimer);
      completionTimer = null;
      return;
    }

    if (idleSince === null) idleSince = Date.now();
    if (!armedToken || !sawGenerating || armedToken === lastCompletedToken) return;
    if (completionTimer) return;

    completionTimer = setTimeout(() => {
      completionTimer = null;
      completeTurnIfStable();
    }, STABLE_IDLE_MS);
  }

  function completeTurnIfStable() {
    if (!armedToken || !sawGenerating || !isChatIdle()) return;
    if (findGitHubApprovalCard()) return;
    if (idleSince === null || Date.now() - idleSince < STABLE_IDLE_MS) return;
    if (armedToken === lastCompletedToken) return;

    const executionToken = armedToken;
    lastCompletedToken = executionToken;
    disarmExecution(executionToken);
    postToPort({ type: "PATIENT_ORACLE_TURN_FINISHED", executionToken });
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

  function findStopButton() {
    const selectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[aria-label*="중지"]'
    ];
    for (const selector of selectors) {
      const button = document.querySelector(selector);
      if (button) return button;
    }
    return null;
  }

  function isChatIdle() {
    return !findStopButton();
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
      composer.dispatchEvent(new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      }));
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
      if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") return button;
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
          // Patient Oracle deliberately never clicks approval/OAuth/admin controls.
          return node;
        }
      }
    }
    return null;
  }

  function normalizeUiText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
