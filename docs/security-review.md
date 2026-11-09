# Security and maintainability pass

This is a source review and local test pass, not an independent external audit. It covers the CLI, native discovery/diff, Markdown rendering, browser requests, filesystem/state/IPC, watching, queue/lifecycle transitions, package contents and prepared CI.

## Findings and repairs

| Finding                                                                          | Repair and evidence                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Some file-size checks followed an unbounded read; special-file opens could block | Shared native reads enforce byte budgets during reading, open non-blocking and reject non-regular files; source/config/state/reply paths use them. Byte-limit/FIFO tests pass.                           |
| Config/state JSON decoded malformed UTF-8 permissively                           | Fatal UTF-8 decoding rejects corrupted input; config and source tests exercise rejection.                                                                                                                |
| Source persistence preceded rendering                                            | Render succeeds before the source revision is committed; native refresh retains the last valid view on failure.                                                                                          |
| A state-file replacement could occur between stat and open                       | No-follow/non-blocking open validates the actual descriptor’s type, owner and permissions before reading; legitimate atomic replacements need no pre-open stat or retry.                                 |
| Unused exports/imports and snapshot metadata, plus obsolete select styling       | Removed confirmed unused surfaces; Biome checks unused variables, unreachable code and duplicate definitions/imports and formats JavaScript/CSS/JSON with the recommended Biome preset, without plugins. |
| Validation was a set of separate commands without public CI                      | One native script chain runs the existing gates. Pinned least-privilege CI and offline workflow scanners cover subsequent changes.                                                                       |

A candidate development linter brought a moderate transitive advisory. The operator-selected Biome dependency set passes audit without an override or ignored advisory. Experimental HTML formatting remains disabled by the upstream default.

## Boundaries checked

- Browser requests require the process capability, expected Host and mutation Origin/JSON. Fixed routes expose no arbitrary path. CSP, no-referrer/no-store and escaped Markdown constrain active content; diffs/replies use text, not HTML.
- Native OpenSpec remains the root/schema/artifact authority. Canonical path checks, no-follow source opens, strict UTF-8 and byte/document/state limits reject source escapes and oversized data.
- Private same-user IPC shares one locked writer. Claims, cancellation, replacement and completion serialize with durable atomic state writes. Failed persistence never acknowledges a handoff. Ended reviews reject new feedback without discarding history.
- Native diff gets private temporary snapshots, fixed arguments, isolated Git configuration, disabled external diff/textconv, a time/output budget and owned-directory cleanup. It never modifies canonical files.
- Package allowlists exclude private state, repository automation, test artifacts and personal evidence. The installed package exercises current CLI paths.
- CI actions/images are immutable pins, installs are frozen, permissions are contents-read, checkout credentials are not persisted, and jobs have timeouts/concurrency. Repository runner variables select isolated GitHub-hosted runners; no self-hosted runners are registered. No publication token, OIDC write grant or deployment step is added.

## Limits and remaining delivery work

Same-user processes able to alter files/processes are outside this boundary. macOS and Linux contract/browser flows are exercised. This self-review is not fuzzing, assistive-technology certification or an independent external audit.

The independent read-only release review found one important CI issue: a fork can edit its proposed workflow and remove the same-repository condition. That condition cannot protect a private runner. The operator approved isolated GitHub-hosted runners instead; both runner variables and the absence of self-hosted runners were verified through GitHub. The finding and resolution are recorded in [PR #1](https://github.com/morhaf-ko/spectater/pull/1). The review reported no correctness or maintainability findings.

Dependency and workflow scanner outcomes are recorded in verification.md. Merge and publication remain separate operator approvals.
