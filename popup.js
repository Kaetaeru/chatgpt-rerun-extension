import { diagnoseConversationEndInPage } from "./conversation-diagnostic.js";

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
  conversationEndDetail.textContent = "현재 활성 ChatGPT 탭의 UI를 직접 샘플링하고 있습니다.";
  try {
    const tabId = await getActiveChatTabId();
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: diagnoseConversationEndInPage
    });
    const response = execution?.result;
    if (!response || typeof response !== "object") throw new Error("Conversation-end diagnostic returned no result.");
    conversationEndResult.textContent = response.ended === true
      ? "대화길이 끝"
      : response.ended === false
        ? "끝이 아님"
        : "판단 불가";
    conversationEndDetail.textContent = formatConversationEndDetail(response);
    hideError();
  } catch (error) {
    conversationEndResult.textContent = "진단 실패";
    conversationEndDetail.textContent = "활성 ChatGPT 탭의 DOM을 직접 검사하지 못했습니다.";
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
    conversation_end_banner: "최대 길이 안내 + 새 채팅 시작 버튼을 한 배너에서 발견함",
    explicit_limit_ui: "대화 종료를 나타내는 명시적 UI를 발견함",
    continue_in_new_chat_ui: "현재 대화 안에서 새 채팅으로 계속하라는 UI를 발견함",
    generation_in_progress: "현재 응답 생성 중",
    usable_composer: "사용 가능한 입력창이 존재함",
    no_usable_composer_without_known_end_signal: "입력창은 없지만 알려진 종료 UI도 찾지 못함",
    ambiguous_ui: "현재 UI만으로 종료 여부를 확정하지 못함"
  };
  const lines = [
    reasonLabels[response?.reason] || String(response?.reason || "unknown"),
    `composer=${Boolean(evidence.usableComposer)} count=${Number(evidence.composerCount || 0)} generating=${Boolean(evidence.generationActive)} route=${Boolean(evidence.inConversation)}`,
    `banner=${evidence.endBannerSignal || "-"}`,
    `limit=${evidence.explicitLimitSignal || "-"}`,
    `new-chat=${evidence.continueNewChatSignal || "-"}`
  ];
  const candidates = Array.isArray(response?.uiCandidates) ? response.uiCandidates : [];
  lines.push("UI candidates:");
  lines.push(...(candidates.length ? candidates.map((value, index) => `${index + 1}. ${value}`) : ["(none)"]));
  return lines.join("\n");
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
