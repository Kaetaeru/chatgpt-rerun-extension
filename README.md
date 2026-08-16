# chatgpt-rerun-extension

A small Manifest V3 Chrome extension that watches a GitHub control file and sends a fixed continuation prompt to one ChatGPT tab when the control state says `continue`.

The extension does **not** read or parse ChatGPT answers. GitHub is the source of truth for the workflow state. The content script only checks whether the composer is idle and sends the configured prompt.

## State machine

The control file uses five statuses:

- `working`: do nothing.
- `continue`: send the configured continuation prompt exactly once for this `run_id` + `sequence`.
- `complete`: stop the extension session.
- `needs_user`: stop the extension session because a human decision is required.
- `blocked`: stop the extension session because the workflow cannot proceed safely.

Example:

```json
{
  "version": 1,
  "run_id": "project-alpha-2026-08-16",
  "sequence": 7,
  "status": "continue",
  "reason": "Task 6 passed verification; Task 7 is ready."
}
```

`sequence` must increase whenever a new actionable state is published. A new `run_id` resets the extension checkpoint for a new workflow.

## Intended ChatGPT protocol

Give the ChatGPT workflow a persistent instruction equivalent to this:

1. Use the configured GitHub repository as the source of truth for plan and verification state.
2. When starting work for the current sequence, set the control status to `working` without advancing the sequence.
3. Perform the implementation and verification.
4. If another planned task can run without user input, increment `sequence` and write `status: "continue"`.
5. If all planned work is finished, increment `sequence` and write `status: "complete"`.
6. If a user decision is required, increment `sequence` and write `status: "needs_user"`.
7. If work is blocked by an unrecoverable error, increment `sequence` and write `status: "blocked"`.

The extension's default continuation prompt is simply `진행`. ChatGPT should re-read the repository state before doing any new work, so the prompt itself can stay short.

## Install locally

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked** and select this repository directory.
5. Open the ChatGPT conversation that should be automated.
6. Open the extension popup and configure the GitHub owner, repository, branch, and control-file path.
7. Click **Start on this tab**.

The extension is bound to the ChatGPT tab where Start was clicked. This prevents multiple ChatGPT tabs from sending the same sequence.

## GitHub access

For a public repository, the token can be left empty. In that mode the polling interval is clamped to at least 60 seconds to avoid exhausting the unauthenticated GitHub API rate limit.

For faster polling or a private repository, enter a GitHub token that can read the target repository contents. The token is stored in `chrome.storage.local` on the current Chrome profile. Use the narrowest repository scope possible and do not distribute a packaged extension containing a hard-coded token.

With a token, the minimum polling interval is 5 seconds.

## Safety behavior

The extension stops instead of guessing when:

- GitHub reports `complete`, `needs_user`, or `blocked`.
- the configured maximum number of continuation sends is reached.
- the ChatGPT composer already contains text, so a user draft is never overwritten.
- a claimed continuation cannot be sent reliably.

The extension never retries around ChatGPT or GitHub service limits. It reports the error in the popup and waits for the user.

## Files

- `background.js`: GitHub polling, sequence checkpointing, and session state.
- `content.js`: ChatGPT idle/composer detection and continuation send.
- `popup.*`: configuration and Start/Stop UI.
- `control.js`: shared control schema and validation helpers.
- `examples/control.json`: example control file.
- `tests/control.test.mjs`: schema/helper tests.

## Development

Requires a recent Node.js release for the built-in test runner.

```bash
npm run check
npm test
```
