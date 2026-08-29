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
  iteration: 0,
  lastCheckpoint: "",
  lastResult: null,
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
    acceptance: String(value.acceptance || "").trim(),
    authorityPaths: String(value.authorityPaths || "").trim()
  };
}

export function validateConfig(config) {
  if (!config.repository || !/^[^/\s]+\/[^/\s]+$/.test(config.repository)) {
    throw new Error("Repository must use owner/repo format.");
  }
  if (!config.goal) throw new Error("Goal is required.");
}

export function buildExecutorPrompt(config, runtime) {
  const acceptance = config.acceptance || [
    "Repository-native acceptance criteria are satisfied.",
    "Relevant verification passes.",
    "No unresolved blocker remains."
  ].join("\n");
  const authority = config.authorityPaths || "Discover the repository-native authoritative instructions/specs only when needed; do not create a Rerun plan.";
  const checkpoint = runtime.lastCheckpoint || "No verified checkpoint yet. Start with the minimum repository inspection needed to identify the next useful action.";

  const execution = Number(runtime.iteration || 0) + 1;

  return `You are executing a ChatGPT Rerun V2 Goal Runner task.\n\nRun ID: ${runtime.runId}\nExecution: ${execution}\nRepository: ${config.repository}\nBranch: ${config.branch}\n\nGOAL\n${config.goal}\n\nACCEPTANCE\n${acceptance}\n\nCANONICAL AUTHORITY\n${authority}\n\nRESUME CHECKPOINT\n${checkpoint}\n\nEXECUTION CONTRACT\n- Continue working toward the GOAL.\n- Current explicit user instructions and repository-native authoritative instructions, plans, specifications, and acceptance criteria override the Rerun goal.\n- Never create or maintain a separate Rerun project plan in the target repository.\n- Do not redo work already verified by the checkpoint or repository evidence.\n- Inspect only the minimum repository state needed for the next useful action; do not spend the turn repeatedly rediscovering HEAD/history.\n- Choose the highest-priority unfinished action that materially advances the GOAL. Implement it and verify it.\n- If repository authority conflicts with the GOAL or required next action, stop rather than silently choosing one side.\n- Keep the execution within the normal 20-minute budget and leave a factual resumable checkpoint if more work remains.\n\nRESULT CONTRACT\nEnd the response with exactly one final block in this format:\n\nRERUN_RESULT\nrun_id: ${runtime.runId}\nexecution: ${execution}\nstatus: CONTINUE|COMPLETE|NEEDS_USER|CONFLICT\ncheckpoint: <one concise factual line>\n\nUse CONTINUE when meaningful work remains, COMPLETE only when the GOAL and acceptance criteria are verified, NEEDS_USER when human input is required, and CONFLICT when repository authority conflicts with the requested goal or next action.`;
}

export function parseRerunResult(text) {
  const source = String(text || "");
  const marker = source.lastIndexOf("RERUN_RESULT");
  if (marker < 0) return null;
  const tail = source.slice(marker);
  const runIdMatch = tail.match(/^run_id:\s*(\S+)\s*$/im);
  const executionMatch = tail.match(/^execution:\s*(\d+)\s*$/im);
  const statusMatch = tail.match(/^status:\s*(CONTINUE|COMPLETE|NEEDS_USER|CONFLICT)\s*$/im);
  const checkpointMatch = tail.match(/^checkpoint:\s*(.+)\s*$/im);
  if (!runIdMatch || !executionMatch || !statusMatch || !checkpointMatch) return null;
  const status = statusMatch[1].toUpperCase();
  if (!RESULT_STATUSES.has(status)) return null;
  return {
    runId: runIdMatch[1],
    execution: Number(executionMatch[1]),
    status,
    checkpoint: checkpointMatch[1].trim().replace(/\s+/g, " ")
  };
}
