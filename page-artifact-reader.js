(() => {
  const SCRIPT_REVISION = "artifact-direct-v227-20260901";
  if (globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER_REVISION__ === SCRIPT_REVISION) return;
  globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER__ = true;
  globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER_REVISION__ = SCRIPT_REVISION;

  const REQUEST_SOURCE = "chatgpt-rerun-v2-artifact-request";
  const RESPONSE_SOURCE = "chatgpt-rerun-v2-artifact-response";
  const CONTROL_BEGIN = "RERUN_V2_CONTROL_BEGIN";
  const CONTROL_END = "RERUN_V2_CONTROL_END";
  const MAX_JSON_BYTES = 1024 * 1024;
  const CONTROL_KINDS = new Set([
    "chatgpt-rerun-goal",
    "chatgpt-rerun-result",
    "chatgpt-rerun-worker-ready"
  ]);

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== REQUEST_SOURCE || !data.requestId) return;
    const expectedFilename = String(data.expectedFilename || "");
    if (!/^rerun-(?:goal|result|worker-ready)-[A-Za-z0-9._-]+\.json$/.test(expectedFilename)) return;

    void resolveArtifact(expectedFilename)
      .then((result) => {
        window.postMessage({ source: RESPONSE_SOURCE, requestId: data.requestId, ok: true, ...result }, "*");
      })
      .catch((error) => {
        window.postMessage({
          source: RESPONSE_SOURCE,
          requestId: data.requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        }, "*");
      });
  });

  async function resolveArtifact(expectedFilename) {
    const inlineValue = findInlineControl(expectedFilename);
    if (inlineValue) return { value: inlineValue };

    const conversationId = location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || "";
    if (!conversationId) throw new Error("conversation_id_missing");

    const sessionResponse = await fetch("/api/auth/session", {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    if (!sessionResponse.ok) throw new Error(`auth_session_${sessionResponse.status}`);
    const session = await sessionResponse.json();
    const accessToken = String(session?.accessToken || "");
    const accountId = String(session?.account?.id || "");
    if (!accessToken) throw new Error("auth_access_token_missing");

    const authHeaders = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    if (accountId) authHeaders["chatgpt-account-id"] = accountId;

    const conversation = await apiJson(
      `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
      authHeaders,
      "conversation_fetch"
    );

    const matched = findMatchingMessage(conversation, expectedFilename);
    if (!matched) throw new Error("artifact_message_not_found");

    const messageId = String(matched.message?.id || matched.nodeId || "");
    const sandboxPath = findSandboxPath(matched.message, expectedFilename);
    const fileId = findFileId(matched.message);

    const attempts = [];
    if (messageId && sandboxPath) {
      const params = new URLSearchParams({ message_id: messageId, sandbox_path: sandboxPath });
      attempts.push(`/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?${params}`);
      attempts.push(`/backend-api/conversation/${encodeURIComponent(conversationId)}/download_from_sandbox/v2?${params}`);
    }
    if (fileId) {
      const query = `conversation_id=${encodeURIComponent(conversationId)}&inline=false`;
      attempts.push(`/backend-api/files/download/${encodeURIComponent(fileId)}?${query}`);
      attempts.push(`/backend-api/files/${encodeURIComponent(fileId)}/download?${query}`);
    }
    if (!attempts.length) throw new Error("artifact_identity_missing");

    const errors = [];
    for (const path of attempts) {
      try {
        return await resolveDownloadAttempt(path, authHeaders);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
    throw new Error(`artifact_resolve_failed:${errors.join(",")}`);
  }

  async function resolveDownloadAttempt(path, headers) {
    const response = await fetch(path, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`artifact_download_${response.status}`);

    const text = await response.text();
    if (!text.trim()) throw new Error("artifact_download_empty");
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new Error("artifact_content_too_large");

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }

    if (isControlObject(parsed)) return { value: parsed };

    const metadataUrl = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? String(parsed.download_url || parsed.downloadUrl || parsed.url || "")
      : "";
    if (metadataUrl) return { downloadUrl: validateDownloadUrl(metadataUrl) };

    const rawUrl = String(typeof parsed === "string" ? parsed : text).trim();
    if (/^https?:\/\//i.test(rawUrl)) return { downloadUrl: validateDownloadUrl(rawUrl) };

    throw new Error(parsed ? "artifact_download_url_missing" : "artifact_content_invalid_json");
  }

  function validateDownloadUrl(value) {
    const resolved = new URL(String(value || ""), location.origin);
    const allowed = resolved.protocol === "https:" && (
      resolved.hostname === "chatgpt.com" ||
      resolved.hostname === "chat.openai.com" ||
      resolved.hostname === "files.oaiusercontent.com" ||
      resolved.hostname.endsWith(".oaiusercontent.com")
    );
    if (!allowed) throw new Error("artifact_download_host_rejected");
    return resolved.href;
  }

  function findInlineControl(expectedFilename) {
    const marker = `${CONTROL_BEGIN} ${expectedFilename}`;
    const turns = Array.from(document.querySelectorAll?.('[data-message-author-role="assistant"]') || []);
    for (let index = turns.length - 1; index >= 0; index -= 1) {
      const turn = turns[index];
      const text = String(turn?.innerText || turn?.textContent || "");
      const start = text.lastIndexOf(marker);
      if (start < 0) continue;
      const payloadStart = start + marker.length;
      const end = text.indexOf(CONTROL_END, payloadStart);
      if (end < 0) continue;
      const raw = stripOptionalCodeFence(text.slice(payloadStart, end).trim());
      try {
        const value = JSON.parse(raw);
        if (isControlObject(value)) return value;
      } catch {
        // The marker can become visible before the streamed JSON is complete.
      }
    }
    return null;
  }

  function stripOptionalCodeFence(value) {
    return String(value || "")
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
  }

  function isControlObject(value) {
    return Boolean(
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Number(value.version) === 2 &&
      CONTROL_KINDS.has(String(value.kind || ""))
    );
  }

  async function apiJson(path, headers, stage) {
    const response = await fetch(path, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`${stage}_${response.status}`);
    return response.json();
  }

  function findMatchingMessage(conversation, expectedFilename) {
    const mapping = conversation?.mapping && typeof conversation.mapping === "object" ? conversation.mapping : {};
    let best = null;
    let bestTime = -Infinity;
    for (const [nodeId, node] of Object.entries(mapping)) {
      const message = node?.message;
      if (!message || !containsString(message, expectedFilename)) continue;
      const created = Number(message.create_time || 0);
      if (!best || created >= bestTime) {
        best = { nodeId, message };
        bestTime = created;
      }
    }
    return best;
  }

  function containsString(value, needle) {
    const stack = [value];
    let visited = 0;
    while (stack.length && visited < 20000) {
      const current = stack.pop();
      visited += 1;
      if (typeof current === "string") {
        if (current.includes(needle)) return true;
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) stack.push(...current);
      else stack.push(...Object.values(current));
    }
    return false;
  }

  function findSandboxPath(value, expectedFilename) {
    const stack = [value];
    let visited = 0;
    while (stack.length && visited < 20000) {
      const current = stack.pop();
      visited += 1;
      if (typeof current === "string") {
        const marker = "sandbox:";
        let index = current.indexOf(marker);
        while (index >= 0) {
          const tail = current.slice(index + marker.length);
          const end = tail.search(/[)\]\s"']/);
          const raw = (end >= 0 ? tail.slice(0, end) : tail).trim();
          if (raw.includes(expectedFilename)) {
            try { return decodeURIComponent(raw); } catch { return raw; }
          }
          index = current.indexOf(marker, index + marker.length);
        }
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) stack.push(...current);
      else stack.push(...Object.values(current));
    }
    return "";
  }

  function findFileId(value) {
    const stack = [value];
    let visited = 0;
    while (stack.length && visited < 20000) {
      const current = stack.pop();
      visited += 1;
      if (typeof current === "string") {
        const direct = current.match(/\b(file_[A-Za-z0-9_-]+)\b/);
        if (direct) return direct[1];
        const pointer = current.match(/(?:file-service|sediment):\/\/(file_[A-Za-z0-9_-]+)/);
        if (pointer) return pointer[1];
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) stack.push(...current);
      else stack.push(...Object.values(current));
    }
    return "";
  }
})();
