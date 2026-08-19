export const TEAM_RUNTIME_PATH = ".chatgpt-rerun/team/runtime.json";
export const TEAM_AGENTS = new Set(["planner", "programmer"]);
export const TEAM_STATUSES = new Set(["ready", "complete", "needs_user", "blocked"]);

const TEAM_CONFIG_PREFIX = "teamConfig:";
const TEAM_STATE_PREFIX = "teamState:";

export const DEFAULT_TEAM_CONFIG = Object.freeze({
  goal: "",
  path: TEAM_RUNTIME_PATH,
  maxTaskHandoffs: 6
});

export const DEFAULT_TEAM_STATE = Object.freeze({
  enabled: false,
  streamKey: null,
  bootstrapPending: false,
  dispatching: false,
  executing: false,
  executionToken: null,
  lastRunId: null,
  lastRevision: -1,
  lastDispatchedRevision: -1,
  currentAgent: null,
  currentTaskId: null,
  taskHandoffCount: 0,
  lastCheckedAt: null,
  lastDispatchAt: null,
  lastFinishedAt: null,
  lastStatus: null,
  lastReason: null,
  rateLimitPausedUntil: null,
  rateLimitRemaining: null,
  rateLimitResetAt: null,
  stopReason: null,
  lastError: null
});

export function teamConfigKey(tabId) {
  return `${TEAM_CONFIG_PREFIX}${normalizeTabId(tabId)}`;
}

export function teamStateKey(tabId) {
  return `${TEAM_STATE_PREFIX}${normalizeTabId(tabId)}`;
}

export function parseTeamRuntimePayload(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("team runtime is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("team runtime must contain a JSON object");
  }

  const allowedKeys = new Set([
    "version",
    "run_id",
    "revision",
    "status",
    "agent",
    "task_id",
    "reason",
    "updated_at"
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`team runtime contains unsupported fields: ${unknownKeys.join(", ")}`);
  }

  if (value.version !== 1) throw new Error("team runtime version must be 1");
  if (typeof value.run_id !== "string" || !value.run_id.trim()) {
    throw new Error("team runtime run_id must be a non-empty string");
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error("team runtime revision must be a non-negative integer");
  }
  if (!TEAM_STATUSES.has(value.status)) {
    throw new Error(`Unsupported team runtime status: ${String(value.status)}`);
  }
  if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) {
    throw new Error("team runtime updated_at must be an ISO-8601 date-time string");
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    throw new Error("team runtime reason must be a string when present");
  }

  const agent = typeof value.agent === "string" ? value.agent.trim() : "";
  const taskId = typeof value.task_id === "string" ? value.task_id.trim() : "";
  if (value.status === "ready") {
    if (!TEAM_AGENTS.has(agent)) {
      throw new Error("ready team runtime requires agent=planner or agent=programmer");
    }
    if (!taskId) throw new Error("ready team runtime requires a non-empty task_id");
  } else {
    if (agent && !TEAM_AGENTS.has(agent)) {
      throw new Error("team runtime agent must be planner or programmer when present");
    }
    if (value.task_id !== undefined && !taskId) {
      throw new Error("team runtime task_id must be non-empty when present");
    }
  }

  return {
    version: 1,
    runId: value.run_id.trim(),
    revision: value.revision,
    status: value.status,
    agent,
    taskId,
    reason: typeof value.reason === "string" ? value.reason : "",
    updatedAt: value.updated_at
  };
}

export function normalizeMaxTaskHandoffs(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_TEAM_CONFIG.maxTaskHandoffs;
  return Math.min(20, Math.max(2, Math.floor(parsed)));
}

