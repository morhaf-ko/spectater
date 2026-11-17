# Tasks

## 1. Refresh and reply on an ended review

- [x] 1.1 Add a contract test that, after a delivered batch and an end, agent `refresh` and `reply` show revised source, keep `endedAt`, and the next wait returns ended; verify it fails with "Review ended. Resume explicitly to refresh source." before the fix (`bun test test/agent-loop.test.js`).
- [x] 1.2 Drop the ended guard from `refresh` in `src/review.js` and re-read the change before every reply in `src/server.js`; update the completion test that expected refresh to fail; verify with `bun test test/agent-loop.test.js test/completion.test.js`.

## 2. Gate

- [x] 2.1 `bun run check` passes.
