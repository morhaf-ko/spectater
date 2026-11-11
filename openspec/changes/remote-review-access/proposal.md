# Proposal

## Why

Agents often run on a machine other than the one with the reviewer's browser: an SSH host, a devcontainer, a codespace or a server reached over Tailscale. SpecTater works there only by accident. Each review server takes a random port, so a reviewer needs a new `ssh -L` for every review. The server accepts only `Host: 127.0.0.1:<its own port>`, so VS Code's forwarded `localhost` links and remapped local ports are refused with 403. `$BROWSER`, which VS Code Remote, devcontainers and Codespaces set to open URLs on the reviewer's machine, is ignored. On a headless host `open` runs a missing `xdg-open` and leaves the agent to invent tunnel instructions.

## What changes

- The server accepts `localhost` and `127.0.0.1` on any port, with `Origin` matching the request's own host, so forwarded and remapped loopback URLs work. It still binds `127.0.0.1` only and every data request still needs the review capability.
- `open` tries `$BROWSER` before the platform opener, and skips opening on Linux without a display or `$BROWSER` instead of failing.
- A `port` setting and `SPECTATER_PORT` choose a stable port. When the session looks remote and no port is set, the server prefers a documented default port, falling back to the next free port in a small range.
- When the session looks remote, `open` adds an `access` object to its JSON with the exact SSH tunnel command for the port in use.
- An opt-in `publicUrl` setting names the address a reverse proxy the reviewer runs (for example `tailscale serve`) exposes for the configured port. The server accepts exactly that host and origin and prints review links on it. In a codespace the public URL is derived from the codespace's environment.
- Not included: binding non-loopback interfaces, running or configuring a proxy or tunnel, hosted relays and disabling the host check.

## Capabilities

### Modified capabilities

- `change-reading`: "Bounded local access" accepts forwarded loopback hosts and a configured public origin; "Optional reader preferences" adds `port` and `publicUrl`.
- `workflow-handoff`: "Exact-change opening" honours `$BROWSER` and skips headless opening; new "Stable review port", "Remote access result" and "Public review URL" cover remote detection, the port, the `access` result and public links.

## Impact

`src/server.js`, `src/config.js`, `src/agent.js`, `bin/spectater.js`, the skill, README, SECURITY.md and the contract tests. `open` gains an optional `access` field; statuses and exit codes are unchanged. Stored review state is unchanged.
