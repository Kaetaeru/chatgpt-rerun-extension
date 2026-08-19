# The Voyage of Theseus v0.4 — Team Runtime

> **Minds change. The voyage continues.**

## Goal

Run a two-role AI team — Planner and Programmer — through one reusable ChatGPT browser tab, with GitHub as durable shared memory and the Chrome extension as the local scheduler.

```text
logical agents: Planner / Programmer
physical worker: one ChatGPT tab
scheduler: Chrome extension
shared durable state: GitHub
```

Every role dispatch receives a fresh ChatGPT conversation. No agent depends on a previous conversation body.

## User flow

1. Connect the current ChatGPT tab to a GitHub repository.
2. Keep Single watcher mode stopped.
3. Enter a Voyage goal and press **Start Team**.
4. If `.chatgpt-rerun/team/runtime.json` does not exist, the current conversation bootstraps the Team Runtime and initial Planner task.
5. When that turn finishes, the extension immediately reconciles GitHub.
6. `status=ready` dispatches the specified agent in a fresh ChatGPT conversation in the same tab.
7. Planner and Programmer alternate by publishing a higher runtime `revision` as the final authoritative GitHub write.
8. `complete`, `needs_user`, and `blocked` stop automatic dispatch.

## Durable layout

```text
.chatgpt-rerun/
└── team/
    ├── TEAM.md
    ├── PLAN.md
    ├── STATE.md
    ├── runtime.json
    ├── agents/
    │   ├── planner.md
    │   └── programmer.md
    └── tasks/
        └── TASK-001/
            ├── SPEC.md
            ├── RESULT.md
            └── REVIEW.md
```

`runtime.json` is the only machine dispatch document. Markdown artifacts hold durable planning, evidence, and review context.

## Runtime v1

```json
{
  "version": 1,
  "run_id": "team-20260820-001",
  "revision": 3,
  "status": "ready",
  "agent": "programmer",
  "task_id": "TASK-002",
  "reason": "Implement the accepted persistence spec",
  "updated_at": "2026-08-20T01:30:00+09:00"
}
```

Rules:

- `revision` must increase monotonically for every handoff;
- `ready` requires `agent` and `task_id`;
- v0.4 agents are exactly `planner` and `programmer`;
- terminal states are `complete`, `needs_user`, and `blocked`;
- unknown fields are rejected;
- task artifacts and STATE are written before runtime;
- runtime is the final authoritative write.

## Planner contract

Planner does not implement product code. Planner:

- interprets the goal and repository state;
- writes or refines task scope and acceptance criteria;
- reviews the Programmer's actual commit, diff, and verification evidence;
- records accepted or rejected review results;
- selects the next task or returns the current task for changes;
- publishes `complete`, `needs_user`, or `blocked` when appropriate.

## Programmer contract

Programmer does not redefine requirements. Programmer:

- reads the current task SPEC and repository rules;
- implements only the assigned scope;
- runs relevant tests, lint, build, or other verification;
- records commit SHA, changed files, verification outcomes, and remaining risk in RESULT;
- hands control back to Planner through a higher runtime revision;
- escalates ambiguity instead of inventing product decisions.

## Event-driven dispatch

```text
agent prompt
    ↓
ChatGPT generation
    ↓
team-content.js observes generating → stable idle
    ↓
TEAM_TURN_FINISHED
    ↓
team-background.js forces a fresh runtime.json read
    ↓
ready + new revision?
    ├─ no  → wait
    └─ yes → navigate the same tab to a fresh chat
              ↓
            dispatch next role
```

The Team scheduler uses a dedicated Chrome runtime Port so it can coexist with the existing Single watcher message path.

## Recovery polling

`team-content.js` emits a lightweight local tick every two seconds. The tick never calls the model. GitHub requests still obey authenticated or public rate-safe polling intervals.

The tick exists only to recover from missed DOM completion events, service-worker restarts, or similar browser interruptions.

## Safety properties

- Single watcher mode and Team Runtime cannot run simultaneously in one tab.
- The same owner/repository/branch/runtime stream cannot be active in two Team tabs at once.
- Every normal agent switch uses a fresh ChatGPT conversation in the same Chrome tab.
- A regressed runtime revision stops Team Runtime locally.
- The same task has a configurable local dispatch circuit breaker, default 6.
- Already-dispatched revisions are not sent again.
- Terminal GitHub statuses never dispatch another agent.
- GitHub approval controls are never auto-clicked.
- Visible GitHub approval UI suppresses premature completion.
- Changing repository coordinates while Team Runtime is active stops the team before another dispatch.

## Rebrand compatibility note

The public product name is **The Voyage of Theseus**. The v0.4 protocol still uses the historical `.chatgpt-rerun` directory and internal `RERUN_*` wire identifiers to avoid mixing a breaking protocol migration with the first Team Runtime browser validation.

These identifiers are implementation compatibility details, not public product language.

## Release gate

The next required milestone is a real Chrome browser E2E run proving this uninterrupted sequence:

```text
Planner → Programmer → Planner
```

Acceptance criteria:

1. reload unpacked v0.4.0;
2. connect a safe test repository;
3. start Voyage Team with Single watcher stopped;
4. bootstrap missing Team Runtime state;
5. dispatch Planner in a fresh conversation;
6. Planner publishes a higher `ready/programmer` revision;
7. Programmer starts immediately after Planner finishes, without waiting for the normal GitHub polling interval;
8. Programmer publishes a higher `ready/planner` revision;
9. Planner starts again in another fresh conversation in the same Chrome tab;
10. normal role switching creates no extra Chrome tabs;
11. terminal states do not dispatch;
12. duplicate-stream, revision-regression, task-circuit-breaker, and GitHub-approval safety gates behave correctly.
