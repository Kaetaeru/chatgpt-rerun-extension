# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `3`
- Desired control status: `continue`
- Current task: `V02-004`
- Control reason: `V02-003 per-tab dispatch/retry regression verified; execute the fresh-chat ownership handoff probe.`
- Phase: `awaiting_new_chat_handoff`
- Last checkpoint (UTC): `2026-08-16T14:09:00Z`
- Current execution started (UTC): `2026-08-16T14:09:00Z`
- Current execution hard stop (UTC): `2026-08-16T14:29:00Z`

## Current Objective

Execute V02-004 from `docs/V02_E2E_TEST_PLAN.md`: in the current owning ChatGPT tab A, use **Continue in new chat** and verify that exactly one fresh ChatGPT tab C receives ownership of the same GitHub workflow without incrementing the GitHub sequence merely because the conversation changed.

## Completed in This Task

- V02-001 verified: tab-specific Side Panel/config/draft/runtime separation worked.
- V02-002 verified: duplicate Start on the same GitHub stream in tab B was rejected with the expected error.
- V02-003 verified: seq 1 new-sequence auto-dispatch occurred in tab A, a same-sequence retry occurred while control remained seq 1, and tab B's counters remained isolated at zero.
- `docs/V02_E2E_RESULT.md` records the V02-003 counter-isolation evidence.
- PLAN marks V02-003 verified and V02-004 in_progress.

## Verification

| Check | Command / observation | Result | Evidence / note |
|---|---|---|---|
| Syntax | `npm run check` | PASS | Previously verified on v0.2 head. |
| Unit tests | `npm test` | PASS | 20/20 tests. |
| Manifest JSON | JSON parse | PASS | v0.2 manifest valid. |
| V02-001 tab/session separation | Chrome user observation | PASS | User confirmed two-tab separation at 23:01 KST. |
| V02-002 duplicate stream rejection | Chrome Side Panel observation | PASS | User confirmed collision error before 23:07 KST. |
| V02-003 new-sequence dispatch | Chrome runtime observation | PASS | Seq 1 resume prompt automatically arrived in tab A at 23:03 KST. |
| V02-003 same-sequence retry | Chrome runtime observation | PASS | Another automatic prompt arrived while control remained seq 1. |
| V02-003 counter isolation | Chrome Side Panel observation | PASS | User confirmed tab B still showed zero run/retry activity at 23:09 KST. |
| V02-004 new-chat handoff | Chrome runtime observation | NOT_RUN | Must use `Continue in new chat` from the owning tab A. |

## Pending / Failed

- In tab A Side Panel, press **Continue in new chat**.
- Confirm exactly one fresh ChatGPT tab C opens.
- Confirm old tab A is no longer the running owner and shows a `handed_off_to_tab_<id>` stop reason if its panel is inspected.
- Confirm tab C receives the copied GitHub config/runtime and becomes the running owner.
- Confirm a handoff prompt is automatically sent in tab C and includes owner/repo, branch, control path, run_id, and sequence.
- Confirm tab C reads the active `.chatgpt-rerun` documents and resumes from GitHub STATE without requiring prior conversation text.
- Do not increment sequence solely because the conversation moved to a new tab/chat.

## Files / Areas Touched

- `docs/V02_E2E_RESULT.md`: V02-003 PASS evidence.
- `.chatgpt-rerun/PLAN.md`: V02-003 verified; V02-004 in_progress.
- `.chatgpt-rerun/STATE.md`: advanced to seq 3 / V02-004.

## Next Exact Action

After seq 3 becomes active, wait until the current response is idle, then press **Continue in new chat** in tab A's Side Panel. Observe the newly opened tab C and the old tab A runtime. The expected successful path is one new ChatGPT tab, one automatically delivered handoff prompt containing the GitHub coordinates plus run_id/sequence, tab C becoming the owner, and tab A stopping with a handoff reason. Report what is observed; the new chat itself should then recover from this STATE checkpoint.

## Do Not Repeat

- Do not repeat V02-001, V02-002, or V02-003.
- Do not rerun static validation unless code changes.
- Do not manually copy conversation text into the new chat.
- Do not change GitHub sequence merely because the new chat is created.
- Do not mark V02-004 PASS until the new tab actually receives the handoff and resumes from GitHub.

## Blockers / User Decisions

- None. The next browser action is `Continue in new chat` from the owning tab A.
