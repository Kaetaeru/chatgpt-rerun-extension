# ChatGPT Rerun V2

Rerun V2 is a Chrome extension that keeps ChatGPT working toward one repository goal until that goal is complete, needs the user, or conflicts with repository authority.

Current development branch:

```text
agent/v2-goal-runner
```

Current extension version: **2.1.6**.

The previous V1 implementation remains preserved on `agent/mvp-autoresume`.

## Why V2 is different

V2 deliberately removes the V1 behavior that made GitHub Rerun bookkeeping compete with the actual project:

- GitHub control polling is not the normal execution scheduler.
- Target repositories do not need a Rerun-authored `PLAN.md`.
- There is no normal sequence / same-sequence retry cadence.
- Repository-native plans, specs, issues and acceptance criteria remain authoritative over the Rerun Goal.
- Rerun does not repeatedly ask ChatGPT to rediscover HEAD/history just to decide whether another turn should start.
- Assistant prose is not used as the machine control protocol.

## Goal setup

The Side Panel has one primary entry point: **목표 세우기**.

```text
목표 세우기
   ↓
Rerun sends a goal-authoring prompt
   ↓
User's next message describes the desired outcome
   ↓
ChatGPT creates rerun-goal-<nonce>.json
   ↓
Extension resolves, validates and imports it automatically
   ↓
Goal Runner starts
```

The goal JSON contains repository, branch, goal, acceptance criteria and known canonical authority references. It is bound to the active setup request by a random nonce, so an older goal artifact cannot silently replace the new goal.

## Goal loop

After the goal JSON is accepted, Rerun creates one **frozen executor prompt** and reuses that exact prompt for normal iterations.

```text
same executor prompt
  -> ChatGPT works and verifies one useful increment
  -> rerun-result-<goal_id>.json
       CONTINUE   -> immediately run the same prompt again
       COMPLETE   -> stop
       NEEDS_USER -> pause
       CONFLICT   -> pause
```

Iteration count and checkpoint do not rewrite the normal executor prompt.

## JSON result protocol

Every Rerun-owned execution is asked to create a downloadable UTF-8 JSON file named:

```text
rerun-result-<goal_id>.json
```

The file includes a unique `result_id`, one of the four statuses, and a short factual checkpoint.

The extension snapshots matching artifacts before each dispatch and accepts only a new result produced for the active execution. Previously processed result IDs are ignored.

The content script does **not** read assistant-message prose to determine Rerun state.

## Generated JSON artifact resolution

V2.1.6 resolves ChatGPT-generated files through ChatGPT's authenticated file path instead of relying on a readable `sandbox:` URL, DOM-only download attributes, or automatic preview clicks.

The resolver has two cooperating parts:

1. `page-artifact-reader.js` runs in Chrome's `MAIN` world so it can use the logged-in ChatGPT page session.
2. `artifact-reader.js` runs in the extension's isolated world and bridges the resolved JSON into the existing V2 attachment protocol.

For an expected `rerun-goal-<nonce>.json` or `rerun-result-<goal_id>.json`, the MAIN-world resolver:

- reads `/api/auth/session`;
- uses the session access token and, when present, the ChatGPT account ID used by Team workspaces;
- reads the current conversation and finds the message that owns the exact expected filename;
- resolves the generated artifact from its message/sandbox identity, with file-ID download routes as fallback;
- accepts the final content only from ChatGPT/OpenAI generated-file hosts;
- parses at most 1 MiB of JSON.

The isolated reader then exposes the parsed object as a temporary `blob:` URL attached to a hidden synthetic file node. Existing `content.js` consumes that node and continues to perform the normal nonce, goal ID, result ID and schema validation. The artifact reader therefore does not create a second Goal Runner state machine.

If artifact resolution fails, a separate `v2:artifact:<tabId>` diagnostic is stored. The Side Panel surfaces the exact failure as `Artifact reader: ...` instead of silently remaining at `Waiting goal JSON`.

The Side Panel also ensures the MAIN-world resolver, the normal content script and the isolated artifact reader are injected into an already-open ChatGPT tab. Reloading the extension therefore does not require a page refresh just to restore the artifact reader for a pending goal.

## Authority rule

Highest authority first:

1. current explicit user instruction;
2. repository-native instructions, plans/specifications and acceptance criteria;
3. the Rerun Goal Contract;
4. Rerun execution mechanics.

Rerun must not invent a second project plan to resolve a conflict. If the goal and repository authority disagree, the result must be `CONFLICT` and the loop pauses.

## Runtime state

V2 uses tab-scoped `chrome.storage.local` keys:

