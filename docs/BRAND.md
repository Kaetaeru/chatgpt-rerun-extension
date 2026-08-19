# Brand: The Voyage of Theseus

## Product name

**The Voyage of Theseus**

Tagline:

> **Minds change. The voyage continues.**

## Meaning

The name is derived from the Ship of Theseus thought experiment.

The product deliberately separates the identity of a project from the identity of any single AI conversation. ChatGPT conversations may be replaced repeatedly, but the same project can continue because its durable identity lives in GitHub: goals, plans, tasks, decisions, commits, tests, review evidence, and runtime state.

A conversation is a temporary crew member. The voyage is the durable project.

## Product language

Preferred terms:

- **Voyage** — one durable project run toward a user goal.
- **Goal** — the destination of the voyage.
- **Agent** — a logical role such as Planner or Programmer.
- **Worker** — a physical ChatGPT browser execution context.
- **Handoff** — a durable transfer of work through GitHub state.
- **Voyage Team** — multi-agent mode.
- **Single watcher** — the original single-agent continuation mode.

Avoid positioning the product as "multiple AIs chatting with each other." The intended model is:

> One durable project, many replaceable minds.

## Engineering compatibility

Public branding changed from **ChatGPT Rerun** to **The Voyage of Theseus** in v0.4 before browser E2E release validation.

The existing `.chatgpt-rerun` protocol namespace and internal `RERUN_*` wire identifiers remain temporarily unchanged. They are compatibility identifiers, not public brand language. Renaming them is a protocol migration and should be versioned independently after the v0.4 runtime is validated.

## Writing language

GitHub-facing product documentation, pull-request descriptions, commit messages, protocol specifications, and new code comments should be written in English.
