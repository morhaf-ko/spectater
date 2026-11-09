# Proposal

## Why

OpenSpec Markdown is easy for an agent to revise, but reviewing it in a conversation makes selected-text feedback hard to locate after edits. SpecTater would provide a local reading and commenting loop that returns revision-bound feedback to the conversation already doing the work.

## What changes

- Open one explicitly selected change using native OpenSpec root, schema, artifact-path and status discovery.
- Render canonical Markdown deterministically, with a source view and comments tied to document bytes and selected text.
- Persist local review state outside canonical artifacts; retain stale and orphaned feedback after revisions.
- Submit an immutable feedback batch that the operator can copy or the existing agent can read through a CLI. Submission never authorizes implementation, merge or deployment.
- Offer an on-demand workflow instruction to open the exact change after drafting. Manual invocation remains available; OpenSpec configuration is not an executable completion hook.
- Deliver the full review loop with bounded batch waiting, active-process refresh, browser notifications and a thin on-demand skill; preserve the existing conversation and one-writer boundary.

## Capabilities

### New capabilities

- `change-reading`: Native change discovery, deterministic reading and bounded local serving.
- `review-feedback`: Revision-bound selected-text comments, durable batches and conservative revision handling.
- `workflow-handoff`: Exact-change browser opening and explicit feedback retrieval by an existing conversation.

### Modified capabilities

None; the repository has no existing capability specifications.

## Impact

This change delivers a local Bun CLI/browser package, private review state, a bounded existing-agent handoff and an optional first-party skill entrypoint. Runtime, storage and transport contracts are in design.md. Registry publication, releases and implicit global agent setup are outside this change.

The initial scope excludes hosted services, accounts, embedded models, browser source editing, agent/session control, global hooks, background repository scanning and automatic approval. Native OpenSpec remains the discovery/status authority; Markdown remains the content authority.
