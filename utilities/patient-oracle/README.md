# Patient Oracle

> **A question may wait. Its answer must return with its identity intact.**

Patient Oracle is a GitHub-backed request/response worker protocol for driving one ChatGPT browser tab without treating the ChatGPT response DOM as an API.

The name preserves the philosophy of **The Voyage of Theseus**:

- **Patient** is the adjective: the request can remain durable while the temporary model, conversation, browser service worker, or network state changes.
- **Oracle** is the named thing: a worker receives a question, reasons in a fresh ChatGPT conversation, and returns an answer through durable GitHub state.

## Architecture

```text
external caller
    |
    | writes request JSON
    v
GitHub request queue
    |
    v
Patient Oracle Chrome scheduler
    |
    v
fresh ChatGPT conversation in one owned worker tab
    |
    | ChatGPT reads request from GitHub
    | ChatGPT writes response to GitHub
    v
GitHub response JSON + runtime handoff
    |
    v
external caller reads result
```

**GitHub is the source of truth.** The extension observes only browser execution lifecycle and GitHub state. It does not parse the assistant answer body to obtain the result.

## Directory protocol

```text
.patient-oracle/
├── CONTRACT.md
├── runtime.json
├── requests/
│   └── REQ-000001.json
└── responses/
    └── REQ-000001.json
```

The utility implementation lives under `utilities/patient-oracle/`; target repositories use the `.patient-oracle/` runtime directory above.

## Runtime principles

1. One stream is identified by `owner / repo / branch / runtime path`.
2. One stream may have only one active Chrome worker owner at a time.
3. `revision` is monotonic. Regression is a local safety stop.
4. Only a newer `ready` revision may dispatch a request.
5. The response artifact is written before the terminal runtime handoff.
6. `runtime.json` is the final authoritative write for a request transition.
7. Assistant output DOM is never the durable answer channel.
8. GitHub approval controls are never auto-clicked.
9. A visible GitHub approval card pauses completion/retry decisions until the user resolves it manually.
10. Non-empty user composer text is never overwritten.
11. Prompt dispatch is successful only after submission evidence is observed.
12. GitHub rate limits pause polling instead of killing the worker.
13. Missed DOM completion events recover through conservative polling.
14. A single unchanged request cannot dispatch forever; local duplicate/circuit-breaker limits apply.
15. Every ChatGPT execution has the inherited Rerun **20-minute hard stop** and approximately **18-minute checkpoint**.
16. Single Rerun, Voyage Team, and Patient Oracle are mutually exclusive in one worker tab.
17. Changing repository coordinates or Oracle runtime path while active safely stops Oracle before it can operate on the new stream.

## The 20-minute rule

Every Oracle execution is a single Rerun-style turn budget, not an unlimited job.

- At dispatch, the prompt gives ChatGPT an execution start time and a hard deadline 20 minutes later.
- At approximately 18 minutes, the worker must not begin new long operations.
- It must checkpoint durable progress first.
- If the answer cannot be safely completed, it must keep the same request identity, publish a resumable `ready` handoff with a higher revision, and end before 20 minutes.
- It must never mark an unverified/incomplete answer as complete merely because the deadline is near.
- The browser content runtime also carries a local checkpoint timer and 20-minute hard-stop failsafe.

See `CONTRACT.md` for the authoritative protocol.

## Browser extension wiring

The `agent/patient-oracle-mvp` branch wires Patient Oracle into the extension without replacing the existing v0.4 Single/Team paths:

- `background-v04.js` loads `patient-oracle-background.js`.
- `manifest.json` registers the Oracle lifecycle observer as a separate ChatGPT content-script entry so the existing Team tuple remains unchanged.
- `popup.html` loads `patient-oracle-panel.js` and `patient-oracle-panel-safety.js`.
- Start performs a runtime safety preflight. If `.patient-oracle/runtime.json` is missing, the current ChatGPT tab bootstraps the target protocol under the same approval and 20-minute rules.
- Once initialized, callers publish an immutable request file and then publish `runtime.json` last with a higher `ready` revision.

## Caller CLI

`caller.mjs` is a small GitHub-only caller. It never reads ChatGPT DOM output.

```bash
export GITHUB_TOKEN=...
npm run oracle:ask -- \
  --owner OWNER \
  --repo REPOSITORY \
  --branch main \
  --prompt "Answer this question"
```

The caller writes the request first and updates `runtime.json` last using the runtime file SHA as an optimistic-concurrency guard. It refuses to overwrite a non-`complete` runtime, refuses request-ID reuse, validates response identity, and waits only on GitHub state.

Commands are also available directly:

```bash
node utilities/patient-oracle/caller.mjs enqueue ...
node utilities/patient-oracle/caller.mjs wait --owner OWNER --repo REPOSITORY --id REQ-ID
node utilities/patient-oracle/caller.mjs ask ...
```

## MVP files

- `oracle-control.js`: strict runtime/request parsing, storage identities, prompts, time-budget invariants.
- `oracle-background.js`: GitHub reconciliation, rate-limit handling, duplicate ownership, revision safety, dispatch state machine.
- `oracle-content.js`: safe ChatGPT composer submission, lifecycle completion, approval-aware waiting, recovery ticks.
- `oracle-safety.js`: repository-stream mutation and conflicting-runtime stop gates.
- `caller.mjs`: GitHub request publication and response waiting for external callers.
- `schemas/*.schema.json`: strict machine contracts.
- `tests/oracle-runtime.test.mjs`: protocol and safety regression checks.
- `../../tests/patient-oracle-wiring.test.mjs`: extension wiring and inherited-safety regressions.
- `E2E_TEST_PLAN.md`: browser release gate.

## Current status

Patient Oracle is now wired into the extension on `agent/patient-oracle-mvp`. Static regression coverage and the caller path are present. The remaining release gate is a real browser E2E in which a caller publishes a request, the extension dispatches a fresh ChatGPT turn, ChatGPT writes the response through GitHub, and the caller receives that durable response without DOM scraping.
