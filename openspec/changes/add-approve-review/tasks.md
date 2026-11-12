# Tasks

## 1. Approve on the server

- [x] 1.1 Add failing tests: an `approve` action ends the review with `approved`, is refused with pending comments or outstanding submissions, a waiting agent receives `approved` (after any claimed batch), and resume clears it; verify with `bun run test`.
- [x] 1.2 Implement `approve` in `src/review.js`, validate `approved` in `src/storage.js`, return `approved` from `wait` in `src/server.js`; verify with `bun run test`.

## 2. Agent guidance

- [x] 2.1 Add the `approved` next step and workflow text in `bin/spectater.js`, the skill bullet in `skills/spectater/SKILL.md` and the status row in README; verify with `bun run test`.

## 3. Reader

- [x] 3.1 Update the Playwright tests: Approve with nothing pending, the End without approving link only then, Send & End unchanged, Resume after approval; not runnable on this host (no Chrome, missing libatk); CI runs them.
- [x] 3.2 Implement Approve and the secondary link in `web/index.html`, `web/app.js` and `web/style.css`, and update README's reader section; verify with `bun run check` locally (browser tests in CI).
