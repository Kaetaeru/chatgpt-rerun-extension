(() => {
  if (globalThis.__CHATGPT_RERUN_V2_SANDBOX_FETCH__) return;
  globalThis.__CHATGPT_RERUN_V2_SANDBOX_FETCH__ = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async function rerunFetch(input, init) {
    const requestUrl = typeof input === "string" || input instanceof URL
      ? String(input)
      : String(input?.url || "");
    if (!requestUrl.toLowerCase().startsWith("sandbox:")) {
      return nativeFetch(input, init);
    }

    const sandboxPath = sandboxPathFromUrl(requestUrl);
    const anchor = findSandboxAnchor(requestUrl, sandboxPath);
    const conversationId = currentConversationId();
    const messageId = assistantMessageId(anchor);
    if (!sandboxPath || !conversationId || !messageId) {
      throw new Error("rerun_sandbox_attachment_identity_unavailable");
    }

    const params = new URLSearchParams({
      message_id: messageId,
      sandbox_path: sandboxPath
    });
    const metadataUrl = `${location.origin}/backend-api/conversation/${encodeURIComponent(conversationId)}/interpreter/download?${params.toString()}`;
    const metadataResponse = await nativeFetch(metadataUrl, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
    if (!metadataResponse.ok) {
      throw new Error(`rerun_sandbox_metadata_${metadataResponse.status}`);
    }

    const metadata = await metadataResponse.json();
    const downloadUrl = String(metadata?.download_url || "").trim();
    if (!downloadUrl) throw new Error("rerun_sandbox_download_url_missing");

    return nativeFetch(new URL(downloadUrl, location.origin).href, {
      method: "GET",
      credentials: "include",
      cache: "no-store"
    });
  };

  function currentConversationId() {
    return location.pathname.match(/\/c\/([^/?#]+)/)?.[1] || "";
  }

  function assistantMessageId(anchor) {
    if (!(anchor instanceof Element)) return "";
    const direct = anchor.closest("[data-message-id]")?.getAttribute("data-message-id");
    if (direct) return direct;
    const article = anchor.closest('article[data-turn="assistant"], article[data-testid^="conversation-turn"]');
    return article?.querySelector('[data-message-author-role="assistant"][data-message-id], [data-message-id]')?.getAttribute("data-message-id") ||
      article?.getAttribute("data-turn-id") || "";
  }

  function findSandboxAnchor(requestUrl, sandboxPath) {
    for (const anchor of document.querySelectorAll("a[href]")) {
      const rawHref = String(anchor.getAttribute("href") || "");
      const resolvedHref = String(anchor.href || "");
      if (rawHref === requestUrl || resolvedHref === requestUrl) return anchor;
      if (sandboxPath && sandboxPathFromUrl(rawHref) === sandboxPath) return anchor;
      if (sandboxPath && sandboxPathFromUrl(resolvedHref) === sandboxPath) return anchor;
    }
    return null;
  }

  function sandboxPathFromUrl(value) {
    const text = String(value || "");
    if (!text.toLowerCase().startsWith("sandbox:")) return "";
    let path = text.slice("sandbox:".length).split(/[?#]/, 1)[0];
    if (path.startsWith("//")) path = path.slice(1);
    if (!path.startsWith("/")) path = `/${path}`;
    try {
      return decodeURIComponent(path);
    } catch {
      return path;
    }
  }
})();
