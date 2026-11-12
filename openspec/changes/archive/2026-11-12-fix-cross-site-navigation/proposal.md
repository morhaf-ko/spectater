# Proposal

## Why

The server refuses every request marked `Sec-Fetch-Site: cross-site` before routing, so a review link opened from another site, such as a web chat, returns 403 `Cross-site request refused.` (issue #35). The reader page and its assets carry no review data: the capability sits in the URL fragment, which a navigation never sends. Bounded local access only requires rejecting foreign mutation origins and unauthorized requests.

The same report noted that the review server stopped while the review was still open, after two `wait` timeouts and before the reviewer opened the page, so reopening issued a new token and the earlier link died. That is the specified idle shutdown: the server stops after `SPECTATER_IDLE_TIMEOUT` (default 1800 s) with no browser connection and no listener, and the capability is per process. Once the agent stopped running `wait`, nothing kept the server up. The behaviour matches the Detached review server requirement, so this change documents it instead of altering it.

## What changes

- GET requests for the review route and its static assets are served whatever `Sec-Fetch-Site` says. Review data routes, agent routes and every write keep the cross-site, origin and capability checks.
- README and SECURITY.md describe the cross-site rule, and README states that an idle-stopped server's URL stops working and the next `open` prints a new one.

## Capabilities

### Modified capabilities

- `change-reading`: Bounded local access serves the reader shell to cross-site navigations and refuses cross-site data requests.

## Impact

`src/server.js`, `test/core.test.js`, README and SECURITY.md. No CLI, status, exit code or stored state changes; not breaking.
