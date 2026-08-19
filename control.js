export const CONTROL_STATUSES = new Set([
  "continue",
  "complete",
  "needs_user",
  "blocked"
]);

export const DEFAULT_CONFIG = Object.freeze({
  owner: "",
  repo: "",
  branch: "",
  path: ".chatgpt-rerun/control.json",
  githubToken: "",
  resumePrompt: "Continue the current GitHub-backed voyage. First read `.chatgpt-rerun/README.md`, `control.json`, `STATE.md`, and `PLAN.md` in the required order, reconcile the durable repository state, then resume from the current sequence's exact unfinished point. Do not repeat verified work. Update GitHub state according to the protocol before ending the turn.",
  pollIntervalSeconds: 90,
  retryDelaySeconds: 120,
  maxRetriesPerSequence: 2,
  approvalAwareResume: false,
  maxRuns: Number.MAX_SAFE_INTEGER
});

export const DEFAULT_RUNTIME = Object.freeze({
  enabled: false,
  runCount: 0,
  lastRunId: null,
  lastHandledSequence: -1,
  lastSentAt: null,
  sameSequenceRetryCount: 0,
  pendingSequence: null,
  pendingRunId: null,
  pendingIsRetry: false,
  stopReason: null,
  lastError: null,
  lastStatus: null,
  lastSequence: null,
  lastCheckedAt: null,
  rateLimitRemaining: null,
  rateLimitResetAt: null,
  rateLimitPausedUntil: null,
  rateLimitPauseReason: null,
  handoffPending: false,
  handoffFromTabId: null,
  handoffToTabId: null,
  bootstrapPending: false,
  bootstrapRequestedAt: null,
  bootstrapCompletedAt: null
});

// Compatibility surface for legacy single-session storage migration.
export const DEFAULT_SETTINGS = Object.freeze({
  ...DEFAULT_CONFIG,
  ...DEFAULT_RUNTIME,
  targetTabId: null
});

const TAB_CONFIG_PREFIX = "tabConfig:";
const TAB_RUNTIME_PREFIX = "tabRuntime:";
const TAB_DRAFT_PREFIX = "tabDraft:";

export function tabConfigKey(tabId) {
  return `${TAB_CONFIG_PREFIX}${normalizeTabId(tabId)}`;
}

export function tabRuntimeKey(tabId) {
  return `${TAB_RUNTIME_PREFIX}${normalizeTabId(tabId)}`;
}

export function tabDraftKey(tabId) {
  return `${TAB_DRAFT_PREFIX}${normalizeTabId(tabId)}`;
}

export function tabIdFromRuntimeKey(key) {
  if (typeof key !== "string" || !key.startsWith(TAB_RUNTIME_PREFIX)) return null;
  const value = Number(key.slice(TAB_RUNTIME_PREFIX.length));
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function normalizeTabId(tabId) {
  const value = Number(tabId);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("A valid Chrome tab ID is required");
  }
  return value;
}

export function parseControlPayload(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("control.json is not valid JSON");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("control.json must contain a JSON object");
  }

  const allowedKeys = new Set([
    "version",
    "run_id",
    "sequence",
    "status",
    "reason",
    "updated_at",
    "task_id"
  ]);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length) {
    throw new Error(`control.json contains unsupported fields: ${unknownKeys.join(", ")}`);
  }

  if (value.version !== 1) throw new Error("control.json version must be 1");
  if (typeof value.run_id !== "string" || value.run_id.trim() === "") {
    throw new Error("control.json run_id must be a non-empty string");
  }
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 0) {
    throw new Error("control.json sequence must be a non-negative integer");
  }
  if (!CONTROL_STATUSES.has(value.status)) {
    throw new Error(`Unsupported control status: ${String(value.status)}`);
  }
  if (typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) {
    throw new Error("control.json updated_at must be an ISO-8601 date-time string");
  }
  if (value.reason !== undefined && typeof value.reason !== "string") {
    throw new Error("control.json reason must be a string when present");
  }
  if (value.task_id !== undefined && (typeof value.task_id !== "string" || value.task_id.trim() === "")) {
    throw new Error("control.json task_id must be a non-empty string when present");
  }

  return {
    version: 1,
    runId: value.run_id,
    sequence: value.sequence,
    status: value.status,
    reason: typeof value.reason === "string" ? value.reason : "",
    updatedAt: value.updated_at,
    taskId: typeof value.task_id === "string" ? value.task_id : ""
  };
}

export function effectivePollInterval(seconds, hasToken, unauthenticatedWatcherCount = 1) {
  const parsed = Number(seconds);
  const watcherCount = hasToken
    ? 1
    : Math.max(1, Math.floor(Number(unauthenticatedWatcherCount) || 1));
  const minimum = hasToken ? 5 : 90 * watcherCount;
  const fallback = hasToken ? 10 : minimum;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.floor(parsed));
}

