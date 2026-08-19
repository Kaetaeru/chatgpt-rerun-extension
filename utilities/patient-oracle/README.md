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

The utility implementation lives here under `utilities/patient-oracle/`; target repositories use the `.patient-oracle/` runtime directory above.

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

## The 20-minute rule

Every Oracle execution is a single Rerun-style turn budget, not an unlimited job.

- At dispatch, the prompt gives ChatGPT an execution start time and a hard deadline 20 minutes later.
- At approximately 18 minutes, the worker must not begin new long operations.
- It must checkpoint durable progress first.
- If the answer cannot be safely completed, it must keep the same request identity, publish a resumable `ready` handoff with a higher revision, and end before 20 minutes.
- It must never mark an unverified/incomplete answer as complete merely because the deadline is near.

See `CONTRACT.md` for the authoritative protocol.

## MVP files

- `oracle-control.js`: strict runtime/request parsing, storage identities, prompts, time-budget invariants.
- `oracle-background.js`: GitHub reconciliation, rate-limit handling, duplicate ownership, revision safety, dispatch state machine.
- `oracle-content.js`: safe ChatGPT composer submission, lifecycle completion, approval-aware waiting, recovery ticks.
- `oracle-safety.js`: repository-stream mutation and conflicting-runtime stop gates.
- `schemas/*.schema.json`: strict machine contracts.
- `tests/oracle-runtime.test.mjs`: protocol and safety regression checks.

## Status

This branch starts Patient Oracle as an isolated utility. It is deliberately not wired into the main Side Panel/manifest until its runtime and safety tests are stable.