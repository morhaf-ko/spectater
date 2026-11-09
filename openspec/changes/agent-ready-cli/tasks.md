# Tasks

## 1. Repository conventions

- [ ] 1.1 Rewrite README.md for new users: pitch, screenshot, quick start (`npx skills add`, `npx -y spectater`), agent loop, command table, configuration, limits; move contributor detail to CONTRIBUTING.md.
- [ ] 1.2 Remove docs/verification.md, docs/security-review.md, docs/workflow.md and PRODUCT.md; keep the CLI `workflow` output as the only loop description; reduce AGENTS.md to durable project rules.
- [ ] 1.3 Add release-please (CHANGELOG.md, npm publish with provenance), issue and PR templates, `keywords`/`homepage` in package.json; run CI on fork pull requests with GitHub-hosted runners and no secrets.

## 2. Node runtime and simplification

- [ ] 2.1 Switch the shebang to Node, set `engines.node >=22`, and run the package test and smoke under Node 22 in CI.
- [ ] 2.2 Accept OpenSpec ≥1.15.0 by JSON contract shape instead of exact versions.
- [ ] 2.3 Split bin/spectater.js into a command table and per-command modules; turn `mutate` into an action-handler table; remove the unreachable Windows path and duplicated offline checks.

## 3. Agent interface

- [ ] 3.1 Detached `serve` process with private server file, agent token routes on the loopback server, idle shutdown and `stop`; remove the Unix-socket IPC.
- [ ] 3.2 Change-name addressing for every command; server-tracked delivery; `wait` with JSON status, `next_step` and exit codes; remove `--review` and `--after`.
- [ ] 3.3 Single listener with `--takeover`; home listing with no arguments; Linux browser opening.

## 4. Reader

- [ ] 4.1 Free-form message composer delivered in the batch before comments.
- [ ] 4.2 Send & End and keyboard shortcuts.

## 5. Distribution

- [ ] 5.1 Move the skill to skills/spectater/SKILL.md as a stub that runs `npx -y spectater workflow`; verify `npx skills add` installs it.
- [ ] 5.2 `setup hooks` and `setup hooks --remove` for Claude Code, Codex, OpenCode and Copilot CLI; `status --hook` output.

## 6. Verification

- [ ] 6.1 Update contract, browser and package tests for every changed requirement; run `bun run check`.
- [ ] 6.2 Exercise the full loop once each from Claude Code and Codex against a fixture change.
