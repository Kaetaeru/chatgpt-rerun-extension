export const FILE_VERSION = 2;
export const GOAL_FILE_KIND = "chatgpt-rerun-goal";
export const RESULT_FILE_KIND = "chatgpt-rerun-result";
export const WORKER_READY_FILE_KIND = "chatgpt-rerun-worker-ready";
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
  processedResultIds: [],
  lastError: null,
  lastSentAt: null,
  dispatchClaimedAt: null,
  waitingApproval: false,
  handoffPending: false,
  handoffUsed: false,
  handoffFromTabId: null,
  handoffToTabId: null,
  resumeCapsulePending: false,
  poolRunId: null,
  workerIndex: null,
  workerCount: null,
  workerNonce: null,
  workerReady: false
});

export function tabConfigKey(tabId) {
  return `v2:config:${tabId}`;
}

export function tabRuntimeKey(tabId) {
  return `v2:runtime:${tabId}`;
}

export function poolStateKey(runId) {
  const id = String(runId || "").trim();
  if (!id) throw new Error("Run ID is required for pool state.");
  return `v2:pool:${id}`;
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

  return `You are preparing the next ChatGPT Rerun V2 goal.\n\nDo not start implementation yet.\nWait for the user's NEXT message describing what they want accomplished.\nAfter that message, understand the requested outcome and the repository/project context available in this conversation.\nThen create one downloadable UTF-8 JSON file named exactly:\n${fileName}\n\nThe JSON must have exactly this semantic shape:\n{\n  "version": 2,\n  "kind": "${GOAL_FILE_KIND}",\n  "setup_nonce": "${nonce}",\n  "goal_id": "${nonce}",\n  "repository": "owner/repo",\n  "branch": "branch-name",\n  "goal": "one clear end-state goal",\n  "acceptance": ["observable completion condition"],\n  "authority": ["repository-native authoritative path, issue, epic, or specification when known"]\n}\n\nRules:\n- The goal must describe the end state, not a Rerun-authored implementation plan.\n- Repository-native instructions, plans, specifications, and acceptance criteria remain authoritative over the goal.\n- If repository/branch cannot be determined reliably, ask the user instead of inventing them.\n- Do not create or modify target-repository files as part of goal setup.\n- Do not put the Rerun control signal only in prose; the downloadable JSON file is required.\n- After creating and verifying the JSON file, include the exact verified JSON again using the transport mirror below.\n${controlMirrorContract(fileName)}\n- After creating the JSON file, briefly tell the user that Rerun V2 can ingest it automatically.`;
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

  return `You are executing a ChatGPT Rerun V2 Goal Runner task.\n\nRun ID: ${runId}\nGoal ID: ${goalId}\nRepository: ${config.repository}\nBranch: ${config.branch}\n\nGOAL\n${config.goal}\n\nACCEPTANCE\n${acceptance}\n\nCANONICAL AUTHORITY\n${authority}\n\nEXECUTION CONTRACT\n- Continue working toward the GOAL.\n- Current explicit user instructions and repository-native authoritative instructions, plans, specifications, and acceptance criteria override the Rerun goal.\n- Never create or maintain a separate Rerun project plan in the target repository.\n- Do not redo work already verified by the conversation or repository evidence.\n- Inspect only the minimum repository state needed for the next useful action; do not spend the turn repeatedly rediscovering HEAD/history.\n- Choose the highest-priority unfinished action that materially advances the GOAL. Implement it and verify it.\n- If repository authority conflicts with the GOAL or required next action, stop rather than silently choosing one side.\n- Keep this execution within the normal 20-minute budget.\n\nRESULT FILE CONTRACT\nBefore finishing this response, create one downloadable UTF-8 JSON file named exactly:\n${fileName}\n\nThe file must be a JSON object with:\n{\n  "version": 2,\n  "kind": "${RESULT_FILE_KIND}",\n  "goal_id": "${goalId}",\n  "result_id": "a new unique id that has never been used for a previous execution",\n  "status": "CONTINUE|COMPLETE|NEEDS_USER|CONFLICT",\n  "checkpoint": "one concise factual resumable checkpoint"\n}\n\nUse CONTINUE when meaningful work remains, COMPLETE only when the GOAL and acceptance criteria are verified, NEEDS_USER when human input is required, and CONFLICT when repository authority conflicts with the goal or required next action.\n- Every execution MUST create a fresh result artifact for this execution even though the filename is reused.\n- Generate a new unique result_id before writing the file; never reuse, relink, or return a result artifact from a previous execution.\n- Set status to the actual final status of THIS execution. If this execution is complete, the JSON MUST contain "status": "COMPLETE".\n- After writing the file, reopen it and verify that goal_id, result_id, status, and checkpoint exactly match the result you intend to return.\n- The downloadable attachment must correspond to that newly verified file, not a previous attachment with the same filename.\n- If the file cannot be freshly created and verified, do not claim COMPLETE.\n- After reopening and verifying the file, include the exact verified JSON using the transport mirror below.\n${controlMirrorContract(fileName)}\nThe downloadable JSON file remains the Rerun control artifact; the mirror is only a same-response transport fallback.`;
}

export function buildFreshChatResumePrompt(frozenPrompt, checkpoint) {
  const prompt = String(frozenPrompt || "");
  if (!prompt.trim()) throw new Error("Frozen executor prompt is required.");
  const normalizedCheckpoint = String(checkpoint || "").trim().replace(/\s+/g, " ");
  if (!normalizedCheckpoint) return prompt;

  return `${prompt}\n\nFRESH-CHAT RESUME CAPSULE\nThis capsule is injected once after automatic worker handoff. It does not replace repository authority or change the frozen executor contract.\nLast verified checkpoint from the previous conversation:\n${normalizedCheckpoint}\nContinue from this checkpoint without repeating already verified work. Inspect repository state only as needed to confirm what remains.`;
}

