(() => {
  if (globalThis.__CHATGPT_RERUN_CONTENT_LOADED__) return;
  globalThis.__CHATGPT_RERUN_CONTENT_LOADED__ = true;

  const BASE_TICK_MS = 2000;
  let ticking = false;

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

  void chrome.runtime.sendMessage({ type: "REGISTER_CHAT_TAB" }).catch(() => {});
  setInterval(tick, BASE_TICK_MS);
  void tick();

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      const response = await chrome.runtime.sendMessage({ type: "POLL" });
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

      if (readComposerText(composer).trim()) {
        await chrome.runtime.sendMessage({ type: "STOP_SESSION", reason: "composer_not_empty" });
        return;
      }

      const claim = await chrome.runtime.sendMessage({
        type: "CLAIM_SEQUENCE",
        runId: control.runId,
        sequence: control.sequence
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
        await chrome.runtime.sendMessage({
          type: "RELEASE_SEQUENCE",
          runId: control.runId,
          sequence: control.sequence
        });
        await chrome.runtime.sendMessage({
          type: "STOP_SESSION",
          reason: `send_failed: ${error instanceof Error ? error.message : String(error)}`
        });
      }
    } catch {
      // The background worker may be restarting. A later tick will retry.
    } finally {
      ticking = false;
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

  function isChatIdle() {
    const stopSelectors = [
      'button[data-testid="stop-button"]',
      'button[aria-label*="Stop"]',
      'button[aria-label*="stop"]',
      'button[aria-label*="중지"]'
    ];
    return !stopSelectors.some((selector) => document.querySelector(selector));
  }

  async function sendPrompt(composer, prompt) {
    writeComposerText(composer, prompt);

    if (!await waitForComposerText(composer, prompt, 1500)) {
      throw new Error("prompt text did not synchronize with the ChatGPT composer");
    }

    const sendButton = await waitForSendButton(4000);
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