export function buildTeamBootstrapPrompt(config, repositoryConfig) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const goal = String(config.goal || "").trim();
  const path = normalizedTeamPath(config.path);

  return [
    `Initialize The Voyage of Theseus Team Runtime in GitHub repository ${owner}/${repo} on branch ${branch}.`,
    `User goal: ${goal || "derive a precise project goal from the current user request and repository context"}.`,
    "First read the repository README, AGENTS.md, CONTRIBUTING.md, and any existing .chatgpt-rerun protocol files so you understand project rules and current state.",
    "Then create or safely reconcile `.chatgpt-rerun/team/TEAM.md`, `PLAN.md`, `STATE.md`, `agents/planner.md`, and `agents/programmer.md` without destroying valid existing state.",
    "TEAM.md must state that Planner and Programmer never depend on previous ChatGPT conversation text; GitHub is their only shared durable memory.",
    "Planner owns requirements analysis, task decomposition, acceptance criteria, review of Programmer evidence, and selection of the next task. Planner must not implement product code.",
    "Programmer implements only the Planner-approved SPEC, runs verification, commits code, records RESULT evidence, and must not unilaterally redefine product requirements.",
    "Each task may use `.chatgpt-rerun/team/tasks/<TASK-ID>/SPEC.md`, `RESULT.md`, and `REVIEW.md`.",
    "For every handoff, write durable task artifacts and STATE first, then publish runtime.json as the final authoritative write.",
    "The runtime revision must increase monotonically for every handoff; never reuse a previous revision.",
    "Create the initial Planner task and record PLAN/STATE before publishing the initial runtime.",
    `The runtime path is ${path}. Use only these fields: version, run_id, revision, status, agent, task_id, reason, updated_at.`,
    "The initial runtime must use version 1, a new unique run_id, revision 0, status `ready`, agent `planner`, the first task_id, and the current ISO-8601 updated_at.",
    "Terminal statuses are only `complete`, `needs_user`, and `blocked`.",
    "Do not implement product code during bootstrap. Finish after the Team Runtime and first Planner task are ready."
  ].join(" ");
}

export function buildTeamAgentPrompt(runtime, config, repositoryConfig) {
  const owner = String(repositoryConfig.owner || "").trim();
  const repo = String(repositoryConfig.repo || "").trim();
  const branch = String(repositoryConfig.branch || "main").trim() || "main";
  const path = normalizedTeamPath(config.path);
  const roleRule = runtime.agent === "planner"
    ? [
        "You are the Planner. Do not implement product code.",
        "For a new task, analyze the goal and repository state, then write a precise SPEC.md with scope, acceptance criteria, dependencies, and verification steps before handing it to Programmer.",
        "When reviewing a Programmer RESULT, do not trust RESULT.md alone. Inspect the actual commit, diff, tests, and relevant repository state. If the work is insufficient, record concrete requested changes in REVIEW.md and return the same task to Programmer.",
        "If the work is acceptable, record the acceptance evidence in REVIEW.md, then create the next task or publish `complete` if the full goal is verified."
      ]
    : [
        "You are the Programmer. Do not change scope or product decisions that Planner has not approved.",
        "Read the current task SPEC.md and the relevant repository instructions and code, then implement exactly that scope.",
        "Run the relevant tests, lint, build, or other verification and inspect the results.",
        "Record the result in RESULT.md, including the commit SHA, changed files, verification commands and outcomes, and remaining risks.",
        "If the SPEC is ambiguous or implementation requires a product decision, do not guess. Return control with `blocked`, `needs_user`, or a Planner handoff as appropriate."
      ];

  return [
    `You are the ${runtime.agent.toUpperCase()} agent in The Voyage of Theseus Team Runtime. Never use a previous ChatGPT conversation as shared memory.`,
    `Target: GitHub ${owner}/${repo}, branch ${branch}, team runtime ${path}, run ${runtime.runId}, revision ${runtime.revision}, task ${runtime.taskId}.`,
    "First read `.chatgpt-rerun/team/TEAM.md`, runtime.json, STATE.md, and PLAN.md, then inspect the current task's SPEC/RESULT/REVIEW and the repository instructions, code, and tests required for this task.",
    "If runtime and durable GitHub state disagree, reconcile them before changing code.",
    ...roleRule,
    "On handoff or termination, update task artifacts and STATE first, then publish runtime.json as the final authoritative write.",
    `The next runtime revision must be at least ${runtime.revision + 1}; never republish an older revision.`,
    "If another agent should work next, publish status `ready`, set agent to exactly `planner` or `programmer`, and include task_id.",
    "Use `needs_user` when a human decision is required, `blocked` for an external blocker, and `complete` only when the full goal and verification are finished.",
    "Do not add runtime fields beyond version, run_id, revision, status, agent, task_id, reason, and updated_at."
  ].join(" ");
}

function normalizedTeamPath(path) {
  return String(path || TEAM_RUNTIME_PATH).replace(/^\/+/, "").trim() || TEAM_RUNTIME_PATH;
}

function normalizeTabId(tabId) {
  const value = Number(tabId);
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("A valid Chrome tab ID is required");
  return value;
}
