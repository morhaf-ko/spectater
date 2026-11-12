# Proposal

## Why

When the reviewer's browser is on another machine and `open` prints a tailnet or `publicUrl` link (`access.mode: public`), Tailscale ACLs or a firewall the server cannot see can still block that link. A Mac whose Tailscale grants allowed only `tcp:22` to the host hung on `https://forge.<tailnet>.ts.net:47420/review/…`, and the result offered no other way in, although the SSH tunnel that `tunnel` mode prints would have worked.

## What changes

- In a remote session where an SSH tunnel to this host can work, a `public` access object also carries `command`, the same SSH tunnel command as `tunnel` mode, and `localUrl`, the loopback review URL to open once the tunnel runs. `mode` stays `public`; the fields are additive.
- Local sessions, containers without SSH and codespaces keep the plain `public` object.
- The `open` next step, the `workflow` text, the skill and README tell agents to give the reviewer the URL plus the tunnel command and local URL as a fallback.
- SpecTater does not probe reachability, start tunnels or change Tailscale or proxy behaviour.

## Capabilities

### Modified capabilities

- `workflow-handoff`: the remote access result gives a tunnel fallback alongside a public URL.

## Impact

`src/access.js`, `bin/spectater.js`, `skills/spectater/SKILL.md`, README and their tests. No status, exit code or stored state changes; existing `access` fields keep their meaning.
