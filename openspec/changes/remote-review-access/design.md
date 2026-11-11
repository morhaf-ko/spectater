# Design

## Context

The server binds `127.0.0.1` on a random port (`server.listen(0, '127.0.0.1')`) and refuses any `Host` other than `127.0.0.1:<port>` and any `Origin` other than `http://127.0.0.1:<port>`. The review capability travels in the URL fragment, which browsers, SSH tunnels and HTTP proxies never send to the server; the client sends it as a bearer token and fetches with relative paths. Agent commands reach the server through the loopback URL in the private server record.

Measured against a running server: `Host: 127.0.0.1:<port>` returns 200, `Host: localhost:<port>` returns 403, and `Host: 127.0.0.1:<other port>` returns 403.

Remote setups seen in practice:

| Setup                                              | What the browser sends                     | Today                        |
| -------------------------------------------------- | ------------------------------------------ | ---------------------------- |
| `ssh -L P:127.0.0.1:P`, same port, `127.0.0.1` URL | `127.0.0.1:P`                              | Works, new tunnel per review |
| `ssh -L Q:127.0.0.1:P` or `localhost` URL          | `localhost:Q` / `127.0.0.1:Q`              | 403                          |
| VS Code Remote / devcontainer forwarding           | `localhost:Q`, Q may differ from P         | 403, and `$BROWSER` unused   |
| `tailscale serve --https=P http://127.0.0.1:P`     | the tailnet name                           | 403                          |
| Codespaces forwarded port                          | `<codespace>-P.<forwarding domain>` origin | 403                          |

Session environment is an unreliable remote signal on its own: panes in terminal multiplexers such as tmux or Herdr run under a detached server and lack `SSH_CONNECTION` and `SSH_TTY` even when the user is connected over SSH.

## Goals and non-goals

Goals: forwarded and proxied URLs work without disabling DNS-rebinding protection; one forwarding setup covers successive reviews; the agent gets exact access instructions instead of improvising them.

Non-goals: binding non-loopback interfaces, starting tunnels or proxies, changing Tailscale or SSH configuration, hosted relays, Windows.

## Decisions

### Host and origin acceptance

Accept a request when its `Host` is `127.0.0.1:<any port>`, `localhost:<any port>` or the host of the active public URL. When `Origin` is present it must equal `http://` plus the request's own loopback `Host`, or the active public origin. Browser mutations keep requiring a matching `Origin`.

DNS rebinding works by making a browser send requests with the attacker's hostname in `Host`; a page cannot make the browser send a loopback name for a non-loopback origin, so accepting loopback names on any port keeps that protection. A cross-origin page on another loopback port fails the origin check and lacks the capability. Wildcards and an allow-all option are not offered.

### Browser opening

Order: `$BROWSER`, then `open` on macOS or `xdg-open` on Linux. `$BROWSER` is a colon-separated list of executables, each run without a shell with the URL as its only argument, stopping at the first that exits 0. On Linux with no `DISPLAY`, `WAYLAND_DISPLAY` or `$BROWSER`, no opener runs and `open` reports `opened: false` without writing an opener error.

### Remote detection

A session is remote when `SSH_CONNECTION` or `SSH_TTY` is set, when a codespace is detected, or on Linux without `DISPLAY` and `WAYLAND_DISPLAY`. The headless rule catches multiplexer panes. Detection only chooses the default port and adds `access`; it never widens what the server accepts.

### Port selection

`port` in the config file or `SPECTATER_PORT` (the variable wins) names the preferred port. Without either, a remote session prefers 47420 and a local session keeps a random port. A preferred port that is busy falls back to the next free port in the following nine; if all ten are busy, `open` fails with an error naming the range. The record and output always report the port actually used.

Fallback keeps concurrent reviews working without a shared multi-review server. The cost is that a second simultaneous review needs its own forward; `access` says so with the exact command.

### Access result

`open` adds `access` when the session is remote or a public URL applies:

```json
{ "access": { "mode": "tunnel", "port": 47420, "command": "ssh -N -L 47420:127.0.0.1:47420 forge" } }
{ "access": { "mode": "public", "port": 47420 } }
```

`command` uses the short hostname; `next_step` tells the agent to give the reviewer the command and the URL, noting that the host may need the reviewer's own SSH name for it. Statuses and exit codes are unchanged.

### Public URL

`publicUrl` is an absolute `http` or `https` origin with no credentials, path, query or fragment, and requires `port` (or `SPECTATER_PORT`). It applies only when the server obtained that port; after a fallback the review uses loopback access and `access` explains why. In a codespace (`CODESPACES=true` with `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`) and without `publicUrl`, the public URL is `https://<CODESPACE_NAME>-<port>.<domain>` for the port in use.

The server record keeps the loopback URL for agent requests and stores the public URL separately; every review URL SpecTater prints (`open`, `status`, the listing) uses the public URL when one applies. SpecTater never runs `tailscale serve`; README documents the one-time command.

## Risks

- Proxy behaviour is unverified: whether `tailscale serve` and Codespaces pass the original `Host` and stream the `/events` response unbuffered. Origin acceptance covers a proxy that rewrites `Host` to loopback; streaming is checked by a smoke test before release.
- A public URL lets anyone who reaches the proxy and holds the review URL read and comment, as with loopback today. SECURITY.md states this and recommends tailnet-only or private forwarding.
- Headless detection misclassifies a Linux desktop session that lacks `DISPLAY` in its environment; the effect is a stable port and an extra `access` hint, not exposure.