```text
v2:config:<tabId>
v2:runtime:<tabId>
```

Important runtime data includes:

- run ID / goal ID;
- pending goal-setup nonce;
- frozen executor prompt;
- iteration count;
- last checkpoint / last result ID;
- approval wait state;
- fresh-chat handoff state.

Artifact-reader diagnostics use a separate `v2:artifact:<tabId>` key and do not authorize runtime state transitions.

Normal cadence does not require repository-side Rerun `control.json`.

## Tab isolation

Each ChatGPT tab owns an independent V2 config/runtime record keyed by its Chrome tab ID.

The Side Panel does not keep a long-lived cached tab ID. On every refresh and every Goal/Resume/Pause/Stop action it resolves the **currently active ChatGPT tab** again, then reads or mutates only that tab's state.

This prevents a Side Panel opened while tab A was active from later sending a new goal nonce or control action to tab A after the user has switched to tab B.

## GitHub approvals

The V2 MVP currently lets ChatGPT use its connected GitHub app for repository work.

Rerun may detect a visible GitHub action-confirmation card so it can pause its own loop and show `Waiting approval`, but it **does not click or synthetically approve** the card. After manual approval, the same execution can continue.

HTML/DOM manipulation cannot grant the underlying permission. A future Direct GitHub transport can use credentials explicitly granted to Rerun, but that is a separate authentication path, not an approval bypass.

## 20 / 23 minute behavior

The executor contract tells ChatGPT to finish/checkpoint within the normal 20-minute execution budget.

If a Rerun-owned generation remains active for 23 active minutes, the watchdog clicks ChatGPT Stop once and treats the turn as interrupted. GitHub approval waiting time is excluded from the watchdog budget.

## New conversation handoff

If the current conversation loses its composer, Rerun opens one fresh ChatGPT tab and transfers Goal Runner ownership once.

The current implementation transfers the Goal Contract and frozen executor prompt. A later V2 milestone will inject the latest checkpoint once as a Resume Capsule on fresh-chat handoff so a new conversation can avoid unnecessary repository rediscovery without changing normal same-prompt iterations.

## Side Panel

The panel shows:

- **목표 세우기**;
- repository / branch loaded from goal JSON;
- goal / acceptance / canonical authority;
- status / iteration / run ID / goal ID;
- approval wait;
- last result / checkpoint;
- artifact-reader failures when present;
- Resume / Pause / Stop.

There is no normal manual Goal form in V2.1.

## Validation

Local validation commands:

```bash
npm run check
npm test
```

`npm test` runs only `tests/v2-*.test.mjs` on the V2 branch.

The V2 source tests cover:

- goal-setup nonce binding;
- goal JSON schema validation;
- frozen executor prompt identity across iterations;
- result JSON validation;
- no assistant-prose control parsing;
- new-result baseline/seen filtering;
- authenticated MAIN-world artifact resolution and Team account context;
- conversation/sandbox resolution plus file-ID fallback routes;
- blob handoff into the existing content protocol;
- artifact-reader reinjection for already-open ChatGPT tabs;
- visible artifact diagnostics;
- immediate `CONTINUE -> ready` transition;
- active-tab Side Panel isolation;
- manual Stop -> pause;
- GitHub approval wait without auto-click;
- missing-composer fresh-chat handoff.

Browser E2E is still required because ChatGPT's internal authenticated file endpoints are service implementation details and may evolve.

## Browser test

1. Check out `agent/v2-goal-runner` locally.
2. Open `chrome://extensions` and Reload the unpacked extension.
3. Open the Rerun V2 Side Panel on the target ChatGPT tab. An already-open pending tab should have the artifact readers restored automatically.
4. Open two ChatGPT tabs A and B. In A click **목표 세우기**, then switch to B and click **목표 세우기** again. Confirm each tab receives a different nonce and the Side Panel follows the active tab's independent state.
5. When ChatGPT asks for the next goal, describe the desired repository outcome normally.
6. Confirm ChatGPT creates `rerun-goal-<nonce>.json` and the Side Panel changes from `Waiting goal JSON` to `Running` automatically in the correct tab only.
7. If it does not, record the exact `Artifact reader: ...` diagnostic shown in the Side Panel.
8. Confirm the first executor turn creates `rerun-result-<goal_id>.json`.
9. For `CONTINUE`, confirm the exact frozen executor prompt is submitted again without GitHub polling delay.
10. Verify COMPLETE / NEEDS_USER / CONFLICT pause or stop correctly.

See `docs/V2_GOAL_RUNNER_SPEC.md` for the full protocol.
