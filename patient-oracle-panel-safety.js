import {
  DEFAULT_ORACLE_STATE,
  oracleStateKey
} from "./utilities/patient-oracle/oracle-control.js";

let currentTabId = null;
let locked = false;

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
if (Number.isSafeInteger(tab?.id)) {
  currentTabId = tab.id;
  await refreshLock();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || currentTabId === null) return;
  if (changes[oracleStateKey(currentTabId)]) void refreshLock();
});

document.addEventListener("click", (event) => {
  if (!locked) return;
  const target = event.target instanceof Element
    ? event.target.closest("#sessionToggle, #teamToggle, #connectPrompt, #handoff, #save")
    : null;
  if (!target) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);

const style = document.createElement("style");
style.textContent = `
  body.patient-oracle-active #sessionToggle,
  body.patient-oracle-active #teamToggle,
  body.patient-oracle-active #connectPrompt,
  body.patient-oracle-active #handoff,
  body.patient-oracle-active #save { pointer-events:none; opacity:.55; }
`;
document.head.appendChild(style);

async function refreshLock() {
  if (currentTabId === null) return;
  const key = oracleStateKey(currentTabId);
  const stored = await chrome.storage.local.get(key);
  const state = { ...DEFAULT_ORACLE_STATE, ...(stored[key] || {}) };
  applyLock(Boolean(state.enabled));
}

function applyLock(nextLocked) {
  locked = nextLocked;
  document.body.classList.toggle("patient-oracle-active", locked);

  const ids = [
    "sessionToggle", "teamToggle", "connectPrompt", "handoff", "save",
    "owner", "repo", "branch", "path", "resumePrompt",
    "pollIntervalSeconds", "retryDelaySeconds", "maxRetriesPerSequence",
    "githubToken", "approvalAwareResume", "teamGoal", "teamMaxTaskHandoffs",
    "oraclePath", "oraclePollSeconds", "oracleMaxRedispatches"
  ];

  for (const id of ids) {
    const element = document.getElementById(id);
    if (!element) continue;
    if (locked) {
      if (!element.disabled) element.dataset.oracleLocked = "true";
      element.disabled = true;
    } else if (element.dataset.oracleLocked === "true") {
      element.disabled = false;
      delete element.dataset.oracleLocked;
    }
  }

  const oracleToggle = document.getElementById("oracleToggle");
  if (oracleToggle) oracleToggle.disabled = false;

  const singleToggle = document.getElementById("sessionToggle");
  if (singleToggle && locked) {
    singleToggle.title = "Single Rerun is unavailable while Patient Oracle is active.";
  }
  const teamToggle = document.getElementById("teamToggle");
  if (teamToggle && locked) {
    teamToggle.title = "Voyage Team is unavailable while Patient Oracle is active.";
  }
}
