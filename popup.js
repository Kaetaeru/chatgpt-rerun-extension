const fields = ["repository", "branch", "goal", "acceptance", "authorityPaths"];
const elements = Object.fromEntries(fields.map((id) => [id, document.getElementById(id)]));
const errorBox = document.getElementById("errorBox");
const startButton = document.getElementById("start");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
let tabId = null;

const tab = await getActiveChatTab();
tabId = tab.id;
await refresh(true);
setInterval(() => void refresh(false), 1000);

for (const element of Object.values(elements)) {
  element.addEventListener("input", hideError);
}

document.getElementById("save").addEventListener("click", async () => {
  try {
    await save();
    await refresh(false);
  } catch (error) {
    showError(error);
  }
});

startButton.addEventListener("click", async () => {
  try {
    await save();
    const state = await getState();
    const type = state.runtime.runId && ["paused", "needs_user", "conflict"].includes(state.runtime.status)
      ? "RESUME_GOAL"
      : "START_GOAL";
    const response = await chrome.runtime.sendMessage({ type, tabId });
    if (!response?.ok) throw new Error(response?.error || `${type} failed`);
    await refresh(false);
  } catch (error) {
    showError(error);
  }
});

pauseButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "PAUSE_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Pause failed");
    await refresh(false);
  } catch (error) {
    showError(error);
  }
});

stopButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Stop failed");
    await refresh(false);
  } catch (error) {
    showError(error);
  }
});

async function save() {
  const config = Object.fromEntries(fields.map((id) => [id, elements[id].value]));
  const response = await chrome.runtime.sendMessage({ type: "SAVE_CONFIG", tabId, config });
  if (!response?.ok) throw new Error(response?.error || "Save failed");
}

async function refresh(loadForm) {
  const state = await getState();
  const { config, runtime } = state;
  if (loadForm) {
    for (const id of fields) elements[id].value = config[id] || "";
  }

  document.getElementById("runtimeStatus").textContent = runtime.status || "idle";
  document.getElementById("statusBadge").textContent = displayStatus(runtime);
  document.getElementById("iteration").textContent = String(runtime.iteration || 0);
  document.getElementById("runId").textContent = runtime.runId || "-";
  document.getElementById("approval").textContent = runtime.waitingApproval ? "Waiting for manual approval" : "-";
  document.getElementById("checkpoint").textContent = runtime.lastCheckpoint || "-";

  startButton.textContent = runtime.runId && ["paused", "needs_user", "conflict"].includes(runtime.status)
    ? "Resume"
    : "Start";
  pauseButton.disabled = !runtime.enabled;
  stopButton.disabled = !runtime.runId || runtime.status === "stopped";
  if (runtime.lastError) showError(runtime.lastError);
  else hideError();
}

async function getState() {
  const response = await chrome.runtime.sendMessage({ type: "GET_TAB_STATE", tabId });
  if (!response?.ok) throw new Error(response?.error || "Could not load Rerun V2 state.");
  return response;
}

function displayStatus(runtime) {
  if (runtime.waitingApproval) return "Waiting approval";
  if (runtime.phase === "generating") return "Running";
  return String(runtime.status || "idle").replaceAll("_", " ");
}

async function getActiveChatTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !isChatUrl(tab.url || "")) {
    throw new Error("Open this Side Panel from an active ChatGPT tab.");
  }
  return tab;
}

function isChatUrl(url) {
  try {
    const host = new URL(url).hostname;
    return host === "chatgpt.com" || host === "chat.openai.com";
  } catch {
    return false;
  }
}

function showError(error) {
  errorBox.hidden = false;
  errorBox.textContent = error instanceof Error ? error.message : String(error);
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}
