# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.9 fixes the stale Rerun prompt being mistaken for a user draft before automatic exhausted-chat handoff; reload before browser verification.`
- Phase: `awaiting_v029_reload_and_stale_prompt_handoff_probe`
- Last checkpoint (UTC): `2026-08-16T18:20:00Z`
- Current execution started (UTC): `2026-08-16T18:20:00Z`
- Current execution hard stop (UTC): `2026-08-16T18:40:00Z`

## Current Objective

Verify V02-009 on v0.2.9. On an exhausted ChatGPT conversation, Start must not immediately fall back to Stopped merely because a previous Rerun resume prompt is still visible in the composer. If that composer text exactly matches the current Rerun resume prompt, the extension must treat it as extension-owned stale state and transfer the watcher to one fresh ChatGPT tab.

## Latest browser evidence

The user re-tested v0.2.8 and reported: `다시 돌아왔어. 탭이 새로 안열렸어` — the control returned to Start again and no new tab opened.

Inspection found a pre-handoff guard that explains this exact behavior. Before a sequence is claimed, `content.js` previously stopped on any non-empty composer with `composer_not_empty`. A resume prompt left behind by an earlier failed Rerun dispatch therefore looked indistinguishable from a user draft, so the watcher stopped before the v0.2.8 automatic handoff catch path could run.

## v0.2.9 fix completed

- `content.js` now reads existing composer text and compares normalized text with the current Rerun resume prompt.
- Different non-empty text remains protected and triggers `composer_not_empty` exactly as before.
- An exact Rerun-owned stale prompt no longer triggers the user-draft guard.
- A stale Rerun-owned prompt immediately attempts the existing `HANDOFF_NEW_CHAT` path instead of retrying the exhausted chat.
- If that handoff fails, the watcher safe-stops with `auto_handoff_failed` and the background error remains visible in the Side Panel.
- Prompt/editor synchronization failure is also eligible for the one-shot fresh-chat fallback.
- Fresh-chat direct handoff submission is still non-recursive, preventing runaway new-tab loops.
- `tests/content-send.test.mjs` now asserts stale Rerun prompt vs user-draft separation and the direct stale-prompt handoff path.
- Extension/package version bumped to `0.2.9`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~008 prior browser evidence | PASS | Retained. |
| v0.2.8 exhausted-chat browser probe | FAIL | Start returned to Start; no fresh tab opened. |
| Root cause source inspection | PASS | Pre-claim `composer_not_empty` guard ran before v0.2.8 auto-handoff. |
| v0.2.9 remote source inspection | PASS | Exact current Rerun prompt is distinguished from other non-empty composer text and routed to handoff. |
| v0.2.9 regression assertions | COMMITTED | `tests/content-send.test.mjs` covers stale prompt ownership and handoff. |
| v0.2.9 exact latest full npm suite | NOT_RUN | No mounted latest checkout / GitHub clone access in this environment; do not claim full-suite PASS. |
| v0.2.9 exhausted-chat browser handoff | NOT_RUN | Requires extension Reload and the user's same test case. |

## Next Exact Action

Reload the unpacked extension at v0.2.9. On the same exhausted chat, leave the stale Rerun resume prompt in the composer if it is still present and press Start with a valid `continue` work signal. Expected: one fresh ChatGPT tab opens, watcher ownership transfers, and the fresh-chat handoff prompt is submitted. If the composer contains different user-authored text, expected behavior remains a safe Stop.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not parse assistant output or limit-warning text.
- Do not overwrite a non-empty composer unless its normalized text exactly equals the configured Rerun resume prompt.
- Do not recursively open fresh chats if the direct handoff prompt fails in the fresh tab.
- Do not merge PR #1 unless the user explicitly requests it.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.9 and repeat the exhausted-chat Start probe.
