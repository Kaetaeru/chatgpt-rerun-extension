# Rerun Plan

## Goal

Validate ChatGPT Rerun v0.2.x after the architecture evolved to independent per-tab runtimes, GitHub-backed fresh-chat handoff, persistent tab watchers independent from GitHub work state, explicit unconnected-first onboarding, reliable automatic prompt submission, automatic exhausted-chat recovery, rate-limit-resilient GitHub polling, durable multi-execution continuation within one task sequence, no lifetime send cap for deliberate fresh authorizations, approval-aware waiting that resumes automatically after the user manually confirms a GitHub action, and a browser fail-safe that stops a stuck Rerun-owned generation after 23 active minutes.

## Definition of Done

- [x] V02-001 tab-scoped Side Panel/config/runtime isolation verified.
- [x] V02-002 same GitHub control stream collision guard verified.
- [x] V02-003 new-sequence dispatch and same-sequence retry regression verified.
- [x] V02-004 `Continue in new chat` ownership transfer baseline verified.
- [x] V02-005 handoff race/failure behavior verified to the extent safely reproducible.
- [x] V02-006 persistent watcher across terminal GitHub work states verified.
- [x] V02-007 single state-driven Start/Stop watcher toggle verified.
- [x] V02-008 unconnected-first Rerun connection onboarding verified on a separate safe project.
- [ ] V02-009 current-tab resume prompt is automatically submitted without manual Send/Enter.
- [ ] V02-009 exhausted/stale-Rerun-prompt path transfers watcher to one fresh chat while user drafts remain protected.
- [ ] V02-009 fresh-chat handoff auto-submits and works under both `continue` and terminal GitHub work states.
- [ ] V02-009 GitHub REST rate limits pause polling without stopping the watcher, then auto-resume.
- [ ] V02-009 a freshly rewritten `continue` control with the same sequence is treated as new authorization even after the unchanged-generation retry limit was reached.
- [ ] V02-009 lifetime `Max sends` does not block current-tab dispatch, sequence claim, or fresh-chat handoff; `Sent` remains diagnostic only.
- [ ] V02-009 `GitHub 승인 후 자동 계속` suppresses Rerun retry while a GitHub action-confirmation card is visible, never clicks the approval UI, and resumes automatically after manual approval.
- [ ] V02-009 a Rerun-owned generation that remains actively generating for 23 minutes is force-stopped once, while GitHub approval waiting and non-Rerun/manual generations are excluded.
- [ ] V02-009 forced Stop leaves the watcher/retry path able to continue without another Start click.
- [ ] V02-009 browser evidence is recorded.
- [ ] No unresolved blocker remains.

## Constraints / invariants

- Do not merge PR #1 as part of this automated run.
- Authoritative state writes use PLAN -> STATE -> control.json; control is the last authoritative write.
- `.chatgpt-rerun/STATUS.md` is presentation-only and never participates in reconciliation.
- One ChatGPT execution must end before the 20-minute hard stop; around 18 minutes checkpoint first.
- The 23-minute browser watchdog is only a recovery fail-safe when the assistant fails to end before 20 minutes because generation hangs; it does not change the 20-minute protocol budget.
- The watchdog may force-stop only a generation armed by a successfully dispatched Rerun prompt while the tab watcher is enabled.
- GitHub action-confirmation waiting time is excluded from watchdog active-generation time.
- Do not parse assistant output or limit-message text to detect context/token limits.
- Do not automate ChatGPT app approval, OAuth, repository-access, or administrator-approval clicks.
- Approval-aware mode may detect the presence of a GitHub action-confirmation UI only to suppress Rerun retry while manual confirmation is pending.
- `runtime.enabled` is the current-tab GitHub watcher on/off state, independent from GitHub work status.
- `continue` is work start/resume; `complete`, `needs_user`, `blocked` pause implementation dispatch but do not stop a watcher.
- GitHub REST `403/429` rate limiting is not a watcher Stop. Respect reset/retry timing and keep the watcher enabled.
- Unauthenticated polling reserves headroom below GitHub's public REST quota and shares that budget across enabled unauthenticated watchers.
- Authenticated polling may run at the existing 5-second minimum and retains conditional ETag requests.
- Automatic dispatch means compose + actual submit; leaving text in the composer is failure.
- A non-empty composer is protected unless its normalized text exactly equals the current configured Rerun resume prompt.
- Automatic fresh-chat recovery must not recursively open new tabs after a direct handoff prompt fails.
- `sequence` identifies the durable task/checkpoint stream; it is not a one-shot execution id.
- Within the same sequence, a `continue` whose `updated_at` is newer than the watcher's `lastSentAt` is a fresh authorization generation, not an unchanged-control retry.
- Retry delay/count limits apply only while the exact same control generation remains unchanged after a send.
- There is no lifetime send-count safety gate. `runCount`/`Sent` may increase without bound for diagnostics and must never suppress a valid fresh authorization or handoff.

