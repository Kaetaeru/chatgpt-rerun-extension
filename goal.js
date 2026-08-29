export const FILE_VERSION = 2;
export const GOAL_FILE_KIND = "chatgpt-rerun-goal";
export const RESULT_FILE_KIND = "chatgpt-rerun-result";
export const RESULT_STATUSES = new Set(["CONTINUE", "COMPLETE", "NEEDS_USER", "CONFLICT"]);

export const DEFAULT_CONFIG = Object.freeze({
  repository: "",
  branch: "main",
  goal: "",
  acceptance: "",
  authorityPaths: ""
});

export const DEFAULT_RUNTIME = Object.freeze({
  enabled: false,
  status: "idle",
  phase: "idle",
  runId: null,
  goalId: null,
  setupNonce: null,
  setupPending: false,
  frozenPrompt: "",
  iteration: 0,
  lastCheckpoint: "",
  lastResult: null,
  lastResultId: null,
  lastError: null,
  lastSentAt: null,
  dispatchClaimedAt: null,
  waitingApproval: false,
  handoffPending: false,
  handoffFromTabId: null,
  handoffToTabId: null
});

export function tabConfigKey(tabId) {
  return `v2:config:${tabId}`;
}

export function tabRuntimeKey(tabId) {
  return `v2:runtime:${tabId}`;
}

export function normalizeConfig(value = {}) {
  return {
    repository: String(value.repository || "").trim(),
    branch: String(value.branch || "main").trim() || "main",
    goal: String(value.goal || "").trim(),
    acceptance: normalizeList(value.acceptance),
    authorityPaths: normalizeList(value.authorityPaths)
  };
}

export function validateConfig(config) {
  if (!config.repository || !/^[^/\s]+\/[^/\s]+$/.test(config.repository)) {
    throw new Error("Repository must use owner/repo format.");
  }
  if (!config.goal) throw new Error("Goal is required.");
}

export function buildGoalSetupPrompt(setupNonce) {
  const nonce = String(setupNonce || "").trim();
  if (!nonce) throw new Error("Goal setup nonce is required.");
  const fileName = `rerun-goal-${nonce}.json`;

  return `You are preparing the next ChatGPT Rerun V2 goal.\n\nDo not start implementation yet.\nWait for the user's NEXT message describing what they want accomplished.\nAfter that message, understand the requested outcome and the repository/project context available in this conversation.\nThen create one downloadable UTF-8 JSON file named exactly:\n${fileName}\n\nThe JSON must have exactly this semantic shape:\n{\n  "version": 2,\n  "kind": "${GOAL_FILE_KIND}",\n  "setup_nonce": "${nonce}",\n  "goal_id": "${nonce}",\n  "repository": "owner/repo",\n  "branch": "branch-name",\n  "goal": "one clear end-state goal",\n  "acceptance": ["observable completion condition"],\n  "authority": ["repository-native authoritative path, issue, epic, or specification when known"]\n}\n\nRules:\n- The goal must describe the end state, not a Rerun-authored implementation plan.\n- Repository-native instructions, plans, specifications, and acceptance criteria remain authoritative over the goal.\n- If repository/branch cannot be determined reliably, ask the user instead of inventing them.\n- Do not create or modify target-repository files as part of goal setup.\n- Do not put the Rerun control signal only in prose; the downloadable JSON file is required.\n- After creating the JSON file, briefly tell the user that Rerun V2 can ingest it automatically.`;
}

export function normalizeGoalFile(value, expectedNonce) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Goal file must be a JSON object.");
  }
  const nonce = String(expectedNonce || "").trim();
  if (Number(value.version) !== FILE_VERSION || String(value.kind || "") !== GOAL_FILE_KIND) {
    throw new Error("Unsupported Rerun V2 goal file.");
  }
  if (!nonce || String(value.setup_nonce || "") !== nonce || String(value.goal_id || "") !== nonce) {
    throw new Error("Goal file does not match the active goal-setup request.");
  }
  const config = normalizeConfig({
    repository: value.repository,
    branch: value.branch,
    goal: value.goal,
    acceptance: value.acceptance,
    authorityPaths: value.authority
  });
  validateConfig(config);
  return { goalId: nonce, config };
}

