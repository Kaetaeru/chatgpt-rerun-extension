# ChatGPT Rerun V2 — Goal Runner Specification

## Purpose

Rerun V2 keeps ChatGPT working toward one user-defined goal until the goal is satisfied, human input is required, or the repository's authoritative rules conflict with the requested goal.

V2 deliberately avoids making Rerun a second project manager. Rerun owns execution continuity, not product planning.

## Core model

The user creates one **Goal Contract** and starts it.

```text
Goal Contract
    ↓
Executor prompt
    ↓
ChatGPT works toward goal
    ↓
verify current increment
    ↓
RERUN_RESULT
    ├─ CONTINUE   -> immediately run the same executor contract again
    ├─ COMPLETE   -> stop
    ├─ NEEDS_USER -> pause
    └─ CONFLICT   -> pause
```

The executor prompt remains intentionally stable across executions. It does not contain a growing Rerun-authored plan.

## Authority hierarchy

Rerun must never invent a competing project plan.

Highest authority first:

1. Current explicit user instruction for the project.
2. Repository-native authoritative instructions and plans (for example `AGENTS.md`, repository README/contributing rules, canonical design/spec documents, issue/epic acceptance criteria explicitly selected by the project).
3. The Rerun Goal Contract.
4. Rerun execution mechanics.

If the Goal Contract conflicts with an authoritative repository rule, Rerun must produce `CONFLICT` instead of silently choosing one side.

V2 does **not** install or maintain `.chatgpt-rerun/PLAN.md` in target repositories.

## Goal Contract

Stored by the extension, not committed into the target repository by default.

Minimum fields:

```json
{
  "runId": "uuid",
  "goal": "Complete the requested project outcome.",
  "repository": "owner/repo",
  "branch": "branch-name",
  "acceptance": [
    "Repository-native acceptance criteria are satisfied",
    "Relevant verification passes",
    "No unresolved blocker remains"
  ],
  "authorityPaths": [],
  "status": "idle"
}
```

`authorityPaths` may be empty initially. During first execution ChatGPT may identify repository-native canonical sources. Once selected, the extension records their identities/hashes for change detection. Rerun does not rewrite their content.

## Extension-owned runtime state

V2 state lives primarily in `chrome.storage.local`.

```text
runId
status
repository
branch
goal
acceptance
authorityPaths
authorityHashes
iteration
lastKnownHead
lastCheckpoint
lastResult
activeChatTabId
generationStartedAt
```

No GitHub `sequence`, `same-sequence authorization`, `continue.updated_at`, or repository-side Rerun control file is required for normal V2 cadence.

## Executor prompt contract

Each execution receives the same behavioral contract plus the current Goal Contract and a compact Resume Capsule when needed.

Conceptual prompt:

```text
You are executing Rerun Goal <goal>.

Continue working toward the goal.
Repository instructions, canonical project plans/specifications, and their acceptance criteria are authoritative over the Rerun goal.
Do not create a separate Rerun plan.
Do not redo verified work.
Inspect only the minimum repository state needed for the next useful action.
Choose the highest-priority unfinished action that materially advances the goal.
Implement it and verify it.

If the goal is fully satisfied, return COMPLETE.
If meaningful work remains, return CONTINUE.
If human input is required, return NEEDS_USER.
If the goal or requested next action conflicts with repository authority, return CONFLICT.

End with exactly one RERUN_RESULT block.
```

## Structured result

The extension parses only the final small result block, not the full assistant answer.

```text
RERUN_RESULT
status: CONTINUE
checkpoint: MP-01 closure validation remains
```

Allowed statuses:

- `CONTINUE`
- `COMPLETE`
- `NEEDS_USER`
- `CONFLICT`

The checkpoint must be short and factual. It is not a new plan.

### Result behavior

- `CONTINUE`: store checkpoint and immediately submit the same executor contract again.
- `COMPLETE`: stop Goal Runner and display success.
- `NEEDS_USER`: pause and surface the assistant's user-facing question/reason.
- `CONFLICT`: pause and surface the conflicting authority and requested behavior.
- Missing/malformed result: treat as `INTERRUPTED`, never as success.

## Normal iteration behavior

A successful normal execution is completion-driven.

```text
prompt submitted
-> generation active
-> generation ends
-> parse final RERUN_RESULT
-> CONTINUE
-> next prompt immediately
```

No GitHub polling interval or retry delay paces successful iterations.

## 20/23 minute behavior

- ChatGPT execution contract still asks the assistant to checkpoint and finish before 20 minutes.
- If a Rerun-owned generation remains active at 23 active minutes, the browser watchdog may click ChatGPT Stop once.
- A watchdog stop is `INTERRUPTED`, not `COMPLETE` or normal `CONTINUE`.
- After an interrupted turn, start a new execution using the last known checkpoint and the same Goal Contract.
- GitHub approval waiting time does not count toward the 23-minute active generation budget when ChatGPT GitHub mode is used.

## New conversation handoff

When the current conversation is exhausted or the composer remains unavailable:

1. open one fresh ChatGPT conversation;
2. transfer Goal Runner ownership to the new tab;
3. submit the same executor contract plus a Resume Capsule;
4. never recursively spawn new conversations if direct handoff submission fails.

Resume Capsule contains only what is needed to avoid redoing verified work:

```text
Goal: <same goal>
Repository: owner/repo @ branch
Last known HEAD: <sha if known>
Verified checkpoint: <short checkpoint>
Canonical authority sources: <paths/ids>
Do not redo verified work.
```

