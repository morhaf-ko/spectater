# Tasks

## 1. Review link with a query string

- [x] 1.1 Add a contract test that a cross-site navigation of the review route with `?utm_source=chat` returns 200 while a POST of the review route, an asset, `/state` and an agent route with a query string return 404; verify it fails with 404 on the review route before the fix (`bun test test/core.test.js`).
- [x] 1.2 Serve the review route before the query-string refusal in `src/server.js`; verify with `bun test test/core.test.js`.
- [x] 1.3 State in README that the review URL still opens with a query string appended.

## 2. Gate

- [x] 2.1 `bun run check` passes.