## Validation baseline

- v0.2.5 full syntax/test baseline: PASS, 38/38.
- v0.2.6 targeted auto-submit tests: PASS, 4/4.
- v0.2.7 status-independent handoff source/prompt checks: PASS.
- v0.2.8 browser probe exposed stale-prompt guard regression.
- v0.2.9 stale Rerun prompt ownership fix: source/regression assertions committed; browser probe was then blocked by GitHub public API rate limiting.
- v0.2.10 rate-limit resilience implementation and tests: COMMITTED; browser UI load PASS (`Public · rate-safe`).
- v0.2.11 same-sequence authorization-generation fix: COMMITTED; targeted decision probe PASS.
- v0.2.12 lifetime send-cap removal: COMMITTED and source-verified.
- v0.2.13 approval-aware manual-confirmation resume: COMMITTED and source-verified; live approval-card browser verification pending.
- v0.2.14 23-minute generation watchdog: COMMITTED. `content.js` arms only after Rerun dispatch evidence, gates on enabled watcher, subtracts approval wait time, uses visible/actionable Stop detection, clicks Stop once at 23 active minutes, and resets when the generation ends or watcher stops.
- v0.2.14 source regression assertions: COMMITTED in `tests/content-send.test.mjs`.
- v0.2.14 exact full npm suite: NOT_RUN because this runtime cannot materialize an exact GitHub checkout.
- Build: N/A (unpacked Manifest V3 extension).

## Tasks

| ID | Status | Task | Acceptance evidence |
|---|---|---|---|
| V02-001 | verified | Tab-scoped Side Panel/config/runtime | Two ChatGPT tabs kept independent state |
| V02-002 | verified | Same-stream collision guard | Duplicate watcher Start was rejected |
| V02-003 | verified | Dispatch/retry regression | New/same-sequence dispatch worked on owning tab only |
| V02-004 | verified | Fresh-chat handoff baseline | User-confirmed GitHub-backed ownership transfer |
| V02-005 | verified | Handoff race/failure safeguards | Live success + source-verified suppression/cleanup paths |
| V02-006 | verified | Persistent watcher across GitHub work states | `needs_user` kept watcher Watching; later same-seq `continue` auto-resumed |
| V02-007 | verified | Unified Start/Stop watcher | User-confirmed Stop -> Start round trip |
| V02-008 | verified | Unconnected-first explicit onboarding | User completed separate-project onboarding probe |
| V02-009 | in_progress | Reliable auto-submit + fresh-chat recovery + rate-limit resilience + unlimited continuations + approval-aware resume + stuck-generation recovery | v0.2.14 browser verification pending |

## SimpleVTT live diagnosis retained

The live project remains `Kaetaeru/SimpleVTT @ main`. Its authoritative Rerun coordination has been the primary dogfood target and deliberate continuation remains on the same durable sequence rather than incrementing sequence merely to wake the extension.

v0.2.12 removed the lifetime `Max sends=20` blocker. v0.2.13 prevents GitHub action-confirmation waiting from causing duplicate Rerun retries. v0.2.14 addresses a separate failure mode reported by the user: ChatGPT can error or freeze mid-answer while the page still remains in a generating state, so `isChatIdle()` never becomes true and no continuation is dispatched.

## v0.2.14 behavior

- `sendPrompt()` arms the watchdog only after visible dispatch evidence succeeds.
- The watchdog is scoped to an enabled tab watcher; watcher Stop resets it.
- A 15-second start grace avoids immediately discarding the timer while ChatGPT's Stop control is still appearing after dispatch.
- Active generation time is computed from the Rerun dispatch start timestamp minus GitHub approval-card waiting time.
- At 23 active minutes, a visible/actionable current ChatGPT Stop button is clicked once.
- Once generation ends, watchdog state resets and normal `POLL`/same-sequence retry/fresh-authorization behavior resumes.
- Manual ChatGPT generations that were not dispatched by Rerun are not armed and must not be force-stopped.

## Current gate

Reload unpacked ChatGPT Rerun **v0.2.14**. On the existing SimpleVTT ChatGPT tab:

1. keep/turn watcher Watching;
2. keep **GitHub 승인 후 자동 계속** enabled if desired and Save connection;
3. verify normal Rerun execution still checkpoints around 18 minutes and exits before 20 minutes;
4. for the new watchdog, use a controlled stuck-generation path or a temporary shortened threshold for practical browser verification;
5. verify exactly one automatic Stop at the equivalent of 23 active minutes;
6. verify GitHub approval waiting does not consume watchdog time;
7. verify watcher remains enabled and Rerun can continue without pressing Start again;
8. verify a watcher-stopped/manual ChatGPT response is not force-stopped.

Do not change SimpleVTT's run_id or sequence merely to wake it.
