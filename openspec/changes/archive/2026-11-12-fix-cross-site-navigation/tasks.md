# Tasks

## 1. Cross-site navigation

- [x] 1.1 Add a contract test that a cross-site navigation of the review route and cross-site asset requests return 200 while cross-site `/state`, `/events`, browser writes and agent routes return 403; verify it fails with 403 on the review route before the fix (`bun test test/core.test.js`).
- [x] 1.2 Move the `Sec-Fetch-Site: cross-site` refusal in `src/server.js` after the review route and asset handlers; verify with `bun test test/core.test.js`.

## 2. Idle shutdown investigation

- [x] 2.1 Trace the stop: with no reader page and no `wait` running, the idle timer (`SPECTATER_IDLE_TIMEOUT`, default 1800 s) stops the server and a new `open` issues a new per-process capability; this matches the Detached review server requirement and the existing idle test in `test/agent-loop.test.js`.
- [x] 2.2 Document the cross-site rule in README and SECURITY.md and the idle-stop link behaviour in README.

## 3. Gate

- [x] 3.1 `bun run check` passes.