export function effectiveRetryDelay(seconds, pollIntervalSeconds) {
  const poll = Math.max(1, Math.floor(Number(pollIntervalSeconds) || 60));
  const parsed = Number(seconds);
  const fallback = Math.max(120, poll + 5);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(poll + 5, Math.floor(parsed));
}

export function normalizeMaxRetries(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 2;
  return Math.min(10, Math.max(0, Math.floor(parsed)));
}

export function continuationDisposition(control, settings, nowMs = Date.now()) {
  const lastHandled = Number(settings.lastHandledSequence ?? -1);

  if (control.sequence > lastHandled) return { action: "send", isRetry: false };
  if (control.sequence < lastHandled) return { action: "stale", isRetry: false };

  const lastSentMs = Date.parse(String(settings.lastSentAt || ""));
  const controlUpdatedMs = Date.parse(String(control.updatedAt || ""));
  if (
    Number.isFinite(lastSentMs) &&
    Number.isFinite(controlUpdatedMs) &&
    controlUpdatedMs > lastSentMs
  ) {
    return { action: "send", isRetry: false };
  }

  const maxRetries = normalizeMaxRetries(settings.maxRetriesPerSequence);
  const retryCount = Number(settings.sameSequenceRetryCount || 0);
  if (retryCount >= maxRetries) return { action: "retry_limit", isRetry: true };
  if (!Number.isFinite(lastSentMs)) return { action: "send", isRetry: true };

  const retryDelayMs = effectiveRetryDelay(
    settings.retryDelaySeconds,
    settings.pollIntervalSeconds
  ) * 1000;
  const retryAfterMs = lastSentMs + retryDelayMs - nowMs;
  if (retryAfterMs > 0) return { action: "wait", isRetry: true, retryAfterMs };
  return { action: "send", isRetry: true };
}

// Legacy compatibility: old saved configs may still contain maxRuns=20/100.
// Treat every legacy value as effectively unbounded so long-running workflows
// are governed only by per-generation retry safety, not a lifetime send cap.
export function normalizeMaxRuns(_value) {
  return Number.MAX_SAFE_INTEGER;
}

export function streamKey(settings) {
  return [settings.owner, settings.repo, settings.branch, settings.path]
    .map((part) => String(part || "").trim())
    .join("/");
}

// The exported function name is retained as a v0.4 internal compatibility identifier.
export function buildRerunConnectionPrompt() {
  return [
    "Connect the GitHub project that this ChatGPT conversation is actually using to The Voyage of Theseus.",
    "Important: before the first connection, the Side Panel is intentionally Unconnected. Owner, Repository, and Branch values in the Side Panel are not trusted identification inputs. Do not use Side Panel values or examples in this prompt as evidence of repository identity.",
    "First determine whether this conversation has actually accessed or modified a GitHub repository and branch/ref through the GitHub app or tools. A repository name mentioned only in chat text is not enough.",
    "If no actually-used GitHub repository can be identified, write no files. Report `RERUN_CONNECTION: UNCONNECTED`, tell the user to first read or work with the target GitHub repository in this conversation, then stop.",
    "If more than one repository is plausible or the branch/ref is ambiguous, write no files. Report `RERUN_CONNECTION: AMBIGUOUS`, list the candidates and the exact clarification required, then stop.",
    "Once exactly one repository and branch/ref are established, read README, AGENTS.md, CONTRIBUTING.md, and any other project instructions, then determine the user's actual project goal from the conversation and repository state.",
    "Create or safely reconcile the five protocol files at `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, and `control.json`.",
    "If `.chatgpt-rerun` already contains an active run, do not reset or overwrite valid run_id, sequence, task, checkpoint, or verification history. Reconcile README/control/STATE/PLAN first and change only missing or incompatible protocol details.",
    "For a new project, README.md must define the mandatory read order (README -> control -> STATE -> PLAN), preflight reconciliation, the 20-minute hard stop with an approximately 18-minute checkpoint, and the PLAN -> STATE -> control.json authoritative write order. STATUS.md is a presentation-only projection, not reconciliation source of truth.",
    "README.md must also state that Chrome Start/Stop controls the tab watcher independently from GitHub work status. `continue` authorizes work. `complete`, `needs_user`, and `blocked` pause dispatch but do not turn the watcher off. A later valid `continue`, even on the same sequence with a newer updated_at, may re-authorize work.",
    "PLAN.md must contain the actual project goal, task IDs, dependencies, acceptance criteria, and verification method. STATE.md must contain a new unique run_id for a new project, sequence 0, the first task, the real checkpoint, and the Next Exact Action.",
    "For a new project, publish control.json only after PLAN and STATE. Use version 1, the same run_id, sequence 0, status `continue`, the first task_id, and the current ISO-8601 updated_at. Never use a `working` status.",
    "If GitHub write permission is unavailable or the project goal is still unclear, do not pretend setup succeeded. Request the required permission or decision instead.",
    "After protocol installation/reconciliation and the final control write, do not start the implementation task during this connection turn.",
    "Before ending, report `RERUN_CONNECTION: CONNECTED` and include: repository full name (owner/repo), canonical GitHub repository URL, exact branch/ref, control path `.chatgpt-rerun/control.json`, whether this was a new install or reconciliation of an existing run, run_id, sequence, control status, task_id, and a concise project-goal summary.",
    "The extension does not parse the assistant response to secretly fill these values. The user verifies the result, enters the confirmed Owner/Repository/Branch in the Side Panel, saves the connection, and starts the watcher."
  ].join(" ");
}

