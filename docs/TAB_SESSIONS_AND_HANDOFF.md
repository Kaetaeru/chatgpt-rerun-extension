# Tab Sessions and New-Chat Handoff

## Goal

ChatGPT Rerun v0.2 keeps one independent watcher/runtime per ChatGPT tab while GitHub remains the durable workflow source of truth. A long workflow may remain on one `sequence` across many separate ChatGPT executions.

## Per-tab storage

```text
tabConfig:<tabId>   # repo/branch/control/poll/retry/prompt/approval mode
tabRuntime:<tabId>  # watcher/run/sequence/retry/handoff runtime
tabDraft:<tabId>    # Side Panel draft
```

Start/Stop affects only the current tab. Two enabled tabs cannot own the same owner/repo/branch/control stream simultaneously.

## Normal execution chaining — v0.2.16

The normal workflow cadence is completion-driven, not retry-driven.

```text
Rerun submits prompt
  -> ChatGPT generation becomes active
  -> generation finishes normally
  -> content script sees Stop control disappear
  -> immediate one-shot GitHub control refresh
  -> latest continue: submit next Rerun prompt immediately
  -> latest terminal state: wait while watcher remains enabled
```

Details:

- Content polling still has a 2-second base tick.
- Once an active Stop control has been observed, disappearance is handled on the next tick; the 15-second dispatch-start grace no longer delays a genuinely observed generation ending.
- The completion refresh bypasses the normal local GitHub poll-cache interval once. It does not disable server-side rate-limit protection.
- The refreshed control is authoritative. `complete`, `needs_user`, `blocked`, and sequence regression remain blockers.
- A valid refreshed `continue` is a **normal continuation**, not an unchanged-generation retry. It bypasses `retryDelaySeconds` / `maxRetriesPerSequence` and claims with `pendingIsRetry=false`.
- The immediate completion marker is consumed after one background response, so persistent GitHub errors cannot create a 2-second API hammer loop.

### What is not normal completion

- If the user directly clicks ChatGPT Stop, the trusted click marks that generation as manually interrupted. It does not immediately auto-chain.
- If the 23-minute watchdog programmatically clicks Stop, `generationWatchdogFired` excludes it from the normal-completion path. Watchdog recovery uses its re-armed abnormal-recovery path.
- Prompt dispatch failures continue to use guarded retry/handoff behavior.

## GitHub polling and retry roles

Regular unauthenticated polling remains conservative for GitHub rate-limit safety. That cadence is for observing external control changes while idle, not for pacing successful Rerun executions.

`retryDelaySeconds` and `maxRetriesPerSequence` protect abnormal unchanged-generation recovery. They are not the delay between successful normal executions.

There is no lifetime send cap. `Sent` / `runCount` is diagnostic only.

## GitHub approval-aware resume

A GitHub action-confirmation card may appear in an existing or fresh ChatGPT conversation.

When **GitHub 승인 후 자동 계속** is enabled:

- Rerun detects the visible confirmation UI only to suppress its own polling/retry while approval is pending.
- Rerun does not click `허용하기`, `Allow`, OAuth, repository-access, or admin approval controls.
- After the user manually approves and the card disappears, normal content polling resumes.
- Approval waiting time is excluded from the 23-minute generation watchdog budget.

## 23-minute stuck-generation watchdog — v0.2.14/v0.2.15

Normal assistant policy remains checkpoint around 18 minutes and end before 20 minutes.

If a Rerun-owned generation nevertheless remains actively generating for 23 active minutes:

1. verify watcher ownership is still enabled;
2. exclude approval-wait time;
3. clear stale pending claim and reset same-sequence retry count;
4. click the visible/actionable ChatGPT Stop once;
5. keep watcher ownership alive;
6. recover through the guarded abnormal-recovery path rather than normal-completion fast chaining.

The watchdog is armed only by Rerun-submitted prompts and does not target unrelated manual ChatGPT responses.

## Continue in new chat

`Continue in new chat` transfers watcher ownership, not GitHub task identity.

1. Read latest GitHub control.
2. Mark old tab `handoffPending`.
3. Open one new ChatGPT tab.
4. Copy tab config/runtime ownership.
5. Stop old watcher and enable new watcher.
6. Automatically submit a handoff prompt containing owner/repo, branch, control path, run_id, sequence, status, and task_id.
7. New chat re-reads GitHub Rerun state rather than relying on prior chat body.

Handoff is allowed even when GitHub status is terminal. A terminal handoff restores context and waits; later `continue` resumes automatically.

Fresh-chat handoff must not recursively open more chats if direct handoff prompt submission fails. User composer drafts remain protected.

## Same-stream collision guard

Stream identity is:

```text
owner / repo / branch / control path
```

Start or handoff refuses a second enabled owner for the same stream.

## Manual verification

### Immediate normal continuation

1. Reload v0.2.16.
2. Keep watcher Watching on a control stream intentionally left at `continue`.
3. Let a Rerun response finish normally.
4. Verify the next prompt starts on the next completion cycle rather than after regular polling/retry delay.
5. Change control to a terminal state and verify the chain stops while watcher remains Watching.
6. Manually Stop a Rerun generation and verify it does not use immediate normal chaining.

### Watchdog recovery

Verify a controlled watchdog Stop re-arms recovery and does not freeze at `retry_limit`.

### Approval-aware resume

Verify approval is still manual, duplicate Rerun retry is suppressed while the card is visible, and polling resumes after approval.

### New-chat handoff

Verify one new tab receives ownership and an automatically submitted GitHub-backed handoff prompt, with no duplicate watcher.

## Chrome version

Tab-specific Side Panel uses `chrome.sidePanel.open({ tabId })`; minimum Chrome version remains 116.