export function workerReadyFileName(goalId, workerIndex, workerNonce) {
  const id = String(goalId || "").trim();
  const nonce = String(workerNonce || "").trim();
  const index = Number(workerIndex);
  if (!id || !nonce || !Number.isInteger(index) || index < 0) {
    throw new Error("Goal ID, worker index, and worker nonce are required.");
  }
  return `rerun-worker-ready-${id}-${index + 1}-${nonce}.json`;
}

export function buildWorkerPreflightPrompt(config, runtime) {
  validateConfig(config);
  const runId = String(runtime?.runId || "").trim();
  const goalId = String(runtime?.goalId || "").trim();
  const workerNonce = String(runtime?.workerNonce || "").trim();
  const workerIndex = Number(runtime?.workerIndex);
  const workerCount = Number(runtime?.workerCount);
  if (!runId || !goalId || !workerNonce || !Number.isInteger(workerIndex) || workerIndex < 0 || !Number.isInteger(workerCount) || workerCount < 1) {
    throw new Error("Worker preflight runtime is incomplete.");
  }
  const fileName = workerReadyFileName(goalId, workerIndex, workerNonce);

  return `You are preparing ChatGPT Rerun Worker ${workerIndex + 1} of ${workerCount}.\n\nDo NOT start the Goal Runner goal yet.\nThis chat must first prove that it can use the connected GitHub app with WRITE capability for repository work.\n\nRepository: ${config.repository}\nBranch: ${config.branch}\n\nPREFLIGHT\n1. Use the connected GitHub app to read repository metadata for ${config.repository}.\n2. Read branch ${config.branch} and record its exact current HEAD commit SHA. Also read README.md on that branch when present, otherwise read the repository root listing.\n3. MANDATORY WRITE-PERMISSION PROBE: use a GitHub branch-ref WRITE action on ${config.repository} to update branch ${config.branch} to the exact same HEAD SHA recorded in step 2, with force=false. This must be a real GitHub write-tool call; do not replace it with another read, do not merely describe what you would do, and do not change the branch to any different SHA. The intended repository state before and after this probe is identical.\n4. If ChatGPT shows a GitHub approval card for the write action, STOP and wait for the user. The user should choose the persistent option such as "Always allow" / "Allow all actions" for this chat. Do not click, synthesize, hide, or impersonate approval controls yourself. Only continue after the write call itself succeeds.\n5. Re-read branch ${config.branch} and verify that its HEAD is still exactly the SHA recorded in step 2. If the write probe fails, approval remains unresolved, or the SHA differs, do NOT create the ready JSON.\n6. Only after both the read checks and the mandatory write-permission probe succeed, create one downloadable UTF-8 JSON file named exactly:\n${fileName}\n\nThe JSON must be:\n{\n  "version": 2,\n  "kind": "${WORKER_READY_FILE_KIND}",\n  "run_id": "${runId}",\n  "goal_id": "${goalId}",\n  "worker_index": ${workerIndex + 1},\n  "worker_nonce": "${workerNonce}",\n  "repository": "${config.repository}",\n  "branch": "${config.branch}",\n  "status": "READY"\n}\n\nDo not create the ready JSON unless the GitHub WRITE probe actually succeeded and the branch HEAD was verified unchanged afterward.\nAfter creating and verifying the ready file, include the exact verified JSON using the transport mirror below.\n${controlMirrorContract(fileName)}\nThe downloadable JSON remains required; the mirror only lets Rerun ingest it without polling ChatGPT's conversation API.`;
}

export function normalizeWorkerReadyFile(value, expected = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Worker-ready file must be a JSON object.");
  }
  if (Number(value.version) !== FILE_VERSION || String(value.kind || "") !== WORKER_READY_FILE_KIND) {
    throw new Error("Unsupported Rerun V2 worker-ready file.");
  }

  const runId = String(expected.runId || "").trim();
  const goalId = String(expected.goalId || "").trim();
  const workerNonce = String(expected.workerNonce || "").trim();
  const workerIndex = Number(expected.workerIndex);
  const repository = String(expected.repository || "").trim();
  const branch = String(expected.branch || "").trim();

  if (!runId || String(value.run_id || "") !== runId) throw new Error("Worker-ready file run_id does not match.");
  if (!goalId || String(value.goal_id || "") !== goalId) throw new Error("Worker-ready file goal_id does not match.");
  if (!workerNonce || String(value.worker_nonce || "") !== workerNonce) throw new Error("Worker-ready file nonce does not match.");
  if (!Number.isInteger(workerIndex) || Number(value.worker_index) !== workerIndex + 1) throw new Error("Worker-ready file index does not match.");
  if (!repository || String(value.repository || "") !== repository) throw new Error("Worker-ready file repository does not match.");
  if (!branch || String(value.branch || "") !== branch) throw new Error("Worker-ready file branch does not match.");
  if (String(value.status || "").toUpperCase() !== "READY") throw new Error("Worker-ready file status must be READY.");

  return { runId, goalId, workerIndex, workerNonce, repository, branch, status: "READY" };
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

function controlMirrorContract(fileName) {
  return `RERUN_V2_CONTROL_BEGIN ${fileName}\n<the exact JSON object from the verified file, with no commentary inside the markers>\nRERUN_V2_CONTROL_END\nDo not omit these markers. Do not change any field between the file and the mirror.`;
}

function normalizeList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join("\n");
  }
  return String(value || "").trim();
}