export function isAutoBootstrapPath(config) {
  const path = String(config?.path || DEFAULT_CONFIG.path).replace(/^\/+/, "").trim();
  return path === DEFAULT_CONFIG.path;
}

export function buildRepositoryBootstrapPrompt(config) {
  const owner = String(config.owner || "").trim();
  const repo = String(config.repo || "").trim();
  const branch = String(config.branch || "main").trim() || "main";
  const path = String(config.path || DEFAULT_CONFIG.path).replace(/^\/+/, "").trim() || DEFAULT_CONFIG.path;

  return [
    `GitHub repository ${owner}/${repo} on branch ${branch} does not yet have the standard The Voyage of Theseus state protocol.`,
    `The target control path is ${path}. Bootstrap the repository before starting automated product work.`,
    "First read the repository README, AGENTS.md, CONTRIBUTING.md, and other project instructions, then determine the actual user goal from this conversation and repository state.",
    "Create `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, and `control.json`, or safely add only missing compatible files when partial state already exists. Do not blindly overwrite existing state.",
    "README.md must define the read order (README -> control -> STATE -> PLAN), control/STATE reconciliation, PLAN -> STATE -> control.json authoritative write order, the 20-minute hard stop with an approximately 18-minute checkpoint, and the presentation-only STATUS.md rules.",
    "README.md must state that Chrome Start/Stop controls the tab watcher independently from GitHub `continue/complete/needs_user/blocked` work status. The watcher may keep polling through terminal work states and resume later on a valid `continue` authorization.",
    "PLAN.md must record the actual goal, task IDs, dependencies, acceptance criteria, and verification method. STATE.md must record a new unique run_id, sequence 0, the first task, the real checkpoint, and the Next Exact Action.",
    "STATUS.md should give humans a concise live view of goal, progress, recent verification, next action, and blockers. It must not become reconciliation source of truth.",
    "Only after PLAN and STATE are durable, publish control.json with version 1, the same run_id, sequence 0, status `continue`, the first task_id, and the current ISO-8601 updated_at. Never use `working`.",
    "If write permission or the project goal is unclear, do not guess or publish control. Request what is missing.",
    "After control.json is successfully published, end this bootstrap turn without implementing the first product task. The watcher will detect the new control and start the next execution."
  ].join(" ");
}

export function buildNewChatHandoffPrompt(config, control) {
  const owner = String(config.owner || "").trim();
  const repo = String(config.repo || "").trim();
  const branch = String(config.branch || "main").trim() || "main";
  const path = String(config.path || DEFAULT_CONFIG.path).trim() || DEFAULT_CONFIG.path;
  const runId = String(control?.runId || "unknown");
  const sequence = Number.isSafeInteger(control?.sequence) ? control.sequence : "unknown";
  const status = String(control?.status || "unknown");
  const taskId = String(control?.taskId || "unknown");
  const workInstruction = status === "continue"
    ? "If the latest control is still `continue`, do not depend on the previous conversation or repeat verified work. Resume from the exact unfinished checkpoint and Next Exact Action in STATE.md."
    : "If the latest control is `complete`, `needs_user`, or `blocked`, do not start implementation. Recover only the repository/run context, confirm the waiting reason, and stop. The watcher may keep polling and later resume on a valid `continue`.";

  return [
    "Continue The Voyage of Theseus by transferring GitHub watcher ownership into this fresh ChatGPT conversation.",
    `Read GitHub repository ${owner}/${repo} on branch ${branch}.`,
    `Read ${path} and the sibling README.md, control.json, STATE.md, and PLAN.md in the protocol order, then perform preflight reconciliation.`,
    `Handoff reference: run_id=${runId}, sequence=${sequence}, status=${status}, task_id=${taskId}. If current GitHub state differs, GitHub is authoritative.`,
    workInstruction,
    "Respect the 20-minute execution limit and the PLAN -> STATE -> control.json write order."
  ].join(" ");
}
