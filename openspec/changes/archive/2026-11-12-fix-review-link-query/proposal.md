# Proposal

## Why

The server returns 404 `Unknown route.` for every request with a query string before routing, so a review link that a chat or tracker rewrote with `?utm_source=…` no longer opens the reader (issue #36). The reader shell carries no review data and the capability sits in the URL fragment, so the query string on that GET means nothing to the server.

## What changes

- A GET of the review route is served whatever query string it carries.
- Asset, review data, agent and write routes keep returning 404 for any query string.

## Capabilities

### Modified capabilities

- `change-reading`: Bounded local access serves the reader shell for a review route GET with a query string.

## Impact

`src/server.js`, `test/core.test.js` and README. No CLI, status, exit code or stored state changes; not breaking.
