# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.8 automatically hands off a confirmed failed resume dispatch from an exhausted chat to a fresh ChatGPT tab; reload before browser verification.`
- Phase: `awaiting_v028_reload_and_exhausted_chat_probe`
- Last checkpoint (UTC): `2026-08-16T18:12:00Z`
- Current execution started (UTC): `2026-08-16T18:12:00Z`
- Current execution hard stop (UTC): `2026-08-16T18:32:00Z`

## Current Objective

Verify V02-009 on v0.2.8. When a connected chat can no longer dispatch an extension-injected resume prompt, pressing Start must not simply enable and immediately disable the watcher. After a confirmed dispatch failure, Rerun must release the sequence claim and transfer watcher ownership to one fresh ChatGPT tab using the existing GitHub-backed handoff path.

## Regression findings

1. v0.2.5 could paste a resume prompt without submitting it.
2. v0.2.6 added robust auto-submit and dispatch-evidence verification.
3. v0.2.7 made fresh-chat handoff independent from GitHub terminal work state.
4. The latest browser observation found another gap: on an exhausted current chat, Start enabled the watcher, the `continue` dispatch failed, and `content.js` unconditionally called `STOP_SESSION`, making the UI immediately return to Start.

## v0.2.8 fix completed

- `content.js` now remembers/resolves its Chrome tab ID from `REGISTER_CHAT_TAB`.
- A normal watcher dispatch still releases the sequence claim on any send error.
- Only confirmed post-insertion dispatch failures (`prompt inserted but ...`) attempt automatic fresh-chat handoff.
- The content script invokes the existing `HANDOFF_NEW_CHAT` path with its resolved tab ID.
- Successful automatic handoff transfers watcher ownership to the fresh tab and does not call `STOP_SESSION` on the old tab path.
- If automatic handoff fails, the watcher safe-stops with `auto_handoff_failed`.
- Composer synchronization failures and other non-confirmed errors still safe-stop rather than opening a surprise tab.
- The fresh-chat direct handoff prompt does not recursively trigger another automatic handoff if it fails.
- `tests/content-send.test.mjs` now includes regression assertions for automatic handoff and safe fallback.
- Extension/package version bumped to `0.2.8`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| v0.2.6 auto-submit targeted tests | PASS | Previous checkpoint. |
| v0.2.7 status-independent handoff source/prompt checks | PASS | Previous checkpoint. |
| v0.2.8 remote source inspection | PASS | Confirmed dispatch failure path now calls `HANDOFF_NEW_CHAT`; other errors retain safe-stop. |
| v0.2.8 regression tests | COMMITTED | `tests/content-send.test.mjs` updated with auto-handoff assertions. |
| v0.2.8 exact latest npm suite | NOT_RUN | Current environment has no mounted latest checkout and GitHub network access remains unavailable for cloning; do not claim full-suite PASS. |
| v0.2.8 exhausted-chat browser handoff | NOT_RUN | Requires extension Reload and the user's exhausted-chat test case. |

## Next Exact Action

Reload the unpacked extension at v0.2.8. Keep GitHub work state waiting until Reload. Then use the same exhausted chat test case with a valid `continue` signal: press Start and verify that one fresh ChatGPT tab opens, its handoff prompt is automatically submitted, and watcher ownership moves to that tab instead of the old tab simply returning to Start.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not parse assistant output or limit-warning text to decide that a chat is exhausted.
- Do not treat prompt insertion alone as successful dispatch.
- Do not recursively open fresh chats after a fresh-chat handoff prompt itself fails.
- Do not merge PR #1 unless the user explicitly requests it.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.8 for live browser verification.
