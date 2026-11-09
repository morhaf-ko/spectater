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

The default `--timeout` is 540 seconds, below the 10-minute ceiling of agent shell tools. Errors print `{"status":"error","error":"..."}` and exit 1. `--format markdown` remains for humans.

## Server-tracked delivery

The review state already records a claim per batch. `wait` delivers the oldest queued batch whose sequence is above the last claimed one, so a repeated `wait` after a crash returns the same claimed-but-unreplied batch until the agent replies. The `--after` cursor and the offline state-file fallbacks are removed. `feedback <change> --batch <n> --history` keeps archive reads.

## Detached server

`open` spawns `spectater serve <change>` detached, waits for its ready line, and exits. The server writes `<state>/<reviewId>.server.json` (mode 0600) with port, PID and a random agent token. CLI commands call `http://127.0.0.1:<port>/agent/...` with that token. Browser routes keep their own capability token. One process still owns one review and its writer lock.

The server exits after 30 minutes with no browser stream and no listener (`SPECTATER_IDLE_TIMEOUT`, `0` disables), and on `spectater stop`. A stale server file whose PID is gone is replaced.

## Runtime

Shebang `#!/usr/bin/env node`, `engines.node >=22`. The code already uses only `node:` modules. Contract tests stay on `bun test`; CI additionally runs the package test and smoke under Node 22.

## Distribution and hooks

`skills/spectater/SKILL.md` is a short stub that tells the agent to run `npx -y spectater workflow`. `spectater setup hooks` writes one SessionStart entry per detected agent config that runs `spectater status --hook`, which prints open reviews for the current project and nothing otherwise. It is idempotent, reports each agent separately, and `spectater setup hooks --remove` undoes it. No hook blocks, wakes or drives the agent.

## Code structure

- `bin/spectater.js`: argument parsing and a command table only.
- `src/commands/*.js`: one module per command.
- `src/review.js`: `mutate` becomes a table of action handlers.
- `src/control.js` (Unix socket) is removed; agent routes join `src/server.js`.
- The unreachable Windows path in `stateDirectory()` is removed.

## Rejected

- One shared server for all reviews on a fixed port: needs cross-review routing and a second lock model for little gain.
- Stop hooks that keep the agent polling: invasive and different in every agent.
- Unbounded `wait`: agent shell tools kill commands after 2–10 minutes, which looks like a failure rather than a timeout.
