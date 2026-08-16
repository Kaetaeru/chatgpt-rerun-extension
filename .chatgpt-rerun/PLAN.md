# Rerun Plan

## Goal

Dogfood the Chrome extension against this repository itself and produce real E2E evidence that automatic next-sequence dispatch, same-sequence retry, STATE/control handoff reconciliation, and terminal completion all work without the user manually sending `진행`.

## Definition of Done

- [ ] E2E-001 initial/next-sequence dispatch verified.
- [ ] E2E-002 same-sequence retry verified.
- [ ] E2E-003 STATE/control pending handoff reconciliation verified without repeating the prior task.
- [ ] E2E-004 terminal `complete` stop verified.
- [x] Side Panel remains usable while interacting with the ChatGPT page and restores unsaved draft values after reopen.
- [x] Start bootstraps the runner on an already-open ChatGPT tab without requiring a page refresh.
- [ ] `docs/E2E_RESULT.md` contains actual evidence for every stage.
- [x] User manual `진행` sends during the automated sequence = 0 so far.
- [ ] No unresolved blocker remains.

## Constraints

- Follow `docs/E2E_TEST_PLAN.md` exactly.
- Do not shortcut intentional stop phases in E2E-002 or E2E-003.
- Do not mark an E2E task PASS without observed evidence.
- Do not merge PR #1 as part of this automated run.
- State writes must use PLAN -> STATE -> control.json ordering.

## Validation Baseline

- Unit tests: `npm test`
- Syntax: `npm run check`
- E2E evidence: `docs/E2E_RESULT.md`
- Build: N/A (unpacked Manifest V3 extension)

## Tasks

| ID | Status | Depends on | Task | Acceptance criteria |
|---|---|---|---|---|
| E2E-001 | verified | - | Verify Side Panel persistence, initial automatic dispatch, and transition to a new sequence | Seq 0 startup/dispatch side is complete; final probe PASS is closed when the automatic seq 1 execution arrives without manual input |
| E2E-002 | pending | E2E-001 | Verify same-sequence retry after an intentional first-pass stop | First pass leaves seq 1 unchanged; retry fires automatically; second pass records evidence and advances to seq 2 |
| E2E-003 | pending | E2E-002 | Verify crash-safe STATE/control handoff reconciliation | First pass writes STATE seq 3 while control remains seq 2; retry publishes only missing control handoff; E2E-003 is not repeated |
| E2E-004 | pending | E2E-003 | Verify terminal completion | Evidence is finalized, control becomes seq 4/complete, and extension stops with `complete` |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- This is a dogfood run on `Kaetaeru/chatgpt-rerun-extension` branch `agent/mvp-autoresume`.
- Current Run ID is `chatgpt-rerun-dogfood-20260816-02`.
- Run `...-01` failed at startup and is preserved in `docs/E2E_RESULT.md`.
- Run `...-02` received the configured seq 0 resume prompt automatically in the existing ChatGPT conversation at 2026-08-16 22:30 KST.
- E2E-001's next-sequence half must be confirmed by the next automatic seq 1 execution; do not infer that event before it arrives.
- Main automated flow intentionally tests recovery behavior rather than only the happy path.
- Additional safety-stop scenarios are manual post-E2E checks and are not prerequisites for the main automated sequence unless a discovered bug requires them.
