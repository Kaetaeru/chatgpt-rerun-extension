(() => {
  if (globalThis.__CHATGPT_RERUN_TURN_OBSERVER_LOADED__) return;
  globalThis.__CHATGPT_RERUN_TURN_OBSERVER_LOADED__ = true;

  const STABLE_IDLE_MS = 600;
  let currentTabId = null;
  let armedToken = null;
  let sawGenerating = false;
  let completionTimer = null;
  let lastCompletedToken = null;

  void registerCurrentTab();
  observeRuntimeChanges();
  observeChatGeneration();

  async function registerCurrentTab() {
    try {
      const response = await chrome.runtime.sendMessage({ type: "REGISTER_CHAT_TAB" });
      if (response?.ok && Number.isSafeInteger(response.tabId)) {
        currentTabId = response.tabId;
      }
    } catch {
      // The background worker may be restarting. Storage/runtime events can retry later.
    }
    return currentTabId;
  }

  function observeRuntimeChanges() {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      void handleRuntimeChanges(changes);
    });
  }

  async function handleRuntimeChanges(changes) {
    const tabId = currentTabId ?? await registerCurrentTab();
    if (!Number.isSafeInteger(tabId)) return;

    const key = `tabRuntime:${tabId}`;
    const change = changes[key];
    if (!change?.newValue) return;

    const before = change.oldValue || {};
    const after = change.newValue || {};
    if (!after.enabled) {
      disarmTurn();
      return;
    }

    if (after.lastSentAt && after.lastSentAt !== before.lastSentAt) {
      armTurn(`sent:${after.lastSentAt}`);
      return;
    }

    if (
      after.bootstrapPending &&
      (!before.bootstrapPending || after.bootstrapRequestedAt !== before.bootstrapRequestedAt)
    ) {
      armTurn(`bootstrap:${after.bootstrapRequestedAt || Date.now()}`);
    }
  }

  function observeChatGeneration() {
    const observer = new MutationObserver(() => {
      evaluateGenerationState();
    });

    observer.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "aria-disabled", "data-testid", "aria-label"]
    });
  }

  function armTurn(token) {
    if (!token || token === lastCompletedToken) return;
    armedToken = token;
    sawGenerating = !isChatIdle();
    clearCompletionTimer();
    evaluateGenerationState();
  }

  function disarmTurn() {
    armedToken = null;
    sawGenerating = false;
    clearCompletionTimer();
  }

  function evaluateGenerationState() {
    if (!armedToken) return;

    const generating = !isChatIdle();
    if (generating) {
      sawGenerating = true;
      clearCompletionTimer();
      return;
    }

    if (!sawGenerating) return;
    if (completionTimer !== null) return;

    completionTimer = setTimeout(() => {
      completionTimer = null;
      void completeTurnIfStable();
    }, STABLE_IDLE_MS);
  }

  async function completeTurnIfStable() {
    if (!armedToken || !sawGenerating || !isChatIdle()) return;
    if (findGitHubApprovalCard()) return;

    const token = armedToken;
    disarmTurn();
    if (token === lastCompletedToken) return;
    lastCompletedToken = token;

    try {
      await chrome.runtime.sendMessage({
        type: "TURN_FINISHED",
        executionToken: token
      });
    } catch {
      // Recovery polling remains active in content.js/background.js.
    }
  }

  function clearCompletionTimer() {
    if (completionTimer === null) return;
    clearTimeout(completionTimer);
    completionTimer = null;
  }

  function isChatIdle() {
    const stopSelectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[aria-label*="중지"]'
    ];
    return !stopSelectors.some((selector) => document.querySelector(selector));
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
          return node;
        }
      }
    }
    return null;
  }

  function normalizeUiText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
})();
