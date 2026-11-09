# Proposal

## Why

SpecTater works, but only for an agent that runs Bun, keeps a foreground server alive in its own background-job controls, and carries a 64-character review id plus a sequence cursor between calls. Each of those is a step an agent can get wrong, and most agents (Codex, OpenCode, Copilot CLI, Cursor) cannot run it with `npx` at all. The repository also publishes process evidence as user documentation and describes the review loop in four places.

## What changes

- **Runtime:** ship plain Node ≥22 ESM so `npx -y spectater` works in any agent; Bun stays the development toolchain.
- **Agent interface:** `spectater open <change>` starts a detached per-review server and returns. Reviews are addressed by project directory and change name. The server tracks delivery, so `spectater wait <change>` needs no cursor and returns one JSON object with a fixed `status` and a `next_step`. The Unix-socket IPC server is replaced by authenticated loopback HTTP on the same server.
- **Lifecycle:** the server stops itself after an idle period with no browser or listener; `spectater stop <change>` stops it explicitly.
- **One listener:** a second `wait` is refused unless it passes `--takeover`.
- **Home listing:** `spectater` with no arguments lists open reviews and the next command for each.
- **Reader:** a free-form message composer, **Send & End**, and Enter/Cmd+Enter/Escape shortcuts.
- **Distribution:** a short skill installable with `npx skills add morhaf-ko/spectater`; opt-in `spectater setup hooks` adds SessionStart hooks for Claude Code, Codex, OpenCode and Copilot CLI that list open reviews.
- **Discovery:** accept any OpenSpec ≥1.15 whose JSON matches the expected shape instead of two exact versions.
- **Repository:** one description of the review loop (the CLI's `workflow` output), a README written for new users, release-please changelog, issue/PR templates, fork-safe CI, and removal of process-evidence documents.

## Capabilities

### New capabilities

None.

### Modified capabilities

- `change-reading`: version-tolerant native discovery; Linux browser opening.
- `review-feedback`: free-form messages, Send & End, keyboard shortcuts.
- `workflow-handoff`: detached server, change-name addressing, server-tracked delivery, structured results, single listener, home listing, distribution and opt-in hooks.

## Impact

Breaking CLI change: `--review`, `--after` and the foreground `open` are removed; `feedback --wait` becomes `wait`. Saved review state keeps format version 1 and is read unchanged. The package moves to Node ≥22 and is published to npm by release-please.

Out of scope: hosted services, accounts, telemetry, HTML artifacts, image attachments, diagrams, sharing, Windows, and any hook that drives or blocks the agent loop.
