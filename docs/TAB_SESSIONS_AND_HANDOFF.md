# Tab Sessions and New-Chat Handoff

## Goal

ChatGPT Rerun keeps one independent watcher/runtime per ChatGPT tab while GitHub remains the durable workflow source of truth. A long workflow may stay on one `sequence` across many ChatGPT executions and, when the current conversation is no longer dispatchable, ownership may move to one fresh ChatGPT tab.

## Per-tab storage

```text
tabConfig:<tabId>   # repo/branch/control/poll/retry/prompt/approval mode
tabRuntime:<tabId>  # watcher/run/sequence/retry/handoff runtime
tabDraft:<tabId>    # Side Panel draft
```

Start/Stop affects only the current tab. Two enabled tabs cannot own the same owner/repo/branch/control stream simultaneously.

## Normal execution chaining

The normal workflow cadence is completion-driven, not retry-driven.

```text
Rerun submits prompt
-> ChatGPT generation becomes active
-> generation finishes normally
-> same-sequence retry history clears
-> immediate one-shot GitHub control refresh
-> latest continue: submit next Rerun prompt immediately
-> latest terminal state: wait while watcher remains enabled
```

Regular GitHub polling and same-sequence retry delay protect idle/external-change and abnormal-recovery cases; they do not pace successful executions.

Manual user Stop and 23-minute watchdog Stop are not normal completion and use their existing guarded recovery behavior.

## Exhausted/non-dispatchable chat recovery — v0.2.18

A valid `continue` can arrive while the current ChatGPT conversation is idle but no usable composer exists. Prior behavior silently returned and left the watcher Watching indefinitely.

v0.2.18 uses this flow:

```text
POLL -> continue
-> current composer available? use it
-> otherwise wait up to 5 seconds for SPA rendering
-> composer appears? use it
-> still absent? reuse HANDOFF_NEW_CHAT
-> one fresh ChatGPT tab
-> transfer watcher ownership/context
-> auto-submit GitHub-backed handoff prompt
```

This deliberately reuses the existing handoff mechanism instead of introducing a second ownership-transfer implementation.

If direct handoff prompt submission fails, the new watcher safe-stops. It must not recursively open more fresh chats.

## Continue in new chat

Manual `Continue in new chat` and automatic exhausted-chat recovery both use the same background ownership-transfer path:

1. Read latest GitHub control.
2. Mark old tab `handoffPending`.
3. Open one new ChatGPT tab.
4. Copy tab config/runtime ownership.
5. Stop old watcher and enable new watcher.
6. Automatically submit a handoff prompt containing owner/repo, branch, control path, run_id, sequence, status, and task_id.
7. New chat re-reads GitHub Rerun state rather than relying on prior chat body.

Handoff is allowed even when GitHub status is terminal. A terminal handoff restores context and waits; later `continue` resumes automatically.

## Same-stream collision guard

Stream identity is:

```text
owner / repo / branch / control path
```

Start or handoff refuses a second enabled owner for the same stream.

## User-draft safety

A non-empty composer containing user text is never overwritten. A stale exact Rerun-owned prompt may be recognized as Rerun state and route to fresh-chat recovery.

## GitHub approval-aware resume

When **GitHub 승인 후 자동 계속** is enabled, a visible GitHub action-confirmation card pauses Rerun polling/retry while the user decides. Rerun never clicks approval, OAuth, repository-access, or admin confirmation controls. Polling resumes after manual approval and card disappearance.

## 23-minute stuck-generation watchdog

If a Rerun-owned generation remains active for 23 active minutes, excluding approval wait time, Rerun re-arms abnormal recovery state and clicks the current visible/actionable ChatGPT Stop once. It does not target unrelated manual ChatGPT generations.

## Manual verification

### Normal continuation

1. Reload the current extension.
2. Keep watcher Watching on an intentional `continue` stream.
3. Let a Rerun response finish normally.
4. Verify Same-sequence retries becomes `0/N` and the next prompt starts without ordinary polling/retry delay.

### Missing-composer fresh-chat recovery

1. Use v0.2.18 with watcher Watching and GitHub `continue`.
2. Put the current conversation in an idle state where no usable composer exists.
3. Verify Rerun waits up to 5 seconds for a transient composer.
4. If none appears, verify exactly one fresh ChatGPT tab opens.
5. Verify watcher ownership/context moves to the new tab and the handoff prompt is automatically submitted.
6. Verify the old watcher is stopped as handed off.
7. Verify direct handoff failure does not open another recursive tab.

### Approval and watchdog

Retain the existing manual-approval and 23-minute watchdog safety probes.

## Chrome version

Tab-specific Side Panel uses `chrome.sidePanel.open({ tabId })`; minimum Chrome version remains 116.
