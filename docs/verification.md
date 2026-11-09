# Verification

## Exercised environment

Local macOS, Bun 1.4.4, Node 24.22.2 for the external OpenSpec CLI, OpenSpec 1.16.1 and installed Chrome 156.0.8078.81. The initial vertical slice and baseline also exercised OpenSpec 1.15.0. Other CLI versions fail closed. Direct package versions matched registry stable tags on 2026-11-09: remark-parse 11.0.0, remark-gfm 4.0.1, unified 11.0.5, Playwright 1.65.0 and development OpenSpec 1.16.1. No prerelease channel is selected.

## Acceptance interfaces

Local acceptance passed: 13 contract tests, six browser tests, a 16-file package allowlist with temporary offline install, CLI smoke, frozen install, dependency audit, Renovate validation and strict OpenSpec validation. No checks were waived.

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

## Clean and theme refinement

The operator requested the OpenDesign Clean system, system-mode default, manual light/dark overrides and fewer visible instructions. The implementation keeps artifact metadata behind Details and export controls behind Export. Six browser tests pass, including OS color-scheme changes, persistent overrides, selection/draft preservation and storage-denial fallback. Light/dark screenshots at 1440×900 and 390×844 were inspected; the scoped detector returned no findings. The source reference and license are recorded in DESIGN.md. No runtime or theme dependency was added.

The complete active change was measured with `bun run benchmark -- --project . --change local-change-review`: six documents, 36,177 source bytes and a 114,856-byte initial JSON state response at measurement time. Three sequential warm-cache runs gave median initialization 629.93 ms, view 0.06 ms, durable save 10.52 ms and refresh 621.38 ms. Separate native subprocess samples measured version 59.90 ms, context 226.91 ms, list 242.95 ms and status 231.85 ms. These are local samples, not cross-machine guarantees or controlled comparisons between CLI commands.

Served assets at that point: HTML 2,847 bytes, CSS 8,856 bytes, app JavaScript 9,097 bytes and theme JavaScript 979 bytes (21,779 bytes total, uncompressed). Theme changes update root attributes/CSS variables without network requests or document rendering. No theme paint-time benchmark is claimed.

Prioritized future performance experiments:

1. Verify whether one native status response provides every needed root, schema, artifact and diagnostic field for the supported versions/stores. If it does, replace redundant context/list calls while retaining native discovery and global-default refusal. Current measurements identify subprocess startup as the dominant cost; no parser replacement is proposed.
2. Return smaller mutation responses and load only the selected document, with explicit invalidation. The current response contains every document's source/rendered HTML and repeated comment snapshots. Measure larger changes before adding transport/cache complexity.
3. Evaluate lazy artifact parsing or one local parser bundle if larger-change profiling shows import/parsing cost. Current state views are already below one millisecond in this sample.

Revision hashes, filesystem boundaries, one-writer checks, fsync and atomic state persistence remain required. Compression, native binaries, background daemons and extra caches are not justified by the current local measurements.
