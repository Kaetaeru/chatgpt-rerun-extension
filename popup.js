const errorBox = document.getElementById("errorBox");
const setupButton = document.getElementById("setupGoal");
const resumeButton = document.getElementById("resume");
const pauseButton = document.getElementById("pause");
const stopButton = document.getElementById("stop");
const conversationEndButton = document.getElementById("testConversationEnd");
const conversationEndResult = document.getElementById("conversationEndResult");
const conversationEndDetail = document.getElementById("conversationEndDetail");
const ensuredScriptTabs = new Set();

await refresh();
setInterval(() => void refresh(), 1000);

setupButton.addEventListener("click", async () => {
  try {
    const tabId = await getActiveChatTabId();
    await ensureRerunScripts(tabId);
    const response = await chrome.runtime.sendMessage({ type: "BEGIN_GOAL_SETUP", tabId });
    if (!response?.ok) throw new Error(response?.error || "Goal setup failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

conversationEndButton.addEventListener("click", async () => {
  conversationEndButton.disabled = true;
  conversationEndResult.textContent = "검사 중...";
  conversationEndDetail.textContent = "현재 활성 ChatGPT 탭의 UI 상태를 확인하고 있습니다.";
  try {
    const tabId = await getActiveChatTabId();
    await ensureRerunScripts(tabId);
    const response = await chrome.tabs.sendMessage(tabId, { type: "RERUN_V2_DIAGNOSE_CONVERSATION_END" });
    if (!response?.ok) throw new Error(response?.error || "Conversation-end diagnostic failed.");
    conversationEndResult.textContent = response.ended ? "대화길이 끝" : "끝이 아님";
    conversationEndDetail.textContent = formatConversationEndDetail(response);
    hideError();
  } catch (error) {
    conversationEndResult.textContent = "진단 실패";
    conversationEndDetail.textContent = "활성 ChatGPT 탭에서 진단 응답을 받지 못했습니다.";
    showError(error);
  } finally {
    conversationEndButton.disabled = false;
  }
});

resumeButton.addEventListener("click", async () => {
  try {
    const tabId = await getActiveChatTabId();
    await ensureRerunScripts(tabId);
    const response = await chrome.runtime.sendMessage({ type: "RESUME_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Resume failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

pauseButton.addEventListener("click", async () => {
  try {
    const tabId = await getActiveChatTabId();
    const response = await chrome.runtime.sendMessage({ type: "PAUSE_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Pause failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

stopButton.addEventListener("click", async () => {
  try {
    const tabId = await getActiveChatTabId();
    const response = await chrome.runtime.sendMessage({ type: "STOP_GOAL", tabId });
    if (!response?.ok) throw new Error(response?.error || "Stop failed");
    await refresh();
  } catch (error) {
    showError(error);
  }
});

async function refresh() {
  try {
    const tabId = await getActiveChatTabId();
    const state = await getState(tabId);
    const { config, runtime } = state;
    if (["awaiting_goal_file", "worker_preflight", "ready", "dispatching", "generating"].includes(runtime.phase)) {
      await ensureRerunScripts(tabId);
    }
    const artifactDiagnostic = await getArtifactDiagnostic(tabId, runtime);

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
    setupButton.disabled = busy || ["worker_preflight", "standby", "awaiting_worker_count"].includes(runtime.phase);
    resumeButton.disabled = !runtime.runId || !["paused", "needs_user", "conflict", "stopped"].includes(runtime.status);
    pauseButton.disabled = !runtime.enabled;
    stopButton.disabled = !runtime.runId || runtime.status === "stopped";

    if (runtime.lastError) showError(runtime.lastError);
    else if (artifactDiagnostic?.status === "error") showError(`Artifact reader: ${artifactDiagnostic.detail}`);
    else hideError();
  } catch (error) {
    showError(error);
  }
}

async function ensureRerunScripts(tabId) {
  if (ensuredScriptTabs.has(tabId)) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["page-artifact-reader.js"],
    world: "MAIN"
  });
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js", "conversation-limit.js", "artifact-reader.js"]
  });
  ensuredScriptTabs.add(tabId);
}

async function getState(tabId) {
  const response = await chrome.runtime.sendMessage({ type: "GET_TAB_STATE", tabId });
  if (!response?.ok) throw new Error(response?.error || "Could not load Rerun V2 state.");
  return response;
}

async function getArtifactDiagnostic(tabId, runtime) {
  const key = `v2:artifact:${tabId}`;
  const stored = await chrome.storage.local.get(key);
  const diagnostic = stored[key] || null;
  if (!diagnostic) return null;
  let expectedId = runtime.goalId;
  if (runtime.phase === "awaiting_goal_file") expectedId = runtime.setupNonce;
  if (runtime.phase === "worker_preflight" && Number.isInteger(runtime.workerIndex)) {
    expectedId = `${runtime.goalId}:${runtime.workerIndex + 1}`;
  }
  if (!expectedId || String(diagnostic.expectedId || "") !== String(expectedId)) return null;
  return diagnostic;
}

function displayStatus(runtime) {
  if (runtime.phase === "awaiting_goal_file") return "Waiting goal JSON";
  if (runtime.phase === "awaiting_worker_count") return "Waiting worker count";
  if (runtime.phase === "worker_preflight") return runtime.waitingApproval ? "Waiting GitHub approval" : "GitHub preflight";
  if (runtime.phase === "standby") return "Worker ready";
  if (runtime.waitingApproval) return "Waiting approval";
  if (runtime.phase === "generating") return "Running";
  return String(runtime.status || "idle").replaceAll("_", " ");
}

function formatConversationEndDetail(response) {
  const evidence = response?.evidence || {};
  const reasonLabels = {
    visible_maximum_length_notice: "최대 길이 안내 UI를 직접 발견함",
    generation_in_progress: "현재 응답 생성 중",
    usable_composer: "사용 가능한 입력창이 존재함",
    maximum_length_text_without_usable_composer: "최대 길이 문구가 있고 사용 가능한 입력창이 없음",
    no_usable_composer_while_idle: "생성 중이 아닌데 사용 가능한 입력창이 없음"
  };
  const reason = reasonLabels[response?.reason] || String(response?.reason || "unknown");
  return `${reason} · notice=${Boolean(evidence.visibleLimitNotice)} · text=${Boolean(evidence.bodyTextMatchesLimit)} · composer=${Boolean(evidence.usableComposer)} · generating=${Boolean(evidence.generationActive)}`;
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

async function getActiveChatTabId() {
  return (await getActiveChatTab()).id;
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
