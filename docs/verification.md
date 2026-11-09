# Verification

## Local acceptance

Exercised environment: macOS, Bun 1.4.4, external OpenSpec 1.16.1, installed headless Chrome 156.0.8078.81. The original slice also exercised OpenSpec 1.15.0. Other CLI contracts fail explicitly. Runtime dependencies remain unified 11.0.5, remark-parse 11.0.0 and remark-gfm 4.0.1. No dependency was added for themes, popovers, private IPC, events, icons or the skill.

| Gate | Result |
| --- | --- |
| `bun install --frozen-lockfile --ignore-scripts` | Passed; 129 packages checked, no lockfile changes |
| `bun run test` | 27 passed, zero failed: discovery, native stores/worktrees, source/security/persistence, comment lifecycle, directory watching, durable activity, cancellable queue handoff and private agent-loop transport |
| `bun run test:browser` | Eleven passed in a dedicated headless Chrome: actual drag/double-click and multi-paragraph selection, readable routes, favicon, wait/submit/automatic source updates/replies, revision conflicts, restart, themes, draft recovery, queued pause/update/cancel/correction, collapsed exports and viewport behavior |
| `bun run test:package` | 23 allowlisted files; temporary offline Bun install; installed skill/workflow/open/wait/retrieval/queue replacement/reply/reuse/refresh passed |
| `bun run smoke -- --fixture local-review --no-open` | Owned CLI readiness, manifest, persistent state, SIGTERM shutdown and unchanged source passed |
| Native strict OpenSpec validation | local-change-review valid=true, issues=[] |
| `git diff --check` | Clean |
| First-party skill validation | skill-creator quick_validate returned valid; its documented interfaces also ran from the installed tarball |

The locked set's latest registry audit reported no vulnerabilities across 129 packages; no dependencies changed afterward. Renovate 44.223.0 strict repository-config validation passed. It validates configuration/options, not remote preset access or bot activation. Automatic merges remain disabled pending remote reporting/required checks.

## Scope of exercised behavior

Temporary fixture roots/state and XDG-isolated store registries are removed by their owning tests. Actual Git worktrees sharing a slug retain distinct review identities. No user registry, global skill/hook/plugin, real project source, remote account, provider or production service is modified by tests.

The readable route retains the canonical internal review ID and capability checks. Multi-paragraph real-pointer and whole-block element-boundary selections preserve contiguous Markdown offsets, including formatting, links, entities, Unicode and CRLF. A desktop screenshot of the multi-paragraph composer was visually inspected. The added browser checks and HTTP assertion passed after focused rechecks corrected an asynchronous test wait and a test variable reference.

The real-pointer regression first reproduced the missing popover: opening during mouseup let the browser's subsequent native click dismiss it. Opening after that gesture passes actual drag and double-click checks. Synthetic ranges remain useful for exact offsets but are not the only interaction evidence.

The agent-loop browser test starts a bounded CLI wait, submits in the browser, receives the durable immutable batch, reports working explicitly, changes fixture Markdown, observes automatic source refresh/stale comments with draft text preserved, then posts a plain-text reply without disturbing the open composer. Directory-event tests cover direct writes, atomic file replacement, native artifact additions/removals, unchanged-event suppression, shutdown and recovery after an escaping symlink is rejected. Durable activity survives restart separately from immutable batches; repeated receipts/replies are idempotent. Other tests cover queued-before-wait delivery, repeatable cursor reads, timeout bounds, disconnect cancellation, stopped listeners, same-user socket permissions, regular-file refusal, active reuse and offline batch retrieval. Graceful transport shutdown and monotonic state acceptance are exercised with reloads. Queue tests serialize cancellation against delivery, preserve paused edits and replacement links across restart, reject withdrawn delivery, deduplicate unchanged comments, keep archive reads separate and verify that failed persistence never acknowledges a handoff. Queued controls and collapsed history were checked at desktop light and mobile dark sizes; More reloads its export on demand.

Light/dark desktop 1440×900 and mobile 390×844 screenshots include source and viewport-clamped popovers. These are viewport tests, not physical-device proof. The static-shell detector flags the 12/14/16px metadata hierarchy; screenshot review distinguishes it from rendered document headings at 28/24/18px. No operator aesthetic acceptance, independent security review or assistive-technology conformance is inferred. Final verification uses automation and APIs rather than computer-use tools or personal browser profiles.

## Artifact safety and limits

Canonical Markdown stays authoritative. Saved comments, snapshots and batches survive restarts in private disk state. Comment deletion is recoverable and submitted batches stay immutable. Unsaved sessionStorage drafts are weaker: same-tab/origin reload recovery depends on available browser storage, and changed hashes require a new selection. Worktree relocation does not automatically migrate review identity; keep private state and Git backups rather than resetting it.

macOS is the exercised platform. Linux private storage/IPC/manual opening remain unverified on Linux; Windows private storage/IPC and automatic opening are unsupported. Cross-leaf rendered selection uses enclosing-source precision; unmapped boundary content requires Source. Publication, hosted CI, Renovate activation and independent release security review remain outside local implementation acceptance. No release readiness or ability to wake a stopped model is claimed.

## Performance sample

`bun run benchmark -- --project . --change local-change-review` measured six documents with 38,940 current source bytes and a 118,171-byte initial JSON response at that time. Three sequential warm-cache runs gave median initialization 635.23 ms, state view 0.06 ms, durable save 12.07 ms and refresh 596.90 ms. Separate native subprocess samples were version 54.30 ms, context 196.33 ms, list 171.79 ms and status 185.71 ms. This does not measure full browser launch, cold caches, physical memory, large-project behavior or token savings.

At that measurement the HTML/CSS/app/theme assets totaled 33,858 uncompressed bytes; the local favicon adds 436 bytes. Theme changes update root variables without network requests or document replacement. Plan updates use authenticated revision notifications; no polling or background repository scanner is introduced. Current rendering is cached by source hash/renderer version and comment saves do not spawn OpenSpec. Source hashes, one-writer locks, fsync and atomic state persistence remain required.

Implementation contracts and optional optimization ideas live in openspec/changes/local-change-review/design.md. Supported agent commands live in docs/workflow.md; neither this evidence file nor that usage guide is a second task ledger.
