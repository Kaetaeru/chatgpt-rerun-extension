# Rerun State

## Identity

- Run ID: `chatgpt-rerun-v02-20260816-01`
- Sequence: `7`
- Desired control status: `needs_user`
- Current task: `V02-008`
- Control reason: `v0.2.5 makes new tabs truly Unconnected and requires connection discovery from actual conversation GitHub usage; reload before the final onboarding probe.`
- Phase: `awaiting_v025_reload_and_unconnected_onboarding_probe`
- Last checkpoint (UTC): `2026-08-16T15:42:00Z`
- Current execution started (UTC): `2026-08-16T15:42:00Z`
- Current execution hard stop (UTC): `2026-08-16T16:02:00Z`

## Current Objective

Complete final V02-008 against a separate safe project using the stricter v0.2.5 onboarding model. A brand-new ChatGPT tab must first show `Repository connection = Unconnected` with no inherited Owner/Repository/Branch. Before that conversation has actually used any GitHub repository, the connection prompt must return `RERUN_CONNECTION: UNCONNECTED` and write nothing. After the same conversation actually reads/uses one test repository, the second connection prompt must identify that real repo/branch, install the five Rerun documents, report complete CONNECTED coordinates, and stop before implementation. The user then stores the reported coordinates in the Side Panel and presses Start to begin the first task.

## Completed

- V02-001 through V02-007 remain verified and were not repeated.
- v0.2.5 `control.js`: connection prompt no longer accepts Side Panel coordinates as identification hints.
- The prompt requires actual GitHub app/tool usage in the current conversation; text mentions alone are insufficient.
- No actual repo -> `RERUN_CONNECTION: UNCONNECTED`, no writes.
- Multiple/unclear repo or branch -> `RERUN_CONNECTION: AMBIGUOUS`, no writes.
- Confirmed repo -> install/repair README/PLAN/STATE/STATUS/control and report `RERUN_CONNECTION: CONNECTED` with owner/repo, canonical URL, exact branch/ref, control path, setup mode, run_id, sequence, status, task_id, and project goal.
- v0.2.5 `popup.js`: new tabs no longer inherit unrelated legacy repository coordinates; only the actual legacy `targetTabId` can receive legacy config/runtime migration.
- `DEFAULT_CONFIG.branch` now starts blank; Save/Start still resolves an explicitly connected blank branch to `main`.
- Side Panel now displays `Repository connection = Unconnected` separately from watcher/work status and explains the new onboarding flow.
- The extension remains content-blind: it does not parse the assistant's CONNECTED result; the user confirms and stores the reported coordinates.
- `tests/control.test.mjs` and `tests/popup-ui.test.mjs` were updated for UNCONNECTED/AMBIGUOUS/CONNECTED and no-legacy-inheritance invariants.
- README and V02 E2E runbook were updated to v0.2.5 semantics.
- Extension/package version is now `0.2.5`.

## Verification

| Check | Result | Evidence / note |
|---|---|---|
| V02-001~007 live browser | PASS | Existing verified evidence retained. |
| v0.2.5 connection prompt source contract | PASS | Remote source includes actual-GitHub-use requirement, UNCONNECTED/AMBIGUOUS no-write branches, and full CONNECTED report. |
| v0.2.5 Side Panel source contract | PASS | Remote source shows Unconnected connection row and connection prompt no longer passes owner/repo/branch hints. |
| v0.2.5 legacy isolation source contract | PASS | Remote `popup.js` migrates repository config only when `legacy.targetTabId === current tabId`. |
| v0.2.5 regression tests | COMMITTED | Updated control and popup UI tests are present on branch. |
| Full latest `npm run check` | NOT_RUN | Complete latest checkout unavailable in this environment; do not claim PASS. |
| Full latest `npm test` | NOT_RUN | Same limitation. |
| V02-008 true UNCONNECTED browser path | NOT_RUN | Requires v0.2.5 Reload and a brand-new ChatGPT tab. |
| V02-008 CONNECTED first-install browser path | NOT_RUN | Requires separate safe test repo after UNCONNECTED probe. |

## Pending

- Reload unpacked extension at v0.2.5.
- Open a brand-new ChatGPT tab and confirm Repository connection is Unconnected and old repo coordinates are not inherited.
- Before using GitHub in that chat, press `Rerun 연결 프롬프트`; confirm `RERUN_CONNECTION: UNCONNECTED` and no GitHub writes.
- In the same chat, actually read/use the safe test repository through GitHub.
- Press `Rerun 연결 프롬프트` again; confirm CONNECTED report and five-file first installation with control last, no implementation work.
- Store the reported Owner/Repository/Branch in Side Panel, Save, then Start.
- Confirm watcher begins and seq 0 / continue starts the first task.
- Run full latest Node checks when an up-to-date checkout is available before final release-quality declaration.

## Next Exact Action

User Reloads v0.2.5 and starts V02-008-A in a new ChatGPT tab that has not yet used any GitHub repository. The first connection prompt must produce UNCONNECTED/no writes.

## Do Not Repeat

- Do not repeat V02-001 through V02-007.
- Do not prefill the new test tab with repository coordinates before the UNCONNECTED probe.
- Do not mention the test repo in a way that is treated as actual GitHub use; the decisive evidence must be GitHub app/tool access.
- Do not delete this repository's current `.chatgpt-rerun` state.
- Do not parse assistant output in the extension to auto-fill repository fields.
- Do not claim V02-008 PASS before both UNCONNECTED and CONNECTED first-install paths are observed.
- Do not claim the full latest Node suite passed.

## Blockers / User Decisions

- User action required: Reload unpacked extension to v0.2.5 and perform the final separate-project onboarding probe.