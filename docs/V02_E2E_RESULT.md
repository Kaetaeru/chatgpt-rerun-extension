# ChatGPT Rerun v0.2.x E2E Result

Runbook: `docs/V02_E2E_TEST_PLAN.md`

## Current run

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Branch: `agent/mvp-autoresume`
- Extension to verify: `0.2.13`
- Status: `V02_009_LIVE_VERIFY`
- Current task: `V02-009`

## Stable verified baseline

| Task | Result | Evidence |
|---|---|---|
| V02-001 tab-scoped panel/storage | PASS | User-confirmed tab isolation. |
| V02-002 same-stream collision guard | PASS | Duplicate watcher Start rejected. |
| V02-003 dispatch/retry regression | PASS | New/same-sequence dispatch worked on owning tab only. |
| V02-004 fresh-chat handoff baseline | PASS | Earlier live ownership transfer succeeded. |
| V02-005 handoff race/failure safeguards | PASS | Live success + source-verified suppression/cleanup paths. |
| V02-006 persistent watcher | PASS | `needs_user` kept watcher Watching; later same-seq `continue` auto-resumed. |
| V02-007 Start/Stop watcher | PASS | User-confirmed Stop -> Start round trip. |
| V02-008 unconnected-first onboarding | PASS | User completed the separate-project onboarding probe. |

## V02-009 regression chain

1. v0.2.5: resume prompt could be inserted without being submitted.
2. v0.2.6: composer synchronization, Send/Enter fallback, and dispatch-evidence checks added.
3. v0.2.7: fresh-chat handoff decoupled from terminal GitHub work status.
4. v0.2.8: failed current-chat dispatch attempted automatic fresh-chat handoff.
5. v0.2.9: a stale Rerun-owned prompt left in the composer no longer looks like a user draft and can route to handoff.
6. A browser probe hit the GitHub public REST rate limit.
7. v0.2.10 added rate-limit-safe polling and pause/resume behavior.
8. SimpleVTT exposed same-sequence long-task `retry_limit` behavior.
9. v0.2.11 made newer same-sequence `updated_at` a fresh authorization.
10. SimpleVTT still stopped after many successful continuations because lifetime `Max sends=20` remained.
11. v0.2.12 removed that lifetime send gate entirely.
12. The next workflow risk identified by the user is ChatGPT's GitHub write-action confirmation card. A long manual approval pause can outlive Rerun retry delay and create redundant continuation attempts if the page otherwise looks idle.
13. v0.2.13 adds approval-aware manual-confirmation resume: detect the GitHub action-confirmation UI, suppress Rerun POLL/retry while it is visible, never click the approval control, and automatically resume polling after the user approves and the card disappears.

## SimpleVTT evidence retained

The live project remains `Kaetaeru/SimpleVTT @ main` with run_id `b7f27a61-29d8-4ba2-9f93-8e66722d5f41`, sequence `1`, status `continue`, task `phase14-production-play-session-ux`. Its STATE/PLAN require continued work on the same sequence.

## v0.2.12 lifetime-send fix retained

- Normal dispatch, `CLAIM_SEQUENCE`, and fresh-chat handoff no longer have a lifetime send-count gate.
- `runCount` remains diagnostic only.
- `Retries / sequence` still limits an unchanged control generation.

## v0.2.13 approval-aware resume

- `DEFAULT_CONFIG.approvalAwareResume=false` keeps the feature explicit opt-in.
- Side Panel adds **GitHub 승인 후 자동 계속** and requires Save connection to apply the setting.
- The Side Panel explains that Rerun does not click the approval button; runtime summary shows `GitHub approvals = Manual · auto-resume` when enabled.
- `content.js` reads the saved tab-scoped config before every POLL.
- When enabled, it looks for an interactive `허용/허용하기/Allow` button whose nearby card text contains GitHub plus either `ChatGPT가 GitHub...사용하도록 허용할까요` or `Allow ChatGPT to use GitHub`.
- While that card exists, `tick()` returns before sending `POLL`; this prevents same-control retry/duplicate resume while the user is deciding.
- The detector deliberately returns the card only; it contains no approval-button `.click()` path.
- After the user manually approves and the card disappears, the next normal content tick resumes polling automatically.
- The setting is part of tab config, so normal fresh-chat ownership transfer copies it with the rest of config.

## Validation status

| Check | Result | Evidence |
|---|---|---|
| v0.2.12 lifetime-cap removal | COMMITTED / SOURCE-VERIFIED | Background dispatch/claim/handoff has no lifetime gate. |
| v0.2.13 approval-aware config/UI | COMMITTED / SOURCE-VERIFIED | Checkbox, saved boolean, runtime summary, checkbox CSS present. |
| v0.2.13 approval detector ordering | COMMITTED / SOURCE-VERIFIED | `shouldPauseForGitHubApproval()` runs before `POLL`. |
| v0.2.13 no auto-approval | COMMITTED / SOURCE-VERIFIED | Detector only returns card; approval button is not clicked. |
| v0.2.13 detector phrase probe | PASS TARGETED | Korean exact/sample, Korean whitespace, English sample matched; ordinary GitHub status text did not match. |
| v0.2.13 regression assertions | COMMITTED | `tests/content-send.test.mjs` and `tests/popup-ui.test.mjs` updated. |
| v0.2.13 latest full npm suite | NOT_RUN | Container still cannot materialize the exact GitHub checkout. |
| v0.2.13 live GitHub approval-card behavior | PENDING | Requires Reload and an actual action confirmation in ChatGPT. |
| v0.2.13 SimpleVTT browser dispatch | PENDING | Requires live browser observation. |

## Next browser probe

1. Reload unpacked ChatGPT Rerun v0.2.13.
2. On the SimpleVTT tab, check **GitHub 승인 후 자동 계속** and press **Save connection**.
3. Keep watcher Watching.
4. Trigger/continue a GitHub write action that shows the GitHub action-confirmation card.
5. Leave the card unanswered long enough to cross the configured retry delay; no duplicate Rerun resume prompt should be sent.
6. Confirm Rerun did not click the approval control.
7. Manually choose `허용하기` or `대화에서 허용하기`.
8. After the card disappears, the running ChatGPT action and Rerun watcher should continue without another Start click.

## Completion assessment

V02-001~008 remain verified. V02-009 remains in progress until live SimpleVTT dispatch/fresh-chat behavior, rate-limit behavior, and approval-aware manual-confirmation resume are observed in the browser.
