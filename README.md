# The Voyage of Theseus

> **Minds change. The voyage continues.**

The Voyage of Theseus is a Manifest V3 Chrome extension that lets disposable ChatGPT conversations continue one durable GitHub-backed project.

Its core idea is simple: **the model instance is temporary; the work is not.** A Planner can finish, a Programmer can take over in a fresh conversation, and another Planner can later review the result without relying on any previous chat transcript. GitHub carries the durable state, while the extension acts as the local scheduler and nervous system.

## Why the name?

The Ship of Theseus asks whether an object remains the same when every component is gradually replaced. This project asks a similar question about AI work:

> If every ChatGPT conversation is replaced, can the project still remain the same project?

The Voyage of Theseus answers **yes** by keeping identity in the goal, plan, task graph, decisions, commits, tests, and durable state rather than in a single conversation.

```text
Planner conversation A ─┐
Programmer conversation B ─┼─> one durable voyage
Planner conversation C ───┘
                            │
                            ▼
                          GitHub
```

## Current product: v0.4 Team Runtime

v0.4 introduces a two-role team that reuses **one physical ChatGPT tab**:

```text
User goal
   ↓
Planner
   ↓
GitHub handoff
   ↓
Programmer
   ↓
GitHub handoff
   ↓
Planner
   ↓
...
   ↓
complete / needs_user / blocked
```

Each agent dispatch uses a **fresh ChatGPT conversation in the same Chrome tab**. Agent identity therefore lives in durable GitHub state, not in a particular chat URL.

### Planner

The Planner owns:

- requirements interpretation;
- task decomposition;
- scope and acceptance criteria;
- review of the Programmer's actual commit, diff, and test evidence;
- next-task selection;
- completion or escalation decisions.

The Planner does **not** implement product code.

### Programmer

The Programmer owns:

- implementation of the current approved `SPEC.md`;
- relevant tests, lint, build, or other verification;
- commits and changed-file evidence;
- `RESULT.md` with commit SHA, verification outcomes, and remaining risk.

The Programmer does **not** unilaterally redefine product requirements.

## Runtime model

The Team Runtime uses one machine-readable dispatch document:

```text
.chatgpt-rerun/team/runtime.json
```

Example:

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

- `revision` is monotonic and must increase for every handoff;
- `ready` requires `agent` and `task_id`;
- MVP agents are `planner` and `programmer`;
- terminal states are `complete`, `needs_user`, and `blocked`;
- unknown runtime fields are rejected;
- durable task artifacts and `STATE.md` are written before `runtime.json`;
- `runtime.json` is the final authoritative write of a handoff.

## Event-driven continuation

The extension does not repeatedly ask the model whether more work exists.

Instead:

```text
ChatGPT generation starts
        ↓
DOM lifecycle observer
        ↓
generation becomes stably idle
        ↓
TURN_FINISHED
        ↓
fresh GitHub reconciliation
        ↓
new authorized work?
   ├─ no  → wait
   └─ yes → dispatch next conversation
```

Normal GitHub polling remains as a recovery mechanism for missed DOM events, service-worker restarts, external GitHub changes, and other browser interruptions.

## One tab, many logical agents

The architectural separation is:

```text
logical agent     = Planner / Programmer / future Reviewer / Tester
physical worker   = ChatGPT browser tab
scheduler         = Chrome extension
shared memory     = GitHub
```

A single worker tab can therefore execute many logical agents sequentially. True parallel execution still requires multiple browser execution contexts or a future API/backend worker pool.

## Safety properties

The current Team Runtime includes the following guards:

- Single watcher mode and Team Runtime cannot run simultaneously in the same tab.
- The same owner/repository/branch/runtime stream cannot be active in two Team tabs at once.
- A regressed runtime revision stops Team Runtime locally.
- Already-dispatched revisions are not sent again.
- Repeated Planner ↔ Programmer dispatches for the same task are bounded by a configurable circuit breaker.
- `complete`, `needs_user`, and `blocked` never dispatch another role automatically.
- GitHub approval controls are never auto-clicked.
- A visible GitHub approval card suppresses premature turn-completion detection.
- Changing repository coordinates while Team Runtime is active stops the team before it can dispatch against the new stream.

## Single watcher mode

The original single-agent watcher remains available. It reads a strict GitHub `control.json` with four work states:

- `continue`
- `complete`
- `needs_user`
- `blocked`

Watcher state and GitHub work state are deliberately independent. A terminal GitHub work state pauses dispatch but does not automatically turn the Chrome watcher off.

## GitHub protocol layout

The current v1 protocol uses the historical `.chatgpt-rerun` namespace:

```text
.chatgpt-rerun/
├── README.md
├── PLAN.md
├── STATE.md
├── STATUS.md
├── control.json
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

The `.chatgpt-rerun` directory name and internal `RERUN_*` message identifiers are retained in v0.4 as **legacy wire identifiers** so the rebrand does not silently break protocol compatibility. Public product language is now **The Voyage of Theseus**. A future migration can version the protocol namespace explicitly instead of mixing a brand rename with runtime behavior changes.

## Side Panel

The Side Panel exposes two execution modes:

### Single watcher

- repository connection;
- GitHub control path;
- polling and retry settings;
- manual GitHub approval awareness;
- watcher Start / Stop;
- fresh-chat handoff.

### Voyage Team

- voyage goal;
- current Team status;
- current agent;
- current task;
- runtime revision;
- per-task dispatch safety limit;
- Start Team / Stop Team.

## Development

```bash
npm run check
npm test
```

Current v0.4 work is intentionally stacked so that the event-driven runtime and Team scheduler can be reviewed separately.

## Browser E2E release gate

Before v0.4 is considered usable, verify the complete loop in Chrome:

1. reload the unpacked extension;
2. connect a safe GitHub repository;
3. leave Single watcher mode stopped;
4. enter a small Voyage Team goal and start the team;
5. verify bootstrap creates/reconciles Team Runtime state;
6. verify Planner opens in a fresh conversation in the same tab;
7. verify Planner hands off to Programmer through a higher GitHub revision;
8. verify Programmer starts immediately after Planner finishes;
9. verify Programmer hands back to Planner through another higher revision;
10. verify no extra Chrome tabs are created by normal role switching;
11. verify terminal states do not dispatch;
12. verify duplicate-stream, revision-regression, approval, and circuit-breaker safety gates.

The first meaningful success criterion is:

```text
Planner → Programmer → Planner
```

with no human prompt between those turns and only one Chrome worker tab.
