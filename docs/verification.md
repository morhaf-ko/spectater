# Verification

## Exercised environment

Local macOS, Bun 1.4.4, Node 24.22.2 for the external OpenSpec CLI, OpenSpec 1.16.1 and installed Chrome 156.0.8078.81. The initial vertical slice and baseline also exercised OpenSpec 1.15.0. Other CLI versions fail closed. Direct package versions matched registry stable tags on 2026-11-09: remark-parse 11.0.0, remark-gfm 4.0.1, unified 11.0.5, Playwright 1.65.0 and development OpenSpec 1.16.1. No prerelease channel is selected.

## Acceptance interfaces

Local acceptance passed: 13 contract tests, four browser tests, a 16-file package allowlist with temporary offline install, CLI smoke, frozen install, dependency audit, Renovate validation and strict OpenSpec validation. No checks were waived.

| Command | Evidence |
| --- | --- |
| `bun install --frozen-lockfile --ignore-scripts` | Exact lockfile installation; no lifecycle scripts |
| `bun run test` | Native schema paths, missing/unsupported CLI contracts, actual isolated declared/explicit/default stores, identity separation, symlink escape, Unicode/CRLF, inert rendering, conflicts, durability, corruption, failed writes, immutable batches, HTTP boundaries and config defaults/errors |
| `bun run test:browser` | Read/select/comment/submit/CLI retrieve/revise/refresh/restart; exact/enclosing selection, source fallback, clipboard denial/download, malicious Markdown, source default, mobile overflow/focus and forced opener failure |
| `bun run test:package` | Allowlisted tarball, temporary offline Bun install, installed help and complete feedback loop; unchanged canonical bytes |
| `bun run smoke -- --fixture local-review --no-open` | Owned CLI readiness, manifest, persistent state and SIGTERM shutdown; separate from browser acceptance |
| `bun audit` | Registry audit of the locked dependency set |
| `bunx --package renovate@44.223.0 renovate-config-validator --strict --no-global renovate.json` | Repository configuration syntax/option validation; does not prove remote preset access or bot activation |
| `OPENSPEC_TELEMETRY=0 node_modules/.bin/openspec validate local-change-review --type change --strict --no-interactive --json` | Native strict change validation |
| `git diff --check` | Patch whitespace |

Test fixtures live under test/; scripts under scripts/. They create temporary projects/state, scope OpenSpec store configuration to temporary XDG directories, and remove only owned data. No user store registry, canonical review documents, global install, hook or production service is changed.

The first browser vertical slice passed before expanded mapping/store tests. Development failures included a forged-Host test using a client that normalized the header, fixture teardown ordering, Bun's default test timeout, an unfilled offline package cache and a screenshot fixture path. Inputs were corrected and affected gates rerun. A sandbox loopback denial required the normal execution permission; no boundary was bypassed. Full-page mobile screenshots repeated the viewport in Chrome; viewport captures replaced that evidence.

## Browser and design evidence

The operator selected navigation, central reading and feedback sidebar. Browser checks capture desktop at 1440×900 and mobile at 390×844, including the mobile feedback region. These are viewport sizes, not physical-device proof. Rendered/source, empty, saved/current, stale, orphaned, conflict, receipt, clipboard denial and opener fallback states are exercised. Agent screenshot inspection and the mechanical detector are separate from operator visual acceptance. The detector returned no findings. No delegated reviewer was used under the mission's no-delegation constraint.

The real macOS `open` invocation returned success and the resulting browser visibly showed the exact fixture change with Ready status. That check used a disposable fixture, separate from the headless browser suite. A successful server start alone was not counted as browser completion.

## Performance evidence

`bun run benchmark` creates one small Markdown artifact and measures three sequential local runs with warm OS/package caches. It reports median milliseconds for review initialization, a state view, a durable comment save and refresh. It does not measure full browser startup, large projects, cold caches, memory usage or token savings.

| Runtime / native CLI / implementation | Open | View | Save | Refresh |
| --- | ---: | ---: | ---: | ---: |
| Node 24.22.2 / OpenSpec 1.15.0 / initial | 1682.70 | 0.51 | 614.02 | 598.19 |
| Bun 1.4.4 / OpenSpec 1.15.0 / initial | 1683.93 | 1.47 | 802.84 | 780.41 |
| Bun 1.4.4 / OpenSpec 1.15.0 / reduced repeated work | 603.77 | 0.05 | 2.39 | 530.88 |
| Bun 1.4.4 / OpenSpec 1.16.1 / reduced repeated work | 623.74 | 0.02 | 6.87 | 722.31 |

The runtime switch alone did not improve this fixture. Startup now performs one discovery rather than two; version is checked once per review process. Native discovery runs on open/explicit refresh. Saves rehash current manifest files and check the state revision without spawning OpenSpec. Rendered output is reused by byte hash and renderer version for current documents only. Snapshots and durable writes remain; there is no polling, file watcher or speculative background scanner. Differences between CLI-version rows are not a controlled speed comparison.

## Remaining limits

macOS is exercised. Linux permissions/manual opening remain unverified on Linux; Windows storage and automatic opening are unsupported. Cross-leaf rendered selection falls back to Source. Registry publication, hosted CI, Renovate activation/preset access, independent security review and operator aesthetic acceptance are outside this local evidence. Renovate automatic merges stay disabled until remote validation is reporting and required. No release or production readiness is claimed.
