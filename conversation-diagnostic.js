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
    'button[aria-label*="중지"]'
  ];
  const LIMIT_PATTERNS = [
    /maximum\s+(?:conversation\s+)?length/i,
    /conversation\s+(?:has\s+)?reached[^.]{0,80}(?:limit|maximum)/i,
    /conversation\s+(?:is\s+)?too\s+long/i,
    /reached[^.]{0,80}(?:conversation\s+)?limit/i,
    /대화[^\n]{0,80}(?:최대\s*길이|길이\s*한도|한도에\s*도달)/i,
    /(?:최대\s*길이|길이\s*한도)[^\n]{0,80}대화/i
  ];
  const CONTINUE_NEW_CHAT_PATTERNS = [
    /continue[^\n]{0,80}(?:in|with|by|using)[^\n]{0,40}(?:a\s+)?new\s+chat/i,
    /start(?:ing)?[^\n]{0,40}(?:a\s+)?new\s+chat[^\n]{0,80}continue/i,
    /(?:새|새로운)\s*(?:채팅|대화)[^\n]{0,80}계속/i,
    /계속[^\n]{0,80}(?:새|새로운)\s*(?:채팅|대화)/i
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
  const matchesAny = (value, patterns) => patterns.some((pattern) => pattern.test(value));

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

    const controls = [];
    const seen = new Set();
    const selector = [
      "main button",
      "main a[href]",
      'main [role="button"]',
      'main [role="alert"]',
      'main [role="status"]',
      "main [aria-live]",
      'main [data-testid*="limit"]',
      'main [data-testid*="error"]',
      'main [data-testid*="notice"]',
      'main [data-testid*="new-chat"]'
    ].join(",");
    for (const node of document.querySelectorAll(selector)) {
      if (!isVisible(node) || isAuthoredTurn(node)) continue;
      const label = nodeLabel(node);
      if (!label || label.length > 500 || seen.has(label)) continue;
      seen.add(label);
      controls.push(label);
      if (controls.length >= 16) break;
    }

    const explicitLimitSignal = controls.find((value) => matchesAny(value, LIMIT_PATTERNS)) || "";
    const continueNewChatSignal = controls.find((value) => matchesAny(value, CONTINUE_NEW_CHAT_PATTERNS)) || "";
    return {
      usableComposer,
      composerCount: composerNodes.length,
      generationActive,
      explicitLimitSignal,
      continueNewChatSignal,
      controls
    };
  }

  const first = sample();
  await new Promise((resolve) => setTimeout(resolve, 700));
  const second = sample();
  const inConversation = /^\/c\//.test(String(location?.pathname || ""));

  let ended = null;
  let reason = "ambiguous_ui";
  if (second.generationActive) {
    ended = false;
    reason = "generation_in_progress";
  } else if (second.explicitLimitSignal) {
    ended = true;
    reason = "explicit_limit_ui";
  } else if (inConversation && second.continueNewChatSignal) {
    ended = true;
    reason = "continue_in_new_chat_ui";
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
      explicitLimitSignal: second.explicitLimitSignal,
      continueNewChatSignal: second.continueNewChatSignal,
      stableNoComposer: !first.usableComposer && !second.usableComposer
    },
    uiCandidates: second.controls
  };
}
