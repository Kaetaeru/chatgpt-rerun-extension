(() => {
  const REVISION = "chat-only-artifact-retry-v2212-20260902";
  if (globalThis.__CHATGPT_RERUN_V2_CHAT_GUARD__ === REVISION) return;
  globalThis.__CHATGPT_RERUN_V2_CHAT_GUARD__ = REVISION;

  const TICK_MS = 250;
  const GUARD_MARKER = "RERUN_CHAT_ONLY_ARTIFACT_RETRY";
  const RERUN_PROMPT_PATTERNS = [
    /You are preparing the next ChatGPT Rerun V2 goal\./,
    /You are preparing ChatGPT Rerun Worker \d+ of \d+\./,
    /You are executing a ChatGPT Rerun V2 Goal Runner task\./
  ];
  const GUARD_TEXT = `\n\n${GUARD_MARKER}\n- Use this standard Chat conversation only. Do NOT switch to or invoke ChatGPT Work, Work mode, Canvas, Projects, or any other workspace/agent surface. Keep all repository work and artifact creation inside this Chat conversation using the connected tools available here.\n- Any rerun-goal-*.json, rerun-worker-ready-*.json, or rerun-result-*.json required by this prompt is mandatory. If creating, writing, attaching, reopening, or verifying the required JSON fails for any reason, retry that artifact operation in this same response as many times as needed until a fresh downloadable file is successfully created, reopened, and verified. Do not end the response with prose only, an unverified file, or a file-creation error while another retry is possible.\n- The downloadable JSON and its required transport mirror must both be produced before you finish the response.`;

  let recovering = false;

  document.addEventListener("input", (event) => {
    const composer = closestComposer(event.target) || findComposer();
    if (composer) decorateComposer(composer);
  }, true);

  const observer = new MutationObserver(() => {
    const composer = findComposer();
    if (composer) decorateComposer(composer);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  setInterval(() => { void recoverOwnedDispatchDraft(); }, TICK_MS);
  queueMicrotask(() => {
    const composer = findComposer();
    if (composer) decorateComposer(composer);
    void recoverOwnedDispatchDraft();
  });

  async function recoverOwnedDispatchDraft() {
    if (recovering) return;
    recovering = true;
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_CURRENT_STATE" });
      if (!state?.ok) return;
      const runtime = state.runtime || {};
      const composer = findComposer();
      if (!composer) return;

      decorateComposer(composer);
      const draft = readComposerText(composer).trim();
      if (!isOwnedExecutionDraft(draft, runtime)) return;

      if (runtime.status === "running" && runtime.phase === "ready") {
        clearComposer(composer);
        return;
      }

      if (runtime.status === "paused" && String(runtime.lastError || "") === "dispatch_not_observed") {
        clearComposer(composer);
        const registration = await chrome.runtime.sendMessage({ type: "REGISTER_CHAT_TAB" });
        if (!registration?.ok || !Number.isSafeInteger(registration.tabId)) return;
        await chrome.runtime.sendMessage({ type: "RESUME_GOAL", tabId: registration.tabId });
      }
    } catch {
      // The primary content script/background loop will retry on the next guard tick.
    } finally {
      recovering = false;
    }
  }

  function decorateComposer(composer) {
    const text = readComposerText(composer);
    if (!looksLikeRerunPrompt(text) || text.includes(GUARD_MARKER)) return false;
    writeComposerText(composer, `${text.trimEnd()}${GUARD_TEXT}`);
    return true;
  }

  function looksLikeRerunPrompt(value) {
    const text = String(value || "");
    return RERUN_PROMPT_PATTERNS.some((pattern) => pattern.test(text));
  }

  function isOwnedExecutionDraft(value, runtime) {
    const text = String(value || "");
    const runId = String(runtime?.runId || "").trim();
    const goalId = String(runtime?.goalId || "").trim();
    if (!runId || !goalId) return false;
    return text.includes("You are executing a ChatGPT Rerun V2 Goal Runner task.") &&
      text.includes(`Run ID: ${runId}`) &&
      text.includes(`Goal ID: ${goalId}`);
  }

  function closestComposer(node) {
    if (!(node instanceof Element)) return null;
    if (node.matches?.("#prompt-textarea, textarea[data-id='root'], main textarea, main [contenteditable='true']")) return node;
    return node.closest?.("#prompt-textarea, textarea[data-id='root'], main textarea, main [contenteditable='true']") || null;
  }

  function findComposer() {
    return document.querySelector("#prompt-textarea") ||
      document.querySelector('textarea[data-id="root"]') ||
      document.querySelector("main textarea") ||
      document.querySelector('main [contenteditable="true"]');
  }

  function readComposerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value || "";
    return composer.textContent || "";
  }

  function writeComposerText(composer, text) {
    composer.focus?.();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const prototype = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) return;
      setter.call(composer, text);
      dispatchInput(composer, text);
      return;
    }
    if (composer.getAttribute?.("contenteditable") === "true") {
      composer.replaceChildren();
      const paragraph = document.createElement("p");
      paragraph.textContent = text;
      composer.appendChild(paragraph);
      dispatchInput(composer, text);
    }
  }

  function clearComposer(composer) {
    writeComposerText(composer, "");
  }

  function dispatchInput(composer, text) {
    if (typeof InputEvent === "function") {
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    } else {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }
})();
