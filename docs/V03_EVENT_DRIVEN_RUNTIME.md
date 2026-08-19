# ChatGPT Rerun v0.3 — Event-driven runtime

## Goal

Reduce the delay and GitHub API traffic between one Rerun-managed ChatGPT turn finishing and the next authorized turn starting, without adding a server or weakening the existing GitHub-backed safety model.

## Runtime model

v0.3 keeps normal polling as recovery fallback, but adds a local browser event fast path:

```text
Rerun prompt submitted
        ↓
ChatGPT generation starts
        ↓
turn-observer.js observes the Rerun runtime + DOM
        ↓
ChatGPT becomes stably idle
        ↓
TURN_FINISHED
        ↓
background.js forces one GitHub control reconciliation
        ↓
new authorized continue?
   ├─ no  → wait
   └─ yes → RERUN_WAKE
              ↓
        existing POLL / CLAIM / send / ACK path
```

The observer does not parse assistant text and does not decide what the next task is. GitHub remains the source of truth.

## Safety properties

- Only turns armed by Rerun runtime activity (`lastSentAt` or repository bootstrap) emit `TURN_FINISHED`; arbitrary user chat turns do not become automatic work triggers.
- A turn must first be observed generating and then remain idle for 600 ms before completion is emitted.
- A visible GitHub action approval card prevents completion from firing. The extension still never clicks approval controls.
- `TURN_FINISHED` does not directly submit a prompt. It forces one fresh GitHub control read and wakes the existing safe dispatch path only when the reconciled control returns `continue`.
- Existing `CLAIM_SEQUENCE` and `ACK_SEQUENCE` semantics remain responsible for duplicate-send protection.
- Existing interval polling remains enabled as recovery for missed DOM events, service-worker restarts, external GitHub changes, and transient browser failures.
- Existing GitHub rate-limit pause behavior remains authoritative; the fast path does not bypass a live rate-limit pause.

## Files

- `turn-observer.js`: local generation lifecycle detector.
- `background.js`: `TURN_FINISHED` reconciliation and cache-bypass path.
- `manifest.json`: loads the observer with the existing content script.
- `tests/turn-completion.test.mjs`: source-level regression coverage.

## E2E acceptance

1. Reload unpacked v0.3.0.
2. Start a normal Rerun watcher on a safe test repository.
3. Let ChatGPT complete a turn that publishes a newer `continue` control generation.
4. Verify the next Rerun prompt starts immediately after the completed turn, rather than waiting for the configured GitHub poll interval.
5. Verify an unchanged control does not cause a duplicate immediate send.
6. Verify `complete`, `needs_user`, and `blocked` do not dispatch.
7. Verify a pending GitHub approval card does not emit turn completion until the user resolves it manually.
8. Verify disabling/removing the observer still leaves normal polling recovery behavior intact.

## Validation in this change

- `node --check background.js`: PASS on the authored v0.3 source.
- `node --check turn-observer.js`: PASS.
- focused event-runtime tests: PASS 3/3 locally.
- Full existing repository test suite: requires an exact checkout/runtime and remains an E2E/release gate.
