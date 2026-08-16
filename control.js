export const CONTROL_STATUSES = new Set([
  "continue",
  "complete",
  "needs_user",
  "blocked"
]);

export const DEFAULT_SETTINGS = Object.freeze({
  enabled: false,
  owner: "",
  repo: "",
  branch: "main",
  path: ".chatgpt-rerun/control.json",
  githubToken: "",
  resumePrompt: "진행. 먼저 이 대화에서 연결된 GitHub 저장소의 .chatgpt-rerun/README.md, control.json, STATE.md, PLAN.md를 안내된 순서대로 읽고 저장소 상태를 확인한 뒤, 현재 sequence의 미완료 지점부터 재개해. 검증된 작업은 반복하지 말고 프로토콜에 따라 GitHub 상태를 갱신해.",
  pollIntervalSeconds: 60,
  retryDelaySeconds: 120,
  maxRetriesPerSequence: 2,
  maxRuns: 20,
  targetTabId: null,
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
  rateLimitResetAt: null
});

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
