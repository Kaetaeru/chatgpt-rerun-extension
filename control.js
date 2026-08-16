export const CONTROL_STATUSES = new Set([
  "continue",
  "complete",
  "needs_user",
  "blocked"
]);

export const DEFAULT_CONFIG = Object.freeze({
  owner: "",
  repo: "",
  branch: "main",
  path: ".chatgpt-rerun/control.json",
  githubToken: "",
  resumePrompt: "진행. 먼저 이 대화에서 연결된 GitHub 저장소의 .chatgpt-rerun/README.md, control.json, STATE.md, PLAN.md를 안내된 순서대로 읽고 저장소 상태를 확인한 뒤, 현재 sequence의 미완료 지점부터 재개해. 검증된 작업은 반복하지 말고 프로토콜에 따라 GitHub 상태를 갱신해.",
  pollIntervalSeconds: 60,
  retryDelaySeconds: 120,
  maxRetriesPerSequence: 2,
  maxRuns: 20
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

  if (value.version !== 1) {
    throw new Error("control.json version must be 1");
  }

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

export function effectivePollInterval(seconds, hasToken) {
  const parsed = Number(seconds);
  const fallback = hasToken ? 10 : 60;
  if (!Number.isFinite(parsed)) return fallback;
  const minimum = hasToken ? 5 : 60;
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

  if (control.sequence > lastHandled) {
    return { action: "send", isRetry: false };
  }

  if (control.sequence < lastHandled) {
    return { action: "stale", isRetry: false };
  }

  const maxRetries = normalizeMaxRetries(settings.maxRetriesPerSequence);
  const retryCount = Number(settings.sameSequenceRetryCount || 0);
  if (retryCount >= maxRetries) {
    return { action: "retry_limit", isRetry: true };
  }

  const lastSentMs = Date.parse(String(settings.lastSentAt || ""));
  if (!Number.isFinite(lastSentMs)) {
    return { action: "send", isRetry: true };
  }

  const retryDelayMs = effectiveRetryDelay(
    settings.retryDelaySeconds,
    settings.pollIntervalSeconds
  ) * 1000;
  const retryAfterMs = lastSentMs + retryDelayMs - nowMs;
  if (retryAfterMs > 0) {
    return { action: "wait", isRetry: true, retryAfterMs };
  }

  return { action: "send", isRetry: true };
}

export function normalizeMaxRuns(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(100, Math.max(1, Math.floor(parsed)));
}

export function streamKey(settings) {
  return [settings.owner, settings.repo, settings.branch, settings.path]
    .map((part) => String(part || "").trim())
    .join("/");
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
    `GitHub 저장소 ${owner}/${repo}, branch ${branch}에 ChatGPT Rerun 표준 상태 디렉터리가 아직 없다.`,
    `대상 control 경로는 ${path}다. 자동 작업을 시작하기 전에 저장소를 bootstrap해.`,
    "먼저 대상 저장소의 README, AGENTS.md, CONTRIBUTING.md 등 프로젝트 지침과 이 대화의 사용자 목표를 확인해 실제 작업 목표를 파악해.",
    "그 다음 `.chatgpt-rerun/README.md`, `PLAN.md`, `STATE.md`, `STATUS.md`, `control.json` 다섯 파일을 생성하거나, 일부가 이미 있으면 내용을 보존하며 호환 가능한 누락 파일만 보완해. 기존 파일을 무조건 덮어쓰지 마.",
    "README.md에는 매 실행 read order(README -> control -> STATE -> PLAN), control/STATE reconciliation, PLAN -> STATE -> control.json authoritative write order, 20분 hard stop/18분 checkpoint, STATUS.md의 사람용 projection 규칙을 포함해.",
    "PLAN.md에는 이 대화와 저장소에서 파악한 실제 목표, task ID, 의존성, acceptance criteria와 검증 방법을 작성해. STATE.md에는 새 고유 run_id, sequence 0, 첫 task, 실제 checkpoint, 다음 정확한 행동을 작성해.",
    "STATUS.md는 사람이 GitHub에서 바로 이해할 수 있도록 현재 목표, 진행률, 최근 검증, 다음 행동, blocker를 요약하고 상태 변화 시 즉시, 긴 실행 중에는 약 5분 freshness를 목표로 갱신하도록 규칙을 적어. STATUS는 reconciliation source of truth가 아니어야 해.",
    "마지막으로만 control.json을 version 1, 같은 run_id, sequence 0, status `continue`, 첫 task_id와 현재 ISO updated_at으로 게시해. `working` 상태는 사용하지 마.",
    "bootstrap 과정에서 GitHub 쓰기 권한이나 프로젝트 목표가 불명확하면 추측해서 control을 게시하지 말고 필요한 내용을 이 대화에서 요청해.",
    "control.json까지 정상 게시되면 이번 bootstrap 실행에서는 첫 구현 task를 시작하지 말고 종료해. 확장프로그램이 새 control을 감지해서 표준 재개 프롬프트로 다음 실행을 자동 시작한다."
  ].join(" ");
}

export function buildNewChatHandoffPrompt(config, control) {
  const owner = String(config.owner || "").trim();
  const repo = String(config.repo || "").trim();
  const branch = String(config.branch || "main").trim() || "main";
  const path = String(config.path || DEFAULT_CONFIG.path).trim() || DEFAULT_CONFIG.path;
  const runId = String(control?.runId || "unknown");
  const sequence = Number.isSafeInteger(control?.sequence) ? control.sequence : "unknown";

  return [
    "새 채팅에서 이전 자동 작업을 이어간다.",
    `GitHub 저장소 ${owner}/${repo}, branch ${branch}를 먼저 읽어.`,
    `${path}와 같은 디렉터리의 README.md, STATE.md, PLAN.md를 규정된 순서대로 읽고 preflight reconciliation을 수행해.`,
    `현재 handoff 기준 run_id=${runId}, sequence=${sequence}다. GitHub의 실제 최신 상태가 다르면 GitHub 상태를 우선해.`,
    "이전 채팅 내용에 의존하거나 완료된 작업을 반복하지 말고, STATE.md의 미완료 지점과 Next Exact Action부터 재개해.",
    "20분 실행 제한과 PLAN -> STATE -> control.json 쓰기 순서를 지켜."
  ].join(" ");
}
