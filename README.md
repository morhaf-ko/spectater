# SpecTater

[![Check](https://github.com/morhaf-ko/spectater/actions/workflows/check.yml/badge.svg)](https://github.com/morhaf-ko/spectater/actions/workflows/check.yml)
[![npm](https://img.shields.io/npm/v/spectater)](https://www.npmjs.com/package/spectater)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

Review [OpenSpec](https://github.com/Fission-AI/OpenSpec) changes in your browser and send selected-text feedback straight to your coding agent.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/reader-dark.png">
  <img alt="The SpecTater reader: a rendered OpenSpec proposal with two comments and an agent reply in the sidebar" src="docs/images/reader-light.png">
</picture>

Your agent drafts a proposal, design, specs and tasks. SpecTater opens them in a local reader where you select text, comment, and submit. The agent receives your comments as structured JSON, revises the Markdown, and replies. The page updates as the files change. Everything stays on your machine.

## Quick start

Install the skill for your agents, in every project (`-g`):

```sh
npx skills add morhaf-ko/spectater -g
```

Then ask your agent to review a change, for example "let's go through the add-dark-mode proposal". You don't need to mention spectater: agents pick the skill when you ask to review or give feedback on an OpenSpec proposal, design, spec or tasks. The skill runs `npx -y spectater`, so there is nothing else to install.

Without the skill, tell the agent: "Run `npx -y spectater workflow` and follow it for the add-dark-mode change."

Requirements: Node 22.12 or newer, the [OpenSpec CLI](https://github.com/Fission-AI/OpenSpec) 1.15 or newer (`npm install -g @fission-ai/openspec`), macOS or Linux. Git is optional; it powers the "What changed" diff.

### Review every change automatically

To have agents open a review whenever they finish drafting a change, add this to your project's `openspec/config.yaml`. OpenSpec passes `context` to the agent whenever it drafts an artifact (and during apply and archive), in every agent it supports:

```yaml
context: |
  After you draft or revise a change's proposal, design, specs or tasks while planning (not while applying or archiving), open it for review with `npx -y spectater open <change>` and follow `npx -y spectater workflow`. No browser is needed: spectater prints a review URL for the user.
```

If your project doesn't use OpenSpec's workflows, put the same sentence in `AGENTS.md` or `CLAUDE.md` instead. `npx -y spectater` always runs the latest release; to pin the version for everyone who shares the config, write `npx -y spectater@<version>` instead.

## How it works

```
agent: spectater open add-dark-mode    → server starts in the background, browser opens
you:   select text, comment, Submit     → feedback is saved and queued
agent: spectater wait add-dark-mode     → receives the batch as JSON
agent: spectater reply … --status working, edits Markdown, spectater reply … --message-file result.md
you:   see the update and the reply; comment again or click End review
```

Every agent command prints one JSON object with a `status` and a `next_step`, so the agent always knows what to do next:

| `status`            | Meaning                                        | Exit code |
| ------------------- | ---------------------------------------------- | --------- |
| `batch`             | Feedback delivered in `batch`                  | 0         |
| `timeout`           | No feedback within `--timeout` (default 540 s) | 0         |
| `ended`             | You ended the review                           | 0         |
| `error`             | The command failed; see `error`                | 1         |
| `stopped`           | The review server is not running               | 3         |
| `listener_active`   | Another `wait` is already listening            | 4         |
| `listener_replaced` | Another `wait --takeover` replaced this one    | 5         |

Until the agent replies to a batch, `wait` returns that batch again, so feedback is never lost if the agent is interrupted.

Other commands report `ready` or `reused` (`open`), `recorded` (`reply`), `refreshed` (`refresh`), `ended` (`end`), `stopping` or `not_running` (`stop`), and `stopped` (exit 3) when no server is running. Any command can return `error` (exit 1).

## In the browser

- Select text in the rendered view or the Markdown source, then comment. Enter saves; Cmd/Ctrl+Enter saves and submits.
- Write a message to the agent that is not tied to a selection.
- Submit sends only new or changed comments. Until the agent picks a batch up you can edit or cancel it.
- **Send & End** submits and ends the review once the agent has received the final batch.
- Comments on text that later changes are marked stale (with a suggested re-anchor) or orphaned; nothing is silently moved.
- "What changed" diffs the latest source update against the previous one.
- Edits appear as the agent saves them. When an agent's sandbox blocks file watching (Codex on macOS, for example), they appear when the agent replies.

## Commands

| Command                                   | Description                                                                                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `spectater`                               | List open reviews and usage.                                                                                                                |
| `spectater open [change]`                 | Start or reuse the review server and open the browser; the change may be omitted when the project has exactly one. `--no-open`, `--reopen`. |
| `spectater wait <change>`                 | Wait for feedback. `--timeout <seconds>`, `--takeover`, `--format markdown`.                                                                |
| `spectater reply <change>`                | `--status working`, or post a result with `--message` / `--message-file`. `--batch <n>` targets an earlier batch.                           |
| `spectater feedback <change> --batch <n>` | Print a submitted batch without recording delivery.                                                                                         |
| `spectater refresh <change>`              | Re-read the change from disk.                                                                                                               |
| `spectater end <change>`                  | End the review.                                                                                                                             |
| `spectater stop <change>`                 | Stop the server. Saved feedback is kept.                                                                                                    |
| `spectater workflow`                      | Print the agent review loop.                                                                                                                |
| `spectater skill`                         | Print the agent skill.                                                                                                                      |
| `spectater setup hooks`                   | Add SessionStart hooks (see below). `--remove` undoes it.                                                                                   |

Run commands from the project directory, or pass `--project <dir>`. Use `--store <id>` for an OpenSpec store.

## Session hooks (optional)

To have new agent sessions see reviews that are already open, install SpecTater globally and add the hooks:

```sh
npm install -g spectater
spectater setup hooks
```

For each agent that is installed, this adds a SessionStart hook for Claude Code (`~/.claude/settings.json`), Codex (`~/.codex/hooks.json`; approve it once with `/hooks`), OpenCode (`~/.config/opencode/plugins/spectater.js`) and GitHub Copilot CLI (`~/.copilot/hooks/spectater.json`). The hook runs `spectater status --hook`, which prints open reviews for the current project and nothing otherwise. It never blocks or drives the agent. Restart your agent sessions afterwards.

## Configuration

No configuration is required. An optional `~/.config/spectater/config.json` (or `$XDG_CONFIG_HOME/spectater/config.json`, or `--config <file>`, or `SPECTATER_CONFIG`) accepts:

```json
{ "defaultView": "source", "openBrowser": false, "stateDirectory": "/absolute/path" }
```

| Variable                 | Effect                                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `SPECTATER_STATE_DIR`    | Where reviews are stored. Default: `~/Library/Application Support/SpecTater` on macOS, `$XDG_STATE_HOME/spectater` on Linux. |
| `SPECTATER_IDLE_TIMEOUT` | Seconds before an unused server stops itself. Default 1800; `0` disables.                                                    |

Review state lives outside your repository and is never uploaded. Back it up separately if you need the history.

## Security and limits

The server listens on `127.0.0.1` only. The URL contains a private token; anyone with it can read and comment on the review, so do not share it. Markdown is rendered without raw HTML, scripts or remote images, and SpecTater never writes to your Markdown. Limits: 1 MiB per file, 128 artifacts, 10,000 characters per selection, comment or message. Windows is not supported. See [SECURITY.md](SECURITY.md) to report a vulnerability.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Requirements live in [`openspec/specs`](openspec/specs) and in-flight changes in [`openspec/changes`](openspec/changes).

## License

[MIT](LICENSE). Interface tokens adapt the Apache-2.0 [Open Design](https://github.com/nexu-io/open-design) Clean system; see [docs/licenses/open-design.txt](docs/licenses/open-design.txt).
