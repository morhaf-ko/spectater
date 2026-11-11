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

Accept a request when its `Host` is `127.0.0.1`, `localhost` or `[::1]`, with any port or none, or the host of the active public URL. When `Origin` is present it must equal `http://` plus the request's own loopback `Host`, or the active public origin. Browser mutations keep requiring a matching `Origin`.

DNS rebinding works by making a browser send requests with the attacker's hostname in `Host`; a page cannot make the browser send a loopback name for a non-loopback origin, so accepting loopback names on any port keeps that protection. A cross-origin page on another loopback port fails the origin check and lacks the capability. Wildcards and an allow-all option are not offered.

### Browser opening

Order: `$BROWSER`, then `open` on macOS or `xdg-open` on Linux. `$BROWSER` is a colon-separated list of entries; each entry is split on whitespace into a command and arguments, run without a shell, with `%s` replaced by the URL or the URL appended. A helper is started detached and not awaited, because a browser started directly (`BROWSER=firefox`) runs until the reviewer closes it; it counts as failed only when it cannot start or exits non-zero within 1.5 seconds, and the next entry is tried. In a remote session the platform opener is skipped: `open` reports `opened: false` without writing an opener error unless a `$BROWSER` helper failed.

### Remote detection

A session is remote when `SSH_CONNECTION` or `SSH_TTY` is set, when a codespace is detected, or on Linux without `DISPLAY` and `WAYLAND_DISPLAY`. The headless rule catches multiplexer panes on Linux servers. WSL (`WSL_DISTRO_NAME`) is local without SSH variables, because Windows browsers reach WSL2 loopback directly. `SPECTATER_REMOTE` set to `1`/`true` or `0`/`false` overrides detection for the cases it misses or misjudges: a macOS host or a Linux desktop reached over SSH from a tmux session that lost the SSH variables or kept `DISPLAY`. Other values are an error. Detection chooses the default port, adds `access` and stops the platform opener, which would open on the wrong machine; it never widens what the server accepts.

### Port selection

`port` in the config file or `SPECTATER_PORT` (the variable wins) names the preferred port. Without either, a remote session prefers 47420 and a local session keeps a random port. A preferred port that is busy falls back to the next free port in the following nine; if all ten are busy, `open` fails with an error naming the range. The record and output always report the port actually used.

Fallback keeps concurrent reviews working without a shared multi-review server. The cost is that a second simultaneous review needs its own forward; `access` says so with the exact command.

### Access result

`open` adds `access` when the session is remote or a public URL applies:

```json
{ "access": { "mode": "tunnel", "port": 47420, "command": "ssh -N -L 47420:127.0.0.1:47420 forge" } }
{ "access": { "mode": "forward", "port": 47420 } }
{ "access": { "mode": "public", "port": 47420 } }
```

`command` uses the short hostname; `next_step` tells the agent to give the reviewer the command and the URL, noting that the host may need the reviewer's own SSH name for it. Inside a container or pod (`/.dockerenv`, `/run/.containerenv` or `KUBERNETES_SERVICE_HOST`) without SSH variables an SSH command to the container's hostname cannot work, so the mode is `forward` with no command and `next_step` asks the reviewer to forward the port through their editor, `kubectl port-forward` or host networking; `docker run -p` cannot reach a server bound to the container's loopback. Whenever `access` is present, `next_step` keeps the URL and access instructions even if a `$BROWSER` helper reported success, since a helper such as `w3m` can run on this machine instead of the reviewer's. Statuses and exit codes are unchanged.

### Public URL

`publicUrl` is an absolute `http` or `https` origin with no credentials, path, query or fragment; host case and an explicit default port are normalized. It requires `port`, the local port its proxy targets, and applies only when the server bound that port. `SPECTATER_PORT` can move the server but never the proxy, so a different port keeps loopback access. After a fallback the review uses loopback access and `access` gives the tunnel command. Proxies that serve under a path prefix (code-server `/absproxy/<port>/`, path-based Coder apps) are not supported, because the reader routes by its own path; subdomain proxies (Tailscale Serve, Gitpod, Coder subdomain apps, Cloudflare Tunnel) are. In a codespace (`CODESPACES=true` with `CODESPACE_NAME` and `GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`) and without `publicUrl`, the public URL is `https://<CODESPACE_NAME>-<port>.<domain>` for the port in use.

The server record keeps the loopback URL for agent requests and stores the public URL separately; `open`, the only command that prints a review URL, prints the public URL when one applies. SpecTater never runs `tailscale serve`; README documents the one-time command.

## Risks

- Proxy behaviour is unverified: whether `tailscale serve` and Codespaces pass the original `Host` and stream the `/events` response unbuffered. Origin acceptance covers a proxy that rewrites `Host` to loopback; streaming is checked by a smoke test before release.
- A public URL lets anyone who reaches the proxy and holds the review URL read and comment, as with loopback today. SECURITY.md states this and recommends tailnet-only or private forwarding.
- Detection misclassifies some sessions, such as a Linux desktop session without `DISPLAY` or a macOS host in tmux over SSH. The effect is a port, hint or opener choice, never exposure, and `SPECTATER_REMOTE` corrects it.
