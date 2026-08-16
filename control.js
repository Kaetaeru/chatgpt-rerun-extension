export const CONTROL_STATUSES = new Set([
  "working",
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
  resumePrompt: "진행",
  pollIntervalSeconds: 60,
  maxRuns: 20,
  targetTabId: null,
  runCount: 0,
  lastRunId: null,
  lastHandledSequence: -1,
  pendingSequence: null,
  pendingRunId: null,
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

  return {
    version: 1,
    runId: value.run_id,
    sequence: value.sequence,
    status: value.status,
    reason: typeof value.reason === "string" ? value.reason : ""
  };
}

export function effectivePollInterval(seconds, hasToken) {
  const parsed = Number(seconds);
  const fallback = hasToken ? 10 : 60;
  if (!Number.isFinite(parsed)) return fallback;
  const minimum = hasToken ? 5 : 60;
  return Math.max(minimum, Math.floor(parsed));
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
