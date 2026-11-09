# Contributing

## Setup

You need [Bun](https://bun.sh) 1.4.4 for development, Node 22.12 or newer, and Chrome for the browser tests.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run playwright install chrome   # once, if Chrome is missing
```

Run the CLI from a checkout with `node bin/spectater.js`.

## Checks

```sh
bun run check
```

This runs Biome, the contract tests (`bun run test`), the Playwright browser tests (`bun run test:browser`), an npm install of the packed tarball run under Node (`bun run test:package`), a smoke test, strict OpenSpec validation and `bun audit`. `bun run format` applies Biome fixes.

## Changes

Behaviour is specified in [`openspec/specs`](openspec/specs). For a behaviour change, add or update an OpenSpec change in `openspec/changes` alongside the code and validate it with `bun run spec:check`.

Use [Conventional Commits](https://www.conventionalcommits.org) (`feat:`, `fix:`, `docs:`, …). Release notes and versions are generated from them by release-please; do not edit `CHANGELOG.md` by hand.

In pull requests, say what changed, why, and which checks you ran. Never include review URLs, state files or private documents; review URLs contain a private token.

## Releases

Merging to `main` lets release-please open or update a release pull request; merging that PR tags the release and publishes to npm through [trusted publishing](https://docs.npmjs.com/trusted-publishers). The workflow depends on settings it cannot read or repair itself, so a maintainer checks them with:

```sh
bun run release:preflight
```

It verifies that GitHub Actions may open pull requests and that `CI_RUNNER`, `LIGHT_RUNNER` and `RELEASE_RUNNER` are set, and prints the command that fixes each gap. npm's trusted publisher (`npm trust github spectater --repo morhaf-ko/spectater --file release.yml --env npm --allow-publish`) needs 2FA and is set once by the package owner.

## Code layout

| Path                             | Role                                                                   |
| -------------------------------- | ---------------------------------------------------------------------- |
| `bin/spectater.js`               | CLI: argument parsing and one handler per command                      |
| `src/agent.js`                   | Server registry, change-name lookup, detached start, agent HTTP client |
| `src/server.js`                  | Loopback HTTP server for the browser and `/agent/*` routes             |
| `src/review.js`                  | Review model: comments, batches, delivery, lifecycle                   |
| `src/storage.js`                 | Private state files, writer lock, export formatting                    |
| `src/discovery.js`               | Native OpenSpec discovery and safe file reads                          |
| `src/markdown.js`                | Source-mapped Markdown rendering and anchors                           |
| `src/watch.js`, `src/changes.js` | File watching and snapshot diffs                                       |
| `src/hooks.js`                   | `setup hooks` for each agent                                           |
| `web/`                           | Browser client (plain JavaScript and CSS)                              |
| `skills/spectater/SKILL.md`      | Agent skill installed by `npx skills add`                              |

Visual tokens and interface rules are in [DESIGN.md](DESIGN.md).
