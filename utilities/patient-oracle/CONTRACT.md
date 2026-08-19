# Patient Oracle Contract v1

This contract is authoritative for the browser worker and for every ChatGPT turn dispatched by Patient Oracle.

## 1. Source of truth

GitHub is the only durable request/response state.

- `.patient-oracle/runtime.json`: machine dispatch state and current request identity.
- `.patient-oracle/requests/<request_id>.json`: immutable caller request payload.
- `.patient-oracle/responses/<request_id>.json`: durable answer or durable failure result.

The ChatGPT conversation body is ephemeral and is never used as durable response storage.

## 2. Runtime states

Allowed runtime states:

- `ready`: a request may be dispatched or resumed.
- `complete`: the response artifact exists and this request is finished.
- `needs_user`: a human decision or manual approval is required.
- `blocked`: safe automatic progress is not possible.

`running` or `working` are intentionally not durable GitHub states. Local Chrome state tracks execution-in-progress.

## 3. Runtime identity

`runtime.json` contains exactly:

- `version`
- `run_id`
- `revision`
- `status`
- `request_id`
- `reason`
- `updated_at`

Rules:

1. `revision` never decreases.
2. Every durable handoff increments `revision`.
3. `ready` requires a valid `request_id`.
4. A response terminal transition keeps the same `request_id`.
5. Unknown fields are rejected.

## 4. Request identity

A request contains exactly:

- `version`
- `request_id`
- `prompt`
- `created_at`
- optional `response_format`
- optional `metadata`

The browser worker never mutates a request after accepting its identity. A changed payload under the same request ID is unsafe and must not be silently treated as the old request.

## 5. Response identity

A successful response contains exactly:

- `version`
- `request_id`
- `status: complete`
- `answer`
- `completed_at`
- optional `metadata`

A non-success response may use `needs_user` or `blocked` and must include a concise `reason` instead of inventing an answer.

## 6. Authoritative write order

For a completed request:

1. write `.patient-oracle/responses/<request_id>.json`;
2. verify the write succeeded;
3. write `runtime.json` last with a higher revision and `status=complete`.

For a resumable 20-minute checkpoint:

1. write durable progress needed by the next fresh conversation, if any;
2. update any response-side checkpoint artifact defined by the request protocol;
3. write `runtime.json` last with a higher revision and `status=ready` for the same request.

The runtime is always the final authoritative handoff write.

## 7. Mandatory read order for every ChatGPT worker turn

1. this `CONTRACT.md` when installed in the target repository;
2. `runtime.json`;
3. current request JSON;
4. existing response/checkpoint for the same request if present;
5. repository-specific instructions needed to answer the question.

If GitHub state conflicts with the dispatch prompt, GitHub wins.

## 8. 20-minute execution law

Every dispatched ChatGPT worker turn has a hard lifetime of less than 20 minutes.

1. Dispatch includes an execution start timestamp and hard-stop timestamp.
2. Around minute 18, begin no new long operation.
3. From the 18-minute checkpoint onward, prioritize durable state and exact continuation instructions.
4. If the answer is incomplete, do not publish `complete`.
5. Re-authorize the same request through a higher `ready` revision and end before the hard stop.
6. The next turn receives a fresh 20-minute budget and resumes only from durable GitHub state.

## 9. Browser safety invariants

The implementation must preserve all inherited Rerun safeguards:

- one active owner per GitHub stream;
- no dispatch on a regressed revision;
- no duplicate dispatch of an already-dispatched revision;
- execution token matching for completion events;
- bounded same-request redispatch circuit breaker;
- no overwrite of a non-empty user composer;
- prompt insertion must synchronize with ChatGPT composer state;
- Send button fallback to Enter is allowed;
- dispatch ACK requires visible submission evidence;
- pending GitHub approval UI suppresses completion and retry;
- approval/OAuth/admin buttons are never auto-clicked;
- GitHub 403/429 rate limits pause and later resume polling;
- conditional GitHub reads should use ETag when possible;
- DOM completion is only a wake signal; GitHub is reconciled before another dispatch;
- polling remains a recovery path after missed DOM events or service-worker restarts;
- changing repository coordinates while active stops the worker before it can operate on the new stream;
- Patient Oracle may not run in the same worker tab simultaneously with Single Rerun or Voyage Team.

## 10. Terminal behavior

`complete`, `needs_user`, and `blocked` never auto-dispatch another ChatGPT turn for the same runtime revision.

The Chrome watcher may remain enabled and continue safe GitHub polling. A later higher `ready` revision is a new authorization.

## 11. No response scraping

Patient Oracle never extracts the final answer from assistant DOM text. The answer must be written through the ChatGPT GitHub capability to the declared response path. Browser code may inspect only UI/lifecycle signals required for safe scheduling and approval waiting.