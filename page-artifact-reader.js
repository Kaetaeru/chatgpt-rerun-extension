(() => {
  const SCRIPT_REVISION = "artifact-dom-first-v228-20260901";
  if (globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER_REVISION__ === SCRIPT_REVISION) return;
  globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER__ = true;
  globalThis.__CHATGPT_RERUN_V2_PAGE_ARTIFACT_READER_REVISION__ = SCRIPT_REVISION;

  const REQUEST_SOURCE = "chatgpt-rerun-v2-artifact-request";
  const RESPONSE_SOURCE = "chatgpt-rerun-v2-artifact-response";
  const CONTROL_BEGIN = "RERUN_V2_CONTROL_BEGIN";
  const CONTROL_END = "RERUN_V2_CONTROL_END";
  const MAX_JSON_BYTES = 1024 * 1024;
  const CONVERSATION_429_COOLDOWN_MS = 60_000;
  const CONTROL_KINDS = new Set([
    "chatgpt-rerun-goal",
    "chatgpt-rerun-result",
    "chatgpt-rerun-worker-ready"
  ]);

  let conversationFallbackBlockedUntil = 0;

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
    const rendered = findRenderedArtifactIdentity(expectedFilename);
    if (rendered) {
      const session = await getSessionContext();
      const renderedResult = await resolveRenderedArtifact(rendered, conversationId, session.headers);
      if (renderedResult) return renderedResult;
    }

    if (!conversationId) throw new Error("conversation_id_missing");
    if (Date.now() < conversationFallbackBlockedUntil) {
      const waitSeconds = Math.max(1, Math.ceil((conversationFallbackBlockedUntil - Date.now()) / 1000));
      throw new Error(`conversation_fetch_rate_limited_wait_${waitSeconds}s`);
    }

    const session = await getSessionContext();
    const conversation = await fetchConversation(conversationId, session.headers);
    const matched = findMatchingMessage(conversation, expectedFilename);
    if (!matched) throw new Error("artifact_message_not_found");

    const identity = {
      messageIds: uniqueStrings([String(matched.message?.id || matched.nodeId || "")]),
      sandboxPaths: uniqueStrings([findSandboxPath(matched.message, expectedFilename)]),
      fileIds: uniqueStrings([findFileId(matched.message)]),
      targets: []
    };
    const result = await resolveRenderedArtifact(identity, conversationId, session.headers);
    if (result) return result;
    throw new Error("artifact_identity_missing");
  }

  async function getSessionContext() {
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
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    if (accountId) headers["chatgpt-account-id"] = accountId;
    return { headers };
  }

  async function fetchConversation(conversationId, headers) {
    const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
      method: "GET",
      headers,
      credentials: "include",
      cache: "no-store"
    });
    if (response.status === 429) {
      conversationFallbackBlockedUntil = Date.now() + CONVERSATION_429_COOLDOWN_MS;
      throw new Error("conversation_fetch_429_rate_limited");
    }
    if (!response.ok) throw new Error(`conversation_fetch_${response.status}`);
    return response.json();
  }

  async function resolveRenderedArtifact(identity, conversationId, headers) {
    for (const target of identity.targets || []) {
      try {
        const result = await resolveRenderedTarget(target, headers);
        if (result) return result;
      } catch {
        // Keep trying stronger identifiers from the same rendered card.
      }
    }

    if (conversationId) {
      for (const fileId of identity.fileIds || []) {
        const query = `conversation_id=${encodeURIComponent(conversationId)}&inline=false`;
        for (const path of [
          `/backend-api/files/download/${encodeURIComponent(fileId)}?${query}`,
          `/backend-api/files/${encodeURIComponent(fileId)}/download?${query}`
        ]) {
          try { return await resolveDownloadAttempt(path, headers); } catch {}
        }
      }

      const messageIds = identity.messageIds?.length ? identity.messageIds : [""];
      for (const sandboxPath of identity.sandboxPaths || []) {
        for (const messageId of messageIds) {
          const params = new URLSearchParams({ sandbox_path: sandboxPath });
          if (messageId) params.set("message_id", messageId);
          for (const path of [
            `/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?${params}`,
            `/backend-api/conversation/${encodeURIComponent(conversationId)}/download_from_sandbox/v2?${params}`
          ]) {
            try { return await resolveDownloadAttempt(path, headers); } catch {}
          }
        }
      }
    }
    return null;
  }

  async function resolveRenderedTarget(target, headers) {
    const raw = String(target || "").trim();
    if (!raw || raw.startsWith("sandbox:")) return null;
    if (raw.startsWith("blob:")) {
      const response = await fetch(raw, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error(`artifact_blob_${response.status}`);
      return { value: parseControlText(await response.text()) };
    }

    const resolved = new URL(raw, location.origin);
    if (resolved.hostname === "files.oaiusercontent.com" || resolved.hostname.endsWith(".oaiusercontent.com")) {
      return { downloadUrl: validateDownloadUrl(resolved.href) };
    }
    if (resolved.hostname === "chatgpt.com" || resolved.hostname === "chat.openai.com") {
      return resolveDownloadAttempt(resolved.href, headers);
    }
    return null;
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
    try { parsed = JSON.parse(text); } catch { parsed = null; }
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

  function findRenderedArtifactIdentity(expectedFilename) {
    const turns = Array.from(document.querySelectorAll?.('[data-message-author-role="assistant"]') || []);
    for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
      const turn = turns[turnIndex];
      if (!nodeMentionsFilename(turn, expectedFilename)) continue;
      const nodes = [turn, ...Array.from(turn.querySelectorAll?.("*") || [])].slice(0, 2500);
      const matching = nodes.filter((node) => nodeMentionsFilename(node, expectedFilename));
      if (!matching.length) continue;

      matching.sort((a, b) => String(a.textContent || "").length - String(b.textContent || "").length);
      const roots = matching.slice(0, 8);
      const inspected = new Set();
      for (const root of roots) {
        let current = root;
        for (let depth = 0; current && depth < 7; depth += 1, current = current.parentElement) {
          inspected.add(current);
          for (const child of Array.from(current.querySelectorAll?.("*") || []).slice(0, 500)) inspected.add(child);
          if (current === turn) break;
        }
      }

      const values = [];
      const messageIds = [];
      for (const node of inspected) {
        const attrs = Array.from(node?.attributes || []);
        for (const attr of attrs) {
          const name = String(attr.name || "");
          const value = String(attr.value || "").trim();
          if (!value) continue;
          values.push(value);
          if (/message/i.test(name) && /[A-Za-z0-9_-]{8,}/.test(value)) messageIds.push(value);
        }
        if (node?.href) values.push(String(node.href));
      }

      const targets = [];
      const fileIds = [];
      const sandboxPaths = [];
      for (const value of values) {
        const fileMatch = value.match(/\b(file_[A-Za-z0-9_-]+)\b/);
        if (fileMatch) fileIds.push(fileMatch[1]);

        for (const match of value.matchAll(/sandbox:\/[^\s"'<>)}\]]+/g)) {
          if (match[0].includes(expectedFilename)) sandboxPaths.push(match[0].replace(/^sandbox:/, ""));
        }

        if (/^(?:https?:|blob:|\/backend-api\/)/i.test(value) && value.includes(expectedFilename)) targets.push(value);
        else if (/^(?:https?:|blob:|\/backend-api\/)/i.test(value) && /(?:download|file|sandbox)/i.test(value)) targets.push(value);
      }

      const identity = {
        targets: uniqueStrings(targets),
        fileIds: uniqueStrings(fileIds),
        sandboxPaths: uniqueStrings(sandboxPaths),
        messageIds: uniqueStrings(messageIds)
      };
      if (identity.targets.length || identity.fileIds.length || identity.sandboxPaths.length) return identity;
    }
    return null;
  }

  function nodeMentionsFilename(node, expectedFilename) {
    if (!node) return false;
    const text = String(node.textContent || "");
    if (text.includes(expectedFilename)) return true;
    for (const attr of Array.from(node.attributes || [])) {
      if (String(attr.value || "").includes(expectedFilename)) return true;
    }
    return false;
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

  function parseControlText(text) {
    const source = String(text || "");
    if (!source.trim()) throw new Error("artifact_content_empty");
    if (new TextEncoder().encode(source).byteLength > MAX_JSON_BYTES) throw new Error("artifact_content_too_large");
    let value;
    try { value = JSON.parse(source); } catch { throw new Error("artifact_content_invalid_json"); }
    if (!isControlObject(value)) throw new Error("artifact_content_not_rerun_control");
    return value;
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
        for (const match of current.matchAll(/sandbox:\/[^\s"'<>)}\]]+/g)) {
          if (!match[0].includes(expectedFilename)) continue;
          const raw = match[0].replace(/^sandbox:/, "");
          try { return decodeURIComponent(raw); } catch { return raw; }
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
        continue;
      }
      if (!current || typeof current !== "object") continue;
      if (Array.isArray(current)) stack.push(...current);
      else stack.push(...Object.values(current));
    }
    return "";
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
  }
})();
