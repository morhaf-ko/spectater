# Design

## Agent loop

```sh
spectater open add-dark-mode          # starts or reuses the server, prints the URL, exits
spectater wait add-dark-mode          # blocks; prints one JSON result
spectater reply add-dark-mode --status working
# revise Markdown, run openspec validate
spectater reply add-dark-mode --message-file result.md
spectater wait add-dark-mode          # repeat until status is "ended"
```

`--project` defaults to the current directory and `--store` stays optional. Every command resolves the same review identity (canonical OpenSpec root plus change root) through native discovery, so the agent never handles an id.

`wait` result, always one JSON object on stdout:

| `status`          | Meaning                              | `next_step`                                            | Exit code |
| ----------------- | ------------------------------------ | ------------------------------------------------------ | --------- |
| `batch`           | Feedback delivered; `batch` holds it | Reply `working`, revise, reply with result, wait again | 0         |
| `timeout`         | Nothing arrived within `--timeout`   | Run `wait` again                                       | 0         |
| `ended`           | The reviewer ended the review        | Stop waiting; do not reopen unless asked               | 0         |
| `stopped`         | The server stopped                   | Ask before running `open` again                        | 3         |
| `listener_active` | Another `wait` holds the review      | Use `--takeover` only if that listener is gone         | 4         |

`listener_replaced` (exit 5) is returned to a listener displaced by `--takeover`. The default `--timeout` is 540 seconds, below the 10-minute ceiling of agent shell tools; the maximum is one hour. Errors print `{"status":"error","error":"..."}` and exit 1. `--format markdown` remains for humans.

## Server-tracked delivery

`wait` delivers the oldest deliverable batch the agent has not replied to. Delivery claims the batch and records receipt in one durable write, so a repeated `wait` after a crash returns the same batch until the agent replies. `reply` without `--batch` targets that batch. The `--after` cursor, per-batch live claims and the offline state-file fallbacks are removed. `feedback <change> --batch <n>` reads any batch from saved state without recording delivery.

A wait response sends its headers immediately and a space every 15 seconds until the JSON result, so idle-connection timeouts in either runtime never cut a long wait. JSON parsers ignore the leading whitespace.

## Detached server

`open` spawns `spectater serve <change>` detached with output to `<state>/<reviewId>.log`, waits for its server record, and exits. The server writes `<state>/<reviewId>.server.json` (mode 0600) with PID, URL, change and root. CLI commands call `POST /agent/<operation>` on that URL with the URL's capability token, the same token the browser uses. One process still owns one review and its writer lock. A writer lock or server record whose PID no longer exists is reclaimed, so a crashed server does not block the next open.

Commands find a running server by change name and project root without native discovery; with `--store`, or when no server matches, native discovery derives the identity.

The server exits after 30 minutes with no browser stream and no listener (`SPECTATER_IDLE_TIMEOUT`, `0` disables), and on `spectater stop`. A stale server file whose PID is gone is replaced.

## Runtime

Shebang `#!/usr/bin/env node`, `engines.node >=22.12` (OpenSpec's own floor). The code uses only `node:` modules. Contract and browser tests stay on Bun; the package test installs the tarball with npm and runs it under Node, the smoke test runs under Node, and CI uses Node 22.

## Distribution and hooks

`skills/spectater/SKILL.md` is a short stub that tells the agent to run `npx -y spectater workflow`. `spectater setup hooks` writes a SessionStart hook for Claude Code (`~/.claude/settings.json`) and Codex (`~/.codex/hooks.json`, plus `features.hooks = true` in `config.toml`), an OpenCode plugin (`~/.config/opencode/plugins/spectater.js`) and a Copilot CLI hook (`~/.copilot/hooks/spectater.json`, whose command prints `additionalContext` JSON). Each runs `spectater status --hook`, which prints open reviews for the current project and nothing otherwise. Setup is idempotent, keeps unrelated hooks, refuses to replace an unmanaged OpenCode plugin, reports each agent separately, and `--remove` undoes it. No hook blocks, wakes or drives the agent.

## Code structure

- `bin/spectater.js`: argument parsing and a table of command handlers.
- `src/agent.js`: server records, change-name lookup, detached start and the agent HTTP client.
- `src/hooks.js`: hook setup and removal.
- `src/review.js`: `mutate` is a table of action handlers; `deliver` replaces per-batch claims.
- `src/control.js` (Unix socket) is removed; agent routes join `src/server.js`.
- The unreachable Windows path in `stateDirectory()` is removed.

## Rejected

- One shared server for all reviews on a fixed port: needs cross-review routing and a second lock model for little gain.
- Stop hooks that keep the agent polling: invasive and different in every agent.
- Unbounded `wait`: agent shell tools kill commands after 2–10 minutes, which looks like a failure rather than a timeout.
