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
  }
});

setInterval(tick, BASE_TICK_MS);
tick();

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

function findComposer() {
  return (
    document.querySelector("#prompt-textarea") ||
    document.querySelector('textarea[data-id="root"]') ||
    document.querySelector("main textarea") ||
    document.querySelector('main [contenteditable="true"]')
  );
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

  const sendButton = await waitForSendButton(2500);
  if (!sendButton) throw new Error("send button not found or did not become enabled");
  if (!isChatIdle()) throw new Error("ChatGPT started generating before send");

  sendButton.click();
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
    composer.dispatchEvent(new Event("input", { bubbles: true }));
    composer.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }

  if (composer.getAttribute("contenteditable") === "true") {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(composer);
    selection?.removeAllRanges();
    selection?.addRange(range);

    if (typeof document.execCommand === "function" && document.execCommand("insertText", false, text)) {
      return;
    }

    composer.replaceChildren();
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    composer.appendChild(paragraph);
    composer.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        inputType: "insertText",
        data: text
      })
    );
    return;
  }

  throw new Error("unsupported ChatGPT composer element");
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
