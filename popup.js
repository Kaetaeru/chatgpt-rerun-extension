const errorBox = document.getElementById("errorBox");
const setupButton = document.getElementById("setupGoal");
const resumeButton = document.getElementById("resume");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
let tabId = null;

const tab = await getActiveChatTab();
tabId = tab.id;
await refresh();
setInterval(() => void refresh(), 1000);

setupButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "BEGIN_GOAL_SETUP", tabId });
    if (!response?.ok) throw new Error(response?.error || "Goal setup failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

resumeButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "RESUME_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Resume failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

pauseButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "PAUSE_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Pause failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

stopButton.addEventListener("click", async () => {
  try {
    const response = await chrome.runtime.sendMessage({ type: "STOP_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Stop failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

async function refresh() {
  const state = await getState();
  const { config, runtime } = state;

  setText("repository", config.repository || "-");
  setText("branch", config.branch || "-");
  setText("goal", config.goal || "아직 목표가 없습니다.");
  setText("acceptance", config.acceptance || "-");
  setText("authorityPaths", config.authorityPaths || "-");
  setText("runtimeStatus", runtime.status || "idle");
  setText("statusBadge", displayStatus(runtime));
  setText("iteration", String(runtime.iteration || 0));
  setText("runId", runtime.runId || "-");
  setText("goalId", runtime.goalId || "-");
  setText("approval", runtime.waitingApproval ? "Waiting for manual approval" : "-");
  setText("lastResult", runtime.lastResult || "-");
  setText("checkpoint", runtime.lastCheckpoint || "-");

  const busy = ["dispatching", "generating"].includes(runtime.phase);
  setupButton.disabled = busy;
  resumeButton.disabled = !runtime.runId || !["paused", "needs_user", "conflict", "stopped"].includes(runtime.status);
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
  if (runtime.phase === "awaiting_goal_file") return "Waiting goal JSON";
  if (runtime.waitingApproval) return "Waiting approval";
  if (runtime.phase === "generating") return "Running";
  return String(runtime.status || "idle").replaceAll("_", " ");
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
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
