# Proposal

## Why

After the operator sends a final batch with Send & End, the agent revises the change but `spectater refresh` fails with "Review ended. Resume explicitly to refresh source." and `spectater reply` records the reply without re-reading the change (issue #43). The reader keeps the old text, so the reply describes edits the operator cannot see.

## What changes

- `refresh` re-reads the change on an ended review, and `reply` re-reads it before recording the reply, without resuming the review.
- Feedback mutations stay read-only until the operator resumes; refresh and reply never clear the ended or approved state.

## Capabilities

### Modified capabilities

- `workflow-handoff`: A new requirement, Revision after completion, lets the agent show revised source and its reply after the review ended or was approved.

## Impact

`src/review.js`, `src/server.js` and their tests. No CLI, status, exit code or stored state changes; not breaking.
