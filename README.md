# ChatGPT Rerun V2

Rerun V2 is a Chrome extension that keeps ChatGPT working toward one repository goal until that goal is complete, needs the user, or conflicts with repository authority.

Current development branch:

```text
agent/v2-goal-runner
```

Current extension version: **2.1.0**.

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
Extension validates and imports it automatically
   ↓
Goal Runner starts
```

The goal JSON contains repository, branch, goal, acceptance criteria and known canonical authority references. It is bound to the active setup request by a random nonce, so an older goal attachment cannot silently replace the new goal.

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

The extension snapshots matching attachments before each dispatch and accepts only a new result attachment produced after that dispatch. Previously seen attachments are ignored.

The content script does **not** read assistant-message prose to determine Rerun state.

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

Normal cadence does not require repository-side Rerun `control.json`.

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
- Resume / Pause / Stop.

There is no normal manual Goal form in V2.1.

## Validation

Local validation commands:

```bash
npm run check
npm test
```

`npm test` runs only `tests/v2-*.test.mjs` on the V2 branch.

The V2.1 source tests cover:

- goal-setup nonce binding;
- goal JSON schema validation;
- frozen executor prompt identity across iterations;
- result JSON validation;
- no assistant-prose control parsing;
- new-attachment baseline/seen filtering;
- immediate `CONTINUE -> ready` transition;
- manual Stop -> pause;
- GitHub approval wait without auto-click;
- missing-composer fresh-chat handoff.

The implementation snapshot used for V2.1 passed syntax checks and the V2 JSON protocol test suite locally. Browser E2E is still required because ChatGPT's live file-card DOM and attachment URL behavior must be observed directly.

## Browser test

1. Check out `agent/v2-goal-runner` locally.
2. Open `chrome://extensions` and Reload the unpacked extension.
3. Refresh the ChatGPT tab so older V1/V2 content scripts are removed.
4. Open the Rerun V2 Side Panel.
5. Click **목표 세우기**.
6. When ChatGPT asks for the next goal, describe the desired repository outcome normally.
7. Confirm ChatGPT creates `rerun-goal-<nonce>.json` and the Side Panel changes from `Waiting goal JSON` to `Running` automatically.
8. Confirm the first executor turn creates `rerun-result-<goal_id>.json`.
9. For `CONTINUE`, confirm the exact frozen executor prompt is submitted again without GitHub polling delay.
10. Verify COMPLETE / NEEDS_USER / CONFLICT pause or stop correctly.

See `docs/V2_GOAL_RUNNER_SPEC.md` for the full protocol.
