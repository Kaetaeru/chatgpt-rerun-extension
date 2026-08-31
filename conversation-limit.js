(() => {
  if (globalThis.__CHATGPT_RERUN_V2_CONVERSATION_LIMIT__) return;
  globalThis.__CHATGPT_RERUN_V2_CONVERSATION_LIMIT__ = true;

  const CHECK_MS = 1500;
  const COMPOSER_MISSING_GRACE_MS = 5000;
  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    'textarea[data-id="root"]',
    "main textarea",
    'main [contenteditable="true"]'
  ];
  const LIMIT_PATTERNS = [
    /you(?:'|’)ve reached the maximum length for this conversation/i,
    /this conversation (?:has )?reached (?:its|the) maximum length/i,
    /maximum length for this conversation[\s\S]{0,120}start(?:ing)? a new chat/i,
    /이 대화(?:는|가|의)?\s*최대\s*길이(?:에)?\s*도달/i,
    /대화(?:가|는)?[\s\S]{0,80}최대\s*길이[\s\S]{0,120}새\s*채팅/i
  ];

  let checking = false;
  let handoffRequested = false;
  let missingComposerSince = null;

  const observer = new MutationObserver(() => { void check(); });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(() => { void check(); }, CHECK_MS);
  void check();

  async function check() {
    if (checking || handoffRequested) return;
    checking = true;
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
      if (!state?.ok) return;
      const runtime = state.runtime || {};
      if (!runtime.enabled || !runtime.runId || runtime.status !== "running") {
        missingComposerSince = null;
        return;
      }

      if (findConversationLimitNotice()) {
        await requestHandoff("conversation_max_length");
        return;
      }

      if (runtime.phase !== "ready") {
        missingComposerSince = null;
        return;
      }

      if (findUsableComposer()) {
        missingComposerSince = null;
        return;
      }

      if (missingComposerSince === null) {
        missingComposerSince = Date.now();
        return;
      }
      if (Date.now() - missingComposerSince < COMPOSER_MISSING_GRACE_MS) return;
      await requestHandoff("composer_unusable");
    } catch {
      // Background service worker or the page may be transitioning. Retry on the next check.
    } finally {
      checking = false;
    }
  }

  async function requestHandoff(reason) {
    handoffRequested = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "HANDOFF_NEW_CHAT", reason });
      if (!response?.ok) handoffRequested = false;
    } catch {
      handoffRequested = false;
    }
  }

  function findConversationLimitNotice() {
    const bodyText = normalizeText(document.body?.textContent);
    if (!matchesConversationLimitText(bodyText)) return null;

    const selectors = [
      '[role="alert"]',
      '[role="status"]',
      '[aria-live="assertive"]',
      '[aria-live="polite"]',
      '[data-testid*="error"]',
      '[data-testid*="limit"]',
      "main *"
    ].join(",");

    for (const node of document.querySelectorAll(selectors)) {
      if (node.closest?.('[data-message-author-role], [data-testid^="conversation-turn-"]')) continue;
      const text = normalizeText(node.textContent);
      if (!text || text.length > 700 || !matchesConversationLimitText(text)) continue;
      if (!isVisible(node)) continue;
      return node;
    }
    return null;
  }

  function matchesConversationLimitText(value) {
    const text = normalizeText(value);
    return LIMIT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function findUsableComposer() {
    for (const selector of COMPOSER_SELECTORS) {
      for (const composer of document.querySelectorAll(selector)) {
        if (!isVisible(composer)) continue;
        if (composer.disabled || composer.readOnly) continue;
        if (composer.getAttribute?.("aria-disabled") === "true") continue;
        if (composer.hasAttribute?.("contenteditable") && composer.getAttribute("contenteditable") === "false") continue;
        return composer;
      }
    }
    return null;
  }

  function isVisible(node) {
    if (!node) return false;
    if (node.hidden || node.getAttribute?.("aria-hidden") === "true") return false;
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    return true;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }
})();
