# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `9`
- Desired control status: `needs_user`
- Current task: `V02-009`
- Control reason: `v0.2.6 fixes the observed prompt-inserted-but-not-submitted regression; reload the unpacked extension before browser verification.`
- Phase: `awaiting_v026_reload_and_auto_submit_probe`
- Last checkpoint (UTC): `2026-08-16T17:20:00Z`
- Current execution started (UTC): `2026-08-16T17:18:00Z`
- Current execution hard stop (UTC): `2026-08-16T17:38:00Z`

## Current Objective

Verify V02-009: a Rerun `continue` dispatch must not merely paste the resume prompt into ChatGPT. It must automatically submit the prompt in the same extension action, with no manual Send click or Enter key required.

## Regression observed

The user reported that pressing Start caused the resume prompt to appear in the ChatGPT composer but did not immediately execute it. This is treated as a product regression, not expected behavior.

The v0.2.5 `sendPrompt` path wrote the composer text, waited 2.5 seconds for an enabled Send button, and clicked it if found. In the contenteditable path, successful `execCommand("insertText")` returned immediately without explicit follow-up input synchronization. This can leave visible DOM text while the ChatGPT editor/send-button state is not yet synchronized.

## v0.2.6 fix completed

- `content.js` now dispatches explicit input/change synchronization after prompt injection, including the successful contenteditable `execCommand` path.
- It verifies the prompt is present before attempting submission.
- Send-button wait increased to 4 seconds.
- If no enabled Send button appears, it dispatches an Enter key fallback.
- It waits for observable dispatch evidence before sequence ACK: composer cleared/disappeared or ChatGPT generation started.
- If dispatch evidence never appears, it reports a send failure instead of falsely ACKing the sequence.
- New `tests/content-send.test.mjs` covers the synchronization, fallback, and dispatch-evidence requirements.
- Extension/package version bumped to `0.2.6`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| v0.2.5 previous full suite | PASS | 38/38 before this regression fix. |
| v0.2.6 `content.js` syntax | PASS | `node --check` on exact updated source. |
| v0.2.6 auto-submit targeted tests | PASS | 4/4 in `tests/content-send.test.mjs`. |
| v0.2.6 browser auto-submit | NOT_RUN | Requires extension Reload and live ChatGPT UI. |

## Next Exact Action

Reload the unpacked extension at v0.2.6. Keep GitHub work state waiting until Reload is confirmed. Then publish a safe `continue` signal and verify that the owning Watching tab inserts **and submits** the resume prompt automatically.

## Do Not Repeat

- Do not repeat V02-001 through V02-008.
- Do not call prompt text appearing in the composer a PASS; the prompt must actually be submitted.
- Do not ACK a sequence merely because `.click()` was invoked; require dispatch evidence.
- Do not merge PR #1 unless the user explicitly requests it.
- Do not use STATUS for reconciliation.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.6 for the live browser verification.
