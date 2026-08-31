const params = new URLSearchParams(location.search);
const runId = String(params.get("runId") || "").trim();
const repository = document.getElementById("repository");
const branch = document.getElementById("branch");
const goal = document.getElementById("goal");
const runIdNode = document.getElementById("runId");
const poolStatus = document.getElementById("poolStatus");
const countCard = document.getElementById("countCard");
const workerForm = document.getElementById("workerForm");
const workerCount = document.getElementById("workerCount");
const createWorkers = document.getElementById("createWorkers");
const workers = document.getElementById("workers");
const error = document.getElementById("error");
const ensuredWorkerReaders = new Set();

runIdNode.textContent = runId || "-";

workerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();
  try {
    const count = Number(workerCount.value);
    const response = await chrome.runtime.sendMessage({
      type: "CREATE_WORKER_POOL",
      runId,
      workerCount: count
    });
    if (!response?.ok) throw new Error(response?.error || "Worker pool creation failed.");
    await ensureWorkerArtifactReaders(response.pool);
    render(response.pool);
  } catch (cause) {
    showError(cause);
  }
});

await refresh();
setInterval(() => { void refresh(); }, 1000);

async function refresh() {
  if (!runId) {
    showError("Missing Rerun runId.");
    return;
  }
  try {
    const response = await chrome.runtime.sendMessage({ type: "GET_POOL_STATE", runId });
    if (!response?.ok) throw new Error(response?.error || "Could not load worker pool.");
    await ensureWorkerArtifactReaders(response.pool);
    render(response.pool);
    if (response.pool?.lastError) showError(response.pool.lastError);
    else hideError();
  } catch (cause) {
    showError(cause);
  }
}

async function ensureWorkerArtifactReaders(pool) {
  if (!Array.isArray(pool?.workers)) return;
  for (const worker of pool.workers) {
    const tabId = Number(worker?.tabId);
    if (!Number.isSafeInteger(tabId) || worker?.status !== "preflight" || ensuredWorkerReaders.has(tabId)) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["page-artifact-reader.js"],
        world: "MAIN"
      });
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["artifact-reader.js"]
      });
      ensuredWorkerReaders.add(tabId);
    } catch {
      // A worker may be navigating or may have been closed; refresh will retry.
    }
  }
}

function render(pool) {
  if (!pool) return;
  repository.textContent = pool.config?.repository || "-";
  branch.textContent = pool.config?.branch || "-";
  goal.textContent = pool.config?.goal || "-";
  poolStatus.textContent = String(pool.status || "-").replaceAll("_", " ");

  const configurable = pool.status === "awaiting_worker_count";
  countCard.hidden = !configurable;
  workerCount.disabled = !configurable;
  createWorkers.disabled = !configurable;

  workers.replaceChildren();
  if (!Array.isArray(pool.workers) || pool.workers.length === 0) {
    const empty = document.createElement("span");
    empty.className = "muted";
    empty.textContent = configurable ? "채팅 수를 정하면 Worker 탭이 열립니다." : "Worker를 준비하는 중입니다.";
    workers.appendChild(empty);
    return;
  }

  for (const worker of pool.workers) {
    const row = document.createElement("div");
    row.className = "worker";
    const label = document.createElement("span");
    label.textContent = `Worker ${Number(worker.index) + 1}`;
    const status = document.createElement("span");
    status.className = "status";
    status.textContent = workerStatusLabel(worker.status);
    row.append(label, status);
    workers.appendChild(row);
  }
}

function workerStatusLabel(value) {
  const status = String(value || "");
  if (status === "preflight") return "GITHUB PREFLIGHT";
  if (status === "ready") return "READY";
  if (status === "active") return "ACTIVE";
  if (status === "spent") return "SPENT";
  if (status === "complete") return "COMPLETE";
  if (status === "paused") return "PAUSED";
  if (status === "exhausted") return "EXHAUSTED";
  if (status === "stopped") return "STOPPED";
  return status || "-";
}

function showError(cause) {
  error.hidden = false;
  error.textContent = cause instanceof Error ? cause.message : String(cause);
}

function hideError() {
  error.hidden = true;
  error.textContent = "";
}