export function buildExecutorPrompt(config, runtime) {
  validateConfig(config);
  const runId = String(runtime?.runId || "").trim();
  const goalId = String(runtime?.goalId || "").trim();
  if (!runId || !goalId) throw new Error("Run ID and Goal ID are required.");

  const acceptance = config.acceptance || [
    "Repository-native acceptance criteria are satisfied.",
    "Relevant verification passes.",
    "No unresolved blocker remains."
  ].join("\n");
  const authority = config.authorityPaths || "Discover repository-native authoritative instructions/specifications only when needed. Do not create a Rerun project plan.";
  const fileName = `rerun-result-${goalId}.json`;

  return `You are executing a ChatGPT Rerun V2 Goal Runner task.\n\nRun ID: ${runId}\nGoal ID: ${goalId}\nRepository: ${config.repository}\nBranch: ${config.branch}\n\nGOAL\n${config.goal}\n\nACCEPTANCE\n${acceptance}\n\nCANONICAL AUTHORITY\n${authority}\n\nEXECUTION CONTRACT\n- Continue working toward the GOAL.\n- Current explicit user instructions and repository-native authoritative instructions, plans, specifications, and acceptance criteria override the Rerun goal.\n- Never create or maintain a separate Rerun project plan in the target repository.\n- Do not redo work already verified by the conversation or repository evidence.\n- Inspect only the minimum repository state needed for the next useful action; do not spend the turn repeatedly rediscovering HEAD/history.\n- Choose the highest-priority unfinished action that materially advances the GOAL. Implement it and verify it.\n- If repository authority conflicts with the GOAL or required next action, stop rather than silently choosing one side.\n- Keep this execution within the normal 20-minute budget.\n\nRESULT FILE CONTRACT\nBefore finishing this response, create one downloadable UTF-8 JSON file named exactly:\n${fileName}\n\nThe file must be a JSON object with:\n{\n  "version": 2,\n  "kind": "${RESULT_FILE_KIND}",\n  "goal_id": "${goalId}",\n  "result_id": "a new unique id that has never been used for a previous execution",\n  "status": "CONTINUE|COMPLETE|NEEDS_USER|CONFLICT",\n  "checkpoint": "one concise factual resumable checkpoint"\n}\n\nUse CONTINUE when meaningful work remains, COMPLETE only when the GOAL and acceptance criteria are verified, NEEDS_USER when human input is required, and CONFLICT when repository authority conflicts with the goal or required next action.\nThe downloadable JSON file, not response prose, is the Rerun control signal.`;
}

export function normalizeResultFile(value, expectedGoalId) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Result file must be a JSON object.");
  }
  const goalId = String(expectedGoalId || "").trim();
  if (Number(value.version) !== FILE_VERSION || String(value.kind || "") !== RESULT_FILE_KIND) {
    throw new Error("Unsupported Rerun V2 result file.");
  }
  if (!goalId || String(value.goal_id || "") !== goalId) {
    throw new Error("Result file does not match the active goal.");
  }
  const resultId = String(value.result_id || "").trim();
  const status = String(value.status || "").trim().toUpperCase();
  const checkpoint = String(value.checkpoint || "").trim().replace(/\s+/g, " ");
  if (!resultId) throw new Error("Result file result_id is required.");
  if (!RESULT_STATUSES.has(status)) throw new Error(`Unsupported result status: ${status || "<missing>"}`);
  if (!checkpoint) throw new Error("Result file checkpoint is required.");
  return { goalId, resultId, status, checkpoint };
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  }
  return String(value || "").trim();
}
