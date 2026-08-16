# Rerun Plan

## Goal

Dogfood the Chrome extension against this repository itself and produce real E2E evidence that automatic next-sequence dispatch, same-sequence retry, STATE/control handoff reconciliation, and terminal completion all work without the user manually sending `진행`.

## Definition of Done

- [ ] E2E-001 initial/next-sequence dispatch verified.
- [ ] E2E-002 same-sequence retry verified.
- [ ] E2E-003 STATE/control pending handoff reconciliation verified without repeating the prior task.
- [ ] E2E-004 terminal `complete` stop verified.
- [ ] `docs/E2E_RESULT.md` contains actual evidence for every stage.
- [ ] User manual `진행` sends during the automated sequence = 0.
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
| E2E-001 | pending | - | Verify initial automatic dispatch and transition to a new sequence | Extension sends the resume prompt for seq 0, evidence is recorded, and seq 1/E2E-002 starts without manual input |
| E2E-002 | pending | E2E-001 | Verify same-sequence retry after an intentional first-pass stop | First pass leaves seq 1 unchanged; retry fires automatically; second pass records evidence and advances to seq 2 |
| E2E-003 | pending | E2E-002 | Verify crash-safe STATE/control handoff reconciliation | First pass writes STATE seq 3 while control remains seq 2; retry publishes only missing control handoff; E2E-003 is not repeated |
| E2E-004 | pending | E2E-003 | Verify terminal completion | Evidence is finalized, control becomes seq 4/complete, and extension stops with `complete` |

Status vocabulary: `pending`, `in_progress`, `verified`, `blocked`.

## Notes / Decisions

- This is a dogfood run on `Kaetaeru/chatgpt-rerun-extension` branch `agent/mvp-autoresume`.
- Run ID is `chatgpt-rerun-dogfood-20260816-01`.
- Main automated flow intentionally tests recovery behavior rather than only the happy path.
- Additional safety-stop scenarios are manual post-E2E checks and are not prerequisites for the main automated sequence unless a discovered bug requires them.
