export async function diagnoseConversationEndInPage() {
  const COMPOSER_SELECTORS = [
    "#prompt-textarea",
    'textarea[data-id="root"]',
    "main textarea",
    'main [contenteditable="true"]'
  ];
  const STOP_SELECTORS = [
    'button[data-testid="stop-button"]',
    'button[aria-label*="Stop"]',
    'button[aria-label*="stop"]',
    'button[aria-label*="\uC911\uC9C0"]'
  ];
  const LIMIT_PATTERNS = [
    /maximum\s+(?:conversation\s+)?length/i,
    /conversation\s+(?:has\s+)?reached[^.]{0,80}(?:limit|maximum)/i,
    /conversation\s+(?:is\s+)?too\s+long/i,
    /reached[^.]{0,80}(?:conversation\s+)?limit/i,
    /\uB300\uD654[^\n]{0,80}(?:\uCD5C\uB300\s*\uAE38\uC774|\uAE38\uC774\s*\uD55C\uB3C4|\uD55C\uB3C4\uC5D0\s*\uB3C4\uB2EC)/i,
    /(?:\uCD5C\uB300\s*\uAE38\uC774|\uAE38\uC774\s*\uD55C\uB3C4)[^\n]{0,80}\uB300\uD654/i
  ];
  const CONTINUE_NEW_CHAT_PATTERNS = [
    /continue[^\n]{0,80}(?:in|with|by|using)[^\n]{0,40}(?:a\s+)?new\s+chat/i,
    /start(?:ing)?[^\n]{0,40}(?:a\s+)?new\s+chat[^\n]{0,80}continue/i,
    /(?:\uC0C8|\uC0C8\uB85C\uC6B4)\s*(?:\uCC44\uD305|\uB300\uD654)[^\n]{0,80}\uACC4\uC18D/i,
    /\uACC4\uC18D[^\n]{0,80}(?:\uC0C8|\uC0C8\uB85C\uC6B4)\s*(?:\uCC44\uD305|\uB300\uD654)/i
  ];
  const START_NEW_CHAT_CTA_PATTERNS = [
    /^start(?:ing)?\s+(?:a\s+)?new\s+chat$/i,
    /^begin\s+(?:a\s+)?new\s+chat$/i,
    /^(?:\uC0C8|\uC0C8\uB85C\uC6B4)\s*(?:\uCC44\uD305|\uB300\uD654)\s*\uC2DC\uC791$/i
  ];

  const normalize = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const isVisible = (node) => {
    if (!node || node.hidden || node.getAttribute?.("aria-hidden") === "true") return false;
    if (typeof node.getClientRects === "function" && node.getClientRects().length === 0) return false;
    return true;
  };
  const isAuthoredTurn = (node) => Boolean(node?.closest?.('[data-message-author-role], [data-testid^="conversation-turn-"]'));
  const nodeLabel = (node) => normalize([
    node?.textContent,
    node?.getAttribute?.("aria-label"),
    node?.getAttribute?.("title"),
    node?.getAttribute?.("data-testid")
  ].filter(Boolean).join(" | "));
  const nodePrimaryLabel = (node) => normalize(
    node?.textContent || node?.getAttribute?.("aria-label") || node?.getAttribute?.("title") || ""
  );
  const matchesAny = (value, patterns) => patterns.some((pattern) => pattern.test(value));

  function findEndBannerSignal() {
    for (const node of document.querySelectorAll('button, a[href], [role="button"]')) {
      if (!isVisible(node) || isAuthoredTurn(node)) continue;
      const ctaLabel = nodePrimaryLabel(node);
      if (!ctaLabel || !matchesAny(ctaLabel, START_NEW_CHAT_CTA_PATTERNS)) continue;

      let ancestor = node.parentElement;
      for (let depth = 0; ancestor && depth < 5; depth += 1, ancestor = ancestor.parentElement) {
        if (isAuthoredTurn(ancestor)) break;
        const surroundingText = normalize(ancestor.textContent);
        if (!surroundingText || surroundingText.length > 1200) continue;
        if (matchesAny(surroundingText, LIMIT_PATTERNS)) {
          return `${surroundingText} | CTA: ${ctaLabel}`;
        }
      }
    }
    return "";
  }

  function sample() {
    const composerNodes = Array.from(document.querySelectorAll(COMPOSER_SELECTORS.join(",")));
    const usableComposer = composerNodes.some((composer) => {
      if (!isVisible(composer)) return false;
      if (composer.disabled || composer.readOnly) return false;
      if (composer.getAttribute?.("aria-disabled") === "true") return false;
      if (composer.hasAttribute?.("contenteditable") && composer.getAttribute("contenteditable") === "false") return false;
      return true;
    });

    let generationActive = false;
    for (const selector of STOP_SELECTORS) {
      for (const button of document.querySelectorAll(selector)) {
        if (!isVisible(button) || button.disabled || button.getAttribute?.("aria-disabled") === "true") continue;
        generationActive = true;
        break;
      }
      if (generationActive) break;
    }

    const endBannerSignal = findEndBannerSignal();
    const controls = [];
    const seen = new Set();
    const selector = [
      "main button",
      "main a[href]",
      'main [role="button"]',
      '[role="alert"]',
      '[role="status"]',
      "[aria-live]",
      '[data-testid*="limit"]',
      '[data-testid*="error"]',
      '[data-testid*="notice"]',
      '[data-testid*="new-chat"]'
    ].join(",");
    for (const node of document.querySelectorAll(selector)) {
      if (!isVisible(node) || isAuthoredTurn(node)) continue;
      const label = nodeLabel(node);
      if (!label || label.length > 500 || seen.has(label)) continue;
      seen.add(label);
      controls.push(label);
      if (controls.length >= 16) break;
    }
    if (endBannerSignal && !seen.has(endBannerSignal)) controls.unshift(endBannerSignal);

    const explicitLimitSignal = controls.find((value) => matchesAny(value, LIMIT_PATTERNS)) || "";
    const continueNewChatSignal = controls.find((value) => matchesAny(value, CONTINUE_NEW_CHAT_PATTERNS)) || "";
    return {
      usableComposer,
      composerCount: composerNodes.length,
      generationActive,
      endBannerSignal,
      explicitLimitSignal,
      continueNewChatSignal,
      controls: controls.slice(0, 16)
    };
  }

  const first = sample();
  await new Promise((resolve) => setTimeout(resolve, 700));
  const second = sample();
  const inConversation = /^\/c\//.test(String(location?.pathname || ""));

  let ended = null;
  let reason = "ambiguous_ui";
  if (second.endBannerSignal) {
    ended = true;
    reason = "conversation_end_banner";
  } else if (second.explicitLimitSignal) {
    ended = true;
    reason = "explicit_limit_ui";
  } else if (inConversation && second.continueNewChatSignal) {
    ended = true;
    reason = "continue_in_new_chat_ui";
  } else if (second.generationActive) {
    ended = false;
    reason = "generation_in_progress";
  } else if (second.usableComposer) {
    ended = false;
    reason = "usable_composer";
  } else if (!first.usableComposer && !second.usableComposer && !first.generationActive && !second.generationActive) {
    reason = "no_usable_composer_without_known_end_signal";
  }

  return {
    ended,
    reason,
    evidence: {
      inConversation,
      usableComposer: second.usableComposer,
      composerCount: second.composerCount,
      generationActive: second.generationActive,
      endBannerSignal: second.endBannerSignal,
      explicitLimitSignal: second.explicitLimitSignal,
      continueNewChatSignal: second.continueNewChatSignal,
      stableNoComposer: !first.usableComposer && !second.usableComposer
    },
    uiCandidates: second.controls
  };
}
