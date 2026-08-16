# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.13 adds opt-in approval-aware waiting: suppress Rerun retry while a GitHub action confirmation is visible, never auto-click approval, and resume automatically after manual confirmation.`
- Phase: `awaiting_v0213_simplevtt_approval_aware_probe`
- Last checkpoint (UTC): `2026-08-16T23:51:00Z`

## Current Objective

Verify v0.2.13 on the actual live project, `Kaetaeru/SimpleVTT @ main`, after two separate long-run blockers were already corrected:

1. fresh same-sequence `continue` rewrites must not be trapped by `retry_limit`;
2. deliberate continuation count must not be capped by lifetime `Max sends`.

The new browser interruption reported by the user is ChatGPT's GitHub write-action confirmation card, e.g. while creating `tests/ui/connectedProjectedCharacterSpellProjection.test.ts`.

## v0.2.13 implementation

- `control.js`: adds tab-scoped `approvalAwareResume`, default `false`.
- `popup.html`: adds **GitHub 승인 후 자동 계속** checkbox and explicit explanation that approval is still manual.
- `popup.js`: persists the checkbox as a boolean in the existing per-tab config/draft and shows `GitHub approvals = Manual · auto-resume` when enabled.
- `popup.css`: gives the checkbox a normal compact row layout instead of the generic 100%-width input styling.
- `content.js`: before every Rerun `POLL`, reads the saved tab config. If approval-aware mode is enabled and a GitHub action-confirmation card is visible, the tick returns without polling.
- The detector requires an interactive `허용`, `허용하기`, or `Allow` button and nearby GitHub confirmation text matching Korean `ChatGPT가 GitHub...사용하도록 허용할까요` or English `Allow ChatGPT to use GitHub`.
- The detector does not click the approval button or dropdown. Manual confirmation remains required.
- Once the user approves and the card disappears, the next normal content tick (base interval 2 seconds) resumes polling automatically.
- Because the option is ordinary tab config, fresh-chat handoff copies it with the rest of the connection config.

## Safety / protocol boundary

This is not an auto-approval feature. Rerun may detect the presence of the explicit GitHub action-confirmation UI only to avoid duplicate Rerun retries while the user is deciding. It must not click ChatGPT app approval, GitHub OAuth/repository-access, or administrator-approval UI.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| SimpleVTT control/STATE/PLAN inspection | PASS | sequence 1 / continue is correctly authorized. |
| v0.2.12 lifetime send-cap removal | COMMITTED / SOURCE-VERIFIED | Historical `Sent` count no longer blocks dispatch/claim/handoff. |
| v0.2.13 approval-aware config/UI | COMMITTED / SOURCE-VERIFIED | Checkbox, persistence, runtime label, CSS present. |
| v0.2.13 detector ordering | COMMITTED / SOURCE-VERIFIED | approval check occurs before `POLL`. |
| v0.2.13 no-auto-click boundary | COMMITTED / SOURCE-VERIFIED | detector returns card only; no approval click path. |
| v0.2.13 phrase probe | PASS TARGETED | Korean exact/whitespace and English examples match; ordinary GitHub status text does not. |
| v0.2.13 regression assertions | COMMITTED | content-send and popup-ui tests updated. |
| v0.2.13 exact latest full npm suite | NOT_RUN | Exact branch checkout is not available in this runtime. |
| v0.2.13 live approval-card browser behavior | NOT_RUN | Requires Reload and actual ChatGPT GitHub action confirmation. |

## Next Exact Action

1. Reload unpacked extension v0.2.13.
2. Return to the existing ChatGPT tab connected to `Kaetaeru/SimpleVTT @ main`.
3. Check **GitHub 승인 후 자동 계속**, then press **Save connection**.
4. Keep/turn watcher Watching.
5. Continue until a GitHub write action shows the confirmation card.
6. Leave it unanswered past the configured retry delay; verify no duplicate Rerun resume prompt is sent and the approval UI is not auto-clicked.
7. Manually approve (`허용하기` or `대화에서 허용하기`).
8. Verify ChatGPT work continues and Rerun polling resumes without pressing Start again.

Do not change SimpleVTT's run_id/sequence merely to wake the watcher.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not change SimpleVTT sequence merely to bypass local extension counters.
- Do not reintroduce a lifetime Max sends cap.
- Do not remove per-generation retry protection for unchanged/stuck control.
- Do not auto-click app approval, OAuth, repository-access, or administrator-approval UI.
- Do not parse assistant limit-warning text.
- Do not overwrite non-Rerun user drafts.
- Do not recursively open fresh chats after direct handoff failure.
- Do not merge PR #1 unless explicitly requested.
- Do not use STATUS for reconciliation.
