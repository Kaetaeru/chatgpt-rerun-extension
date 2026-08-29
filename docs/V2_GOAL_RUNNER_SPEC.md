# ChatGPT Rerun V2 — Goal Runner Specification

## Purpose

Rerun V2 keeps ChatGPT working toward one user-defined repository goal until the goal is satisfied, human input is required, or repository authority conflicts with the requested goal.

Rerun owns execution continuity. It does not own product planning.

## Core loop

```text
[Goal setup button]
        ↓
Rerun sends goal-authoring prompt
        ↓
User describes the next goal
        ↓
ChatGPT creates rerun-goal-<nonce>.json
        ↓
Extension validates + stores Goal Contract
        ↓
Frozen executor prompt
        ↓
ChatGPT works + verifies
        ↓
rerun-result-<goal_id>.json
        ├─ CONTINUE   -> same frozen prompt immediately
        ├─ COMPLETE   -> stop
        ├─ NEEDS_USER -> pause
        └─ CONFLICT   -> pause
```

The extension does not parse assistant prose for control state.

## Authority hierarchy

Highest authority first:

1. Current explicit user instruction for the project.
2. Repository-native authoritative instructions, plans, specifications, and selected issue/epic acceptance criteria.
3. The Rerun Goal Contract.
4. Rerun execution mechanics.

If Goal and repository authority conflict, the execution must return `CONFLICT` rather than silently choosing one side.

Rerun V2 does not create or maintain a competing `.chatgpt-rerun/PLAN.md` in target repositories.

## Goal setup protocol

The Side Panel exposes **목표 세우기**.

When pressed, the extension creates a cryptographically random setup nonce and sends a prompt telling ChatGPT to wait for the user's next message. After the user describes the requested outcome, ChatGPT must create one downloadable UTF-8 file named:

```text
rerun-goal-<setup_nonce>.json
```

Schema:

```json
{
  "version": 2,
  "kind": "chatgpt-rerun-goal",
  "setup_nonce": "uuid",
  "goal_id": "same uuid",
  "repository": "owner/repo",
  "branch": "branch-name",
  "goal": "one clear end-state goal",
  "acceptance": [
    "observable completion condition"
  ],
  "authority": [
    "repository-native authoritative path, issue, epic, or specification when known"
  ]
}
```

The extension accepts the file only when:

- `version` and `kind` match V2;
- `setup_nonce` exactly matches the currently pending setup request;
- `goal_id` equals that same nonce;
- repository uses `owner/repo` form;
- goal is non-empty.

This prevents an older goal JSON attachment from silently replacing the current goal.

Goal setup itself must not start implementation or modify the target repository.

## Frozen executor prompt

Once the Goal Contract is accepted, the extension creates one executor prompt and stores it in `chrome.storage.local`.

That exact prompt is reused for every normal iteration of the run. Iteration count and checkpoint do not rewrite the prompt.

The prompt contains:

- run ID and goal ID;
- repository and branch;
- goal;
- acceptance criteria;
- known canonical authority sources;
- execution rules requiring repository authority to override the Goal;
- a requirement to avoid repeating verified work and repeated HEAD/history archaeology;
- the result-file contract.

Conversation context and repository evidence carry normal iteration progress. The extension keeps a compact checkpoint for UI and fresh-chat recovery, not to continuously regenerate the executor prompt.

## Result-file protocol

Before finishing each Rerun-owned execution, ChatGPT must create one downloadable UTF-8 file named:

```text
rerun-result-<goal_id>.json
```

Schema:

```json
{
  "version": 2,
  "kind": "chatgpt-rerun-result",
  "goal_id": "active goal id",
  "result_id": "new unique id for this execution",
  "status": "CONTINUE",
  "checkpoint": "one concise factual resumable checkpoint"
}
```

Allowed statuses:

- `CONTINUE`
- `COMPLETE`
- `NEEDS_USER`
- `CONFLICT`

