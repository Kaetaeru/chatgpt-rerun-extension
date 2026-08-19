# Patient Oracle Browser E2E Release Gate

This is the release gate for the Patient Oracle MVP. Passing unit/static tests is not enough. The browser path must prove that GitHub, not assistant DOM text, is the durable request/response channel.

## Preconditions

1. Checkout `agent/patient-oracle-mvp` and load the repository as an unpacked Chrome extension.
2. Open a normal ChatGPT tab and open The Voyage of Theseus Side Panel from that tab.
3. Connect the Side Panel to a writable GitHub repository and branch that ChatGPT can access through the GitHub capability.
4. Stop Single Rerun and Voyage Team before starting Patient Oracle.
5. Keep the browser tab alive for the duration of the test.
6. Export a GitHub token for the external caller:

```bash
export GITHUB_TOKEN=...
```

The token is used by `caller.mjs` for GitHub contents API reads/writes only. It is not an OpenAI credential.

## E2E-001 — Bootstrap

1. Ensure the target branch does not contain `.patient-oracle/runtime.json`.
2. Click **Start Oracle**.
3. If ChatGPT shows a GitHub approval card, verify the extension does not click it. Approve manually if you want the test to proceed.
4. Wait for the bootstrap turn to finish.
5. Verify GitHub contains `.patient-oracle/CONTRACT.md` and `.patient-oracle/runtime.json`.
6. Verify `runtime.json` is strict v1 JSON with `revision: 0`, `status: "complete"`, no fabricated request, and a reason indicating initialization/waiting.
7. Verify the Side Panel remains enabled and shows a terminal/watching state rather than dispatching another turn.

Pass conditions:

- no approval control was auto-clicked;
- bootstrap obeyed the same lifecycle observer and 20-minute budget as a normal Oracle execution;
- `runtime.json` was the last authoritative bootstrap write.

## E2E-002 — One request, one durable response

Run:

```bash
npm run oracle:ask -- \
  --owner OWNER \
  --repo REPOSITORY \
  --branch BRANCH \
  --id REQ-E2E-0001 \
  --prompt "Return the exact marker PATIENT_ORACLE_E2E_OK and one short sentence explaining that this answer came through the GitHub response artifact." \
  --timeout-seconds 1800
```

Expected sequence:

1. Caller creates `.patient-oracle/requests/REQ-E2E-0001.json`.
2. Caller updates `runtime.json` last with a higher revision, status `ready`, and request ID `REQ-E2E-0001`.
3. Patient Oracle observes the newer GitHub revision.
4. The owned ChatGPT tab navigates to a fresh conversation.
5. The safe composer path submits one armed Oracle prompt.
6. ChatGPT reads the contract, runtime, and request from GitHub.
7. ChatGPT writes `.patient-oracle/responses/REQ-E2E-0001.json` first.
8. ChatGPT verifies the response write and updates `runtime.json` last to a higher `complete` revision for the same request.
9. DOM completion only wakes the scheduler; the scheduler force-reconciles GitHub before doing anything else.
10. `caller.mjs` returns the answer from the GitHub response file.

Pass conditions:

- caller output contains `status: "complete"` and the marker `PATIENT_ORACLE_E2E_OK`;
- response `request_id` exactly matches `REQ-E2E-0001`;
- runtime revision increased monotonically;
- no assistant message text was scraped from the ChatGPT DOM;
- only one dispatch occurred for the ready revision.

## E2E-003 — User draft protection

1. Stop Oracle.
2. Publish a new ready request manually or with `caller.mjs enqueue`.
3. Type arbitrary user text into the ChatGPT composer without sending it.
4. Start Oracle.

Pass conditions:

- Patient Oracle does not overwrite the non-empty user draft;
- the ready request is not falsely ACKed as submitted;
- the worker stops or reports the protected-draft condition rather than silently replacing user text.

## E2E-004 — Manual approval safety

1. Use a request that requires a GitHub write and causes ChatGPT to show an approval card.
2. Leave the approval pending for at least one recovery tick.

Pass conditions:

- no extension code clicks approval/OAuth/admin controls;
- completion is not emitted while the approval card is visible;
- retry/redispatch is suppressed while approval is visible;
- after manual approval and card disappearance, the same armed execution can continue safely.

## E2E-005 — Mode mutual exclusion

Test all three pairs in one ChatGPT tab:

- Single Rerun running -> Start Oracle must be unavailable/rejected.
- Voyage Team running -> Start Oracle must be unavailable/rejected.
- Oracle running -> Single and Team controls must be locked; if conflicting state is introduced directly through storage/background paths, a safety listener must stop one mode before another Oracle dispatch.

Pass condition: two execution modes are never concurrently allowed to dispatch from the same worker tab.

## E2E-006 — Duplicate stream owner

1. Open two ChatGPT tabs connected to the same owner/repo/branch/Oracle runtime path.
2. Start Oracle in tab A.
3. Attempt to start Oracle in tab B.

Pass condition: tab B is rejected with the existing owner tab ID and cannot dispatch.

## E2E-007 — Revision regression

1. Let Oracle observe runtime revision N.
2. Manually change GitHub runtime to the same run ID with revision N-1.

Pass conditions:

- Oracle stops locally with `revision_regressed`;
- no prompt is sent from the regressed state.

## E2E-008 — 18/20-minute law

Use a request intentionally too large to complete in one turn.

Pass conditions:

- Side Panel shows a concrete checkpoint timestamp and hard-stop timestamp for the armed execution;
- at approximately minute 18 the local checkpoint event is emitted;
- the worker begins no new long work after the checkpoint and prioritizes durable handoff;
- if incomplete, the same request ID is reauthorized through a higher `ready` revision rather than falsely marked complete;
- the active execution is locally hard-stopped at 20 minutes if no durable handoff was observed;
- the next fresh turn receives a new 20-minute budget.

## E2E-009 — Terminal watcher behavior

1. Finish a request so runtime is `complete`.
2. Leave Oracle enabled.
3. Wait through multiple recovery/poll intervals.

Pass condition: terminal state does not redispatch the same revision. A later higher `ready` revision can resume work without restarting the watcher.

## E2E-010 — Runtime path mutation

1. Start Oracle on one runtime path.
2. Change the connected repository, branch, or Oracle runtime path while it is active.

Pass condition: Oracle stops with repository/stream mutation safety before it can read or dispatch against the changed stream.

## Release decision

The MVP is browser-ready only after E2E-001 through E2E-010 pass on the same branch. Record exact request IDs, runtime revisions, commit SHAs, approval observations, and any failures. Do not mark an unrun scenario as passed.