## Repository inspection strategy

V1 repeatedly spent execution time rediscovering repository state. V2 separates cheap transport checks from expensive model reasoning.

### Extension responsibility

The extension may cheaply track:

- current branch HEAD;
- whether HEAD changed since the previous iteration;
- hashes/SHAs of selected canonical authority files;
- optionally changed filenames between known heads.

This bookkeeping must not itself become the work scheduler.

### ChatGPT responsibility

ChatGPT inspects repository content only when needed for the next action.

Rules:

- Do not reread full history every iteration.
- If HEAD is unchanged since the previous successful execution, do not perform generic HEAD archaeology.
- If HEAD changed, provide the model a compact changed-file summary when available.
- If a canonical authority source changed, the next execution must reconcile that authority before implementation.
- If authority change conflicts with the Goal Contract, return `CONFLICT`.

## GitHub transport modes

Goal Runner behavior must not depend on one GitHub transport.

### Mode A — ChatGPT GitHub

ChatGPT uses its connected GitHub app/tool for repository actions.

Pros:

- simplest implementation;
- no patch protocol owned by Rerun;
- ChatGPT directly reads/writes repository state.

Constraint:

- ChatGPT may show action approval cards depending on account/app/workspace/action context.
- Rerun must not auto-click or synthetically approve those cards.
- While a confirmation card is visible, Rerun may pause its own loop and automatically continue after the user approves manually.

HTML/DOM manipulation cannot remove the underlying ChatGPT permission policy. Changing or hiding the visible HTML would not grant the action.

### Mode B — Direct GitHub transport

The extension connects to GitHub separately using credentials explicitly granted to Rerun (prototype: user-provided token; product direction: dedicated OAuth/GitHub App authorization).

This is a separate integration, not an automatic click on ChatGPT approval UI.

Possible responsibilities:

- HEAD/hash/diff metadata reads;
- repository writes only if V2 later defines a safe machine-readable patch/write protocol.

Important constraint: do not add direct-write complexity merely to avoid approval prompts. V2 should first prove Goal Loop with ChatGPT GitHub mode. Direct writes are a separate milestone because they require credential security, patch validation, branch protection handling, conflict detection, and clear user authorization.

## Approval UX

HTML is still useful for **Rerun's own** UX:

```text
GitHub transport
[ ChatGPT GitHub ] [ Direct GitHub ]

Approval state
Waiting for ChatGPT approval
[Focus approval]
```

But HTML must not impersonate or replace provider/ChatGPT consent.

Official ChatGPT app permissions may allow broader auto-approval settings for eligible apps/accounts, but less restrictive app permissions do not necessarily override all safety or workspace protections. V2 must therefore remain correct even when a manual approval appears.

## V2 state machine

```text
IDLE
  -> START
RUNNING
  -> submit executor
GENERATING
  -> normal end
EVALUATE_RESULT
  -> CONTINUE -> RUNNING
  -> COMPLETE -> DONE
  -> NEEDS_USER -> PAUSED
  -> CONFLICT -> PAUSED
  -> malformed/missing -> INTERRUPTED

GENERATING
  -> 23m watchdog -> INTERRUPTED -> RUNNING

RUNNING
  -> composer unavailable -> HANDOFF -> RUNNING on new tab
```

## V2 UI minimum

Side Panel should be redesigned around the Goal, not repository control internals.

Minimum visible fields:

- Repository / branch
- Goal
- Acceptance criteria (optional compact list)
- Status: Idle / Running / Waiting approval / Needs user / Conflict / Complete
- Iteration count
- Last checkpoint
- Last known HEAD
- Start / Pause / Stop

Diagnostics such as retry counters should not be primary UX.

## Explicit removals from V1

V2 normal operation removes:

- repository-side `.chatgpt-rerun/control.json` scheduling;
- `.chatgpt-rerun/PLAN.md` as a competing plan;
- same-sequence retry semantics for normal cadence;
- fresh authorization via `updated_at`;
- GitHub polling as the trigger for every next execution;
- mandatory full preflight reconciliation every turn.

The V1 branch remains preserved for comparison and migration work.

## Implementation order

1. Goal Contract + local runtime model.
2. Stable executor prompt + `RERUN_RESULT` parser.
3. Completion-driven immediate loop.
4. Pause states: COMPLETE / NEEDS_USER / CONFLICT.
5. Resume Capsule + fresh-chat ownership handoff.
6. Cheap HEAD/authority hash change detection.
7. Approval-aware pause/resume for ChatGPT GitHub mode.
8. Evaluate Direct GitHub transport only after the Goal Loop is stable.

## Acceptance for V2 MVP

A V2 MVP is successful when:

1. the user can enter a repository, branch, and goal;
2. Start submits an executor prompt;
3. a normal `CONTINUE` result causes another execution immediately without GitHub polling cadence;
4. successful iterations do not create a separate Rerun plan in the target repository;
5. `COMPLETE`, `NEEDS_USER`, and `CONFLICT` stop or pause correctly;
6. a new conversation can resume from Goal + checkpoint without rereading all prior Rerun bookkeeping;
7. canonical authority changes are detected and conflicts stop execution;
8. ChatGPT approval cards are never auto-clicked;
9. manual approval does not break the loop; after approval the same execution may continue;
10. the 23-minute watchdog remains a recovery mechanism only.