The extension validates the file structure and active `goal_id`. It also remembers `result_id` and the attachment identity so the same result cannot be consumed twice.

### Result behavior

- `CONTINUE`: store checkpoint and immediately schedule the same frozen executor prompt again.
- `COMPLETE`: stop and show success.
- `NEEDS_USER`: pause for the user.
- `CONFLICT`: pause and require resolution.
- missing or invalid result JSON: treat as interrupted, never success.

## Attachment detection

The content script looks for newly appearing downloadable `.json` anchors in the ChatGPT page. It derives filenames from download attributes, labels, visible file names, or URL path names and fetches the attachment with the current ChatGPT credentials.

For execution results, the extension snapshots matching attachments before dispatch and accepts only a matching attachment that appears after dispatch. Previously seen attachments are ignored.

This is intentionally separate from assistant-message prose parsing.

## Runtime state

V2 state lives in `chrome.storage.local` per ChatGPT tab.

Important fields:

```text
runId
goalId
setupNonce
setupPending
frozenPrompt
status
phase
iteration
lastCheckpoint
lastResult
lastResultId
lastSentAt
waitingApproval
handoff state
```

Repository-side Rerun sequence/control files are not required for normal V2 cadence.

## State machine

```text
IDLE
  -> 목표 세우기
AWAITING_GOAL_FILE
  -> valid goal JSON
READY
  -> submit frozen executor
GENERATING
  -> valid result JSON
     -> CONTINUE -> READY
     -> COMPLETE -> COMPLETE
     -> NEEDS_USER -> PAUSED
     -> CONFLICT -> PAUSED
  -> invalid/missing result -> INTERRUPTED -> READY
```

A trusted manual ChatGPT Stop pauses the goal rather than silently rerunning.

## 20/23 minute behavior

- Executor contract asks ChatGPT to finish/checkpoint within the normal 20-minute execution budget.
- If a Rerun-owned generation remains active for 23 active minutes, the browser watchdog may click ChatGPT Stop once.
- Watchdog Stop is `INTERRUPTED`, not normal success.
- GitHub approval waiting time does not count toward the 23-minute active generation budget.

## GitHub approval

ChatGPT GitHub action confirmation remains a consent boundary.

Rerun may detect a visible GitHub approval card, pause its own loop, and automatically continue after the user manually approves. Rerun must not auto-click, synthesize, hide, or impersonate provider/ChatGPT approval controls.

A future Direct GitHub transport can use credentials explicitly granted to Rerun, but that is a separate authentication path rather than an approval bypass.

## New conversation handoff

If the current conversation loses its composer, Rerun transfers Goal Runner ownership to one fresh ChatGPT tab. The same Goal Contract and frozen prompt move with the run.

Fresh-chat recovery must never recursively open unlimited tabs if the handoff fails.

A later milestone should inject the compact `lastCheckpoint` once at handoff time so a new conversation can resume with less repository rediscovery while keeping normal executor iterations frozen.

## Explicit removals from V1

V2 normal operation removes:

- GitHub `control.json` scheduling;
- Rerun-authored repository PLAN;
- sequence/same-sequence retry semantics as normal cadence;
- `updated_at` authorization;
- GitHub polling as the trigger for each next turn;
- assistant prose parsing as the control protocol;
- full preflight reconciliation every turn.

## V2.1 acceptance

V2.1 JSON protocol is ready for browser validation when:

1. `목표 세우기` sends the setup prompt;
2. the next user-requested goal produces a matching goal JSON attachment;
3. the extension automatically imports that file and starts the run;
4. every execution reuses the same frozen executor prompt;
5. a newly created result JSON controls CONTINUE / COMPLETE / NEEDS_USER / CONFLICT;
6. old/stale goal and result attachments are rejected or ignored;
7. assistant prose is not read for control state;
8. GitHub approvals remain manual and do not break the loop;
9. composer exhaustion still performs a single fresh-chat handoff;
10. the 23-minute watchdog remains recovery-only.
