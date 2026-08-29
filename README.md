# ChatGPT Rerun V2

Rerun V2 is a Chrome extension that keeps a ChatGPT conversation working toward one repository goal until the goal is complete, needs the user, or conflicts with repository authority.

V2 is intentionally different from V1:

- GitHub control polling is not the normal execution scheduler.
- Target repositories do not need a Rerun-authored `PLAN.md`.
- Successful iterations are driven by assistant completion, not retry timers.
- The repository's own instructions/specifications remain authoritative over the Rerun goal.

The previous V1 implementation remains preserved on `agent/mvp-autoresume`.

## Branch

Current V2 development branch:

```text
agent/v2-goal-runner
```

## Goal Loop

```text
Goal
  -> executor prompt
  -> ChatGPT works and verifies one useful increment
  -> RERUN_RESULT
       CONTINUE   -> immediately run again
       COMPLETE   -> stop
       NEEDS_USER -> pause
       CONFLICT   -> pause
```

The executor contract stays stable across iterations. Only the compact resume checkpoint changes.

## Authority rule

Highest authority first:

1. current explicit user instruction;
2. repository-native instructions, plans/specs and acceptance criteria;
3. the Rerun Goal;
4. Rerun execution mechanics.

Rerun must not invent a second project plan to resolve a conflict. If the goal and repository authority disagree, the iteration must end with `CONFLICT`.

## Structured result

Every Rerun-owned execution is asked to end with:

```text
RERUN_RESULT
run_id: <current run id>
execution: <current execution number>
status: CONTINUE|COMPLETE|NEEDS_USER|CONFLICT
checkpoint: <one concise factual line>
```

Run ID and execution number prevent an older assistant result from being mistaken for the current turn.

## Runtime state

V2 uses tab-scoped `chrome.storage.local` keys:

```text
v2:config:<tabId>
v2:runtime:<tabId>
```

The extension stores the Goal, repository/branch, iteration count and last checkpoint locally. Normal cadence does not require repository-side Rerun `sequence`, `updated_at`, retry counters, or `control.json`.

## New conversation handoff

If a valid Goal is ready but the current ChatGPT composer stays unavailable, Rerun opens one fresh ChatGPT tab, transfers Goal Runner ownership, and submits the same executor contract with the latest checkpoint.

It does not recursively open more tabs if a handoff itself fails.

## 20 / 23 minute behavior

The executor contract tells ChatGPT to finish/checkpoint within the normal 20-minute execution budget.

If a Rerun-owned generation remains active for 23 active minutes, the browser watchdog clicks ChatGPT Stop once and treats the turn as interrupted. The Goal can then run again from the last verified checkpoint.

Time spent waiting on a visible GitHub approval card is excluded from the watchdog budget.

## GitHub approval behavior

The V2 MVP currently uses ChatGPT's connected GitHub app for repository work.

Rerun may detect a visible GitHub action-confirmation card so it can pause its own loop and display `Waiting approval`, but it **does not click or synthetically approve** the card. After the user approves manually, the same ChatGPT execution can continue.

HTML/DOM manipulation cannot grant the underlying ChatGPT/GitHub permission. Hiding or replacing the visible card would not change the service-side authorization decision.

A future **Direct GitHub transport** may connect the extension to GitHub separately through credentials explicitly granted to Rerun. That is a separate integration rather than an approval-card bypass. It is intentionally deferred until Goal Loop browser behavior is proven because safe direct writes require credential handling, patch validation, conflict detection and branch-protection handling.

See `docs/V2_GOAL_RUNNER_SPEC.md` for the full architecture.

## Side Panel

The V2 panel asks for:

- Repository (`owner/repo`)
- Branch
- Goal
- optional acceptance criteria
- optional canonical authority references

Runtime display is intentionally small:

- status
- iteration
- run ID
- approval wait
- last checkpoint

Controls:

- **Start**: create a new Goal run.
- **Resume**: resume a paused/needs-user/conflict run after the user has resolved the reason.
- **Pause**: stop automatic next iterations without deleting the Goal checkpoint.
- **Stop**: end the run in the current tab.

A manual click on ChatGPT's own Stop button pauses the Goal instead of silently starting another iteration.

## Local validation

Current V2 MVP validation command:

```bash
npm run check
npm test
```

`npm test` intentionally runs `tests/v2-*.test.mjs`; the V1 tests remain historical evidence for the V1 branch and are not the V2 contract.

The V2 MVP source currently covers:

- repository authority above Rerun Goal;
- stable executor prompt;
- structured result parsing;
- stale result rejection by run/execution identity;
- immediate `CONTINUE -> ready` transition;
- Pause preservation during an in-flight execution;
- manual ChatGPT Stop -> pause;
- GitHub approval wait without auto-click;
- missing-composer fresh-chat ownership handoff;
- 23-minute stuck-generation recovery.

## Install for browser testing

1. Check out `agent/v2-goal-runner` locally.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Load or Reload the unpacked extension directory.
5. Refresh existing ChatGPT tabs after switching from V1 to V2 so the old V1 content script is removed from the page.
6. Open the Rerun V2 Side Panel from a ChatGPT tab.
7. Enter repository, branch and Goal, then Start.

V2 has not yet been declared browser-E2E complete. Source checks passing do not substitute for live ChatGPT DOM verification.
