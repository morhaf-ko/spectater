# Tasks

## 1. Repository conventions

- [x] 1.1 Rewrite README.md for new users: pitch, quick start (`npx skills add`, `npx -y spectater`), agent loop, command table, configuration, limits; move contributor detail to CONTRIBUTING.md.
- [x] 1.2 Remove docs/verification.md, docs/security-review.md, docs/workflow.md and PRODUCT.md; keep the CLI `workflow` output as the only loop description; reduce AGENTS.md to durable project rules.
- [x] 1.3 Add release-please (CHANGELOG.md, npm publish with provenance), issue and PR templates, `keywords`/`homepage` in package.json; run CI on fork pull requests with GitHub-hosted runners and no secrets.

## 2. Node runtime and simplification

- [x] 2.1 Switch the shebang to Node, set `engines.node >=22.12`, and run the package test and smoke under Node 22 in CI.
- [x] 2.2 Accept OpenSpec ≥1.15.0 by JSON contract shape instead of exact versions.
- [x] 2.3 Split bin/spectater.js into a table of command handlers backed by src/agent.js and src/hooks.js; turn `mutate` into an action-handler table; remove the unreachable Windows path and duplicated offline checks.

## 3. Agent interface

- [x] 3.1 Detached `serve` process with private server file, agent token routes on the loopback server, idle shutdown and `stop`; remove the Unix-socket IPC.
- [x] 3.2 Change-name addressing for every command; server-tracked delivery; `wait` with JSON status, `next_step` and exit codes; remove `--review` and `--after`.
- [x] 3.3 Single listener with `--takeover`; home listing with no arguments; Linux browser opening.

## 4. Reader

- [x] 4.1 Free-form message composer delivered in the batch before comments.
- [x] 4.2 Send & End and keyboard shortcuts.

- [x] 4.3 Add a README screenshot of the reader.

## 5. Distribution

- [x] 5.1 Move the skill to skills/spectater/SKILL.md as a stub that runs `npx -y spectater workflow`; verify `npx skills add` installs it.
- [x] 5.2 `setup hooks` and `setup hooks --remove` for Claude Code, Codex, OpenCode and Copilot CLI; `status --hook` output.

## 6. Verification

- [x] 6.1 Update contract, browser and package tests for every changed requirement; run `bun run check`.
- [x] 6.2a Exercise the full loop from Claude Code against a fixture change.
- [x] 6.2b Exercise the full loop from Codex against a fixture change. Codex's macOS sandbox makes file watching fail (`EMFILE`), so replies now re-read the change before recording.
