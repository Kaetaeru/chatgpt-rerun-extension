import {
  DEFAULT_TEAM_STATE,
  teamStateKey
} from "./team-control.js";

let currentTabId = null;
let locked = false;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (Number.isSafeInteger(tab?.id)) {
  currentTabId = tab.id;
  await refreshLock();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || currentTabId === null) return;
  if (changes[teamStateKey(currentTabId)]) void refreshLock();
});

document.addEventListener("click", (event) => {
  if (!locked) return;
  const target = event.target instanceof Element
    ? event.target.closest("#sessionToggle, #connectPrompt, #handoff, #save")
    : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

const style = document.createElement("style");
style.textContent = `
  body.rerun-team-active #sessionToggle,
  body.rerun-team-active #connectPrompt,
  body.rerun-team-active #handoff,
  body.rerun-team-active #save { pointer-events: none; opacity: .55; }
`;
document.head.appendChild(style);

async function refreshLock() {
  if (currentTabId === null) return;
  const key = teamStateKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  const state = { ...DEFAULT_TEAM_STATE, ...(stored[key] || {}) };
  applyLock(Boolean(state.enabled));
}

function applyLock(nextLocked) {
  locked = nextLocked;
  document.body.classList.toggle("rerun-team-active", locked);
  const ids = [
    "sessionToggle", "connectPrompt", "handoff", "save",
    "owner", "repo", "branch", "path", "resumePrompt",
    "pollIntervalSeconds", "retryDelaySeconds", "maxRetriesPerSequence",
    "githubToken", "approvalAwareResume"
  ];
  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) continue;
    element.disabled = locked;
    if (id === "sessionToggle") {
      element.title = locked ? "Single watcher mode is unavailable while Team Runtime is active." : "";
    }
  }
}
