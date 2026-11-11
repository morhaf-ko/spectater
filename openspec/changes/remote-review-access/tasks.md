# Tasks

## 1. Host and origin acceptance

- [x] 1.1 Accept `127.0.0.1` and `localhost` hosts on any port and the active public host in `src/server.js`; require `Origin` to equal the request's own loopback origin or the public origin; verify forwarded, rebound and cross-origin cases with `bun run test`.

## 2. Browser opening

- [x] 2.1 Try `$BROWSER` executables in order, without a shell, before `open`/`xdg-open`, and skip opening on Linux without `DISPLAY`, `WAYLAND_DISPLAY` or `$BROWSER`; verify with injected environments in `bun run test`.

## 3. Ports and remote detection

- [x] 3.1 Add `port` and `publicUrl` to `src/config.js` with validation, and read `SPECTATER_PORT`; verify valid, invalid and missing-port cases with `bun run test`.
- [x] 3.2 Detect remote sessions (SSH variables, codespace, headless Linux) and bind the preferred or default port with a ten-port fallback, failing with the range when all are busy; verify with `bun run test`.
- [x] 3.3 Store the public URL beside the loopback URL in the server record, use it for every printed review URL, derive it in a codespace, and keep agent requests on loopback; verify with `bun run test`.
- [x] 3.4 Honour `SPECTATER_REMOTE` (1/true, 0/false, error otherwise) over detection, and skip the platform opener in remote sessions; verify both overrides and the opener with `bun run test`.

## 4. Agent output

- [x] 4.1 Add the `access` object and its `next_step` wording to `open`, and update the skill to hand the reviewer the command with the URL; verify tunnel, public, fallback and local results with `bun run test`.

## 5. Documentation and verification

- [x] 5.1 Document remote access (SSH `LocalForward`, VS Code, `tailscale serve --bg --https=47420 http://127.0.0.1:47420`, codespaces), the new settings, `SPECTATER_PORT` and the `access` field in README, and the accepted hosts and public URL exposure in SECURITY.md.
- [x] 5.2 Smoke a review through an SSH forward with a remapped local port and through `tailscale serve`, confirming the reader loads, live updates stream and feedback submits; record the outcome in the pull request.
- [ ] 5.3 Run `bun run check`.
