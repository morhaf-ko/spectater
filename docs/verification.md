# Verification

## Local environment and gates

Exercised: macOS, Bun 1.4.4, Node 24, OpenSpec 1.16.1 and installed headless Chrome 156.0.8078.81. The original native-contract fixtures also exercised OpenSpec 1.15.0. Other CLI versions fail explicitly. Runtime dependencies remain unified 11.0.5, remark-parse 11.0.0 and remark-gfm 4.0.1; Biome 2.6.6 is development-only.

`bun run check` is the integrated entrypoint. Its exercised gates are:

| Gate                | Result                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frozen install      | 141 packages checked; no resolver changes                                                                                                                                    |
| Lint                | Biome formatting/import organization and recommended lint rules; zero findings                                                                                               |
| Contract tests      | 34 passed: discovery/store/worktree identities, source mapping, filesystem/browser/IPC boundaries, bounded reads, persistence, queue races, lifecycle and native comparisons |
| Headless Chrome     | 12 passed: real text/paragraph selection, favicon/themes, wait/submit/replies, automatic updates, draft preservation, queue correction, End/Resume and inert source diffs    |
| Installed package   | 26 allowlisted files; temporary offline install; current skill/workflow/open/wait/retrieval/replacement/reply/refresh/end/reopen exercised                                   |
| Owned smoke         | CLI readiness, manifest, private state, clean SIGTERM shutdown and unchanged canonical bytes                                                                                 |
| Strict OpenSpec     | All current changes/specs validated without interactive prompts                                                                                                              |
| Dependency audit    | No advisories across 140 audited dependency packages                                                                                                                         |
| Whitespace          | Clean diff                                                                                                                                                                   |
| Workflow validation | actionlint 1.7.12 passed; zizmor 1.32.0 offline auditor scan reported zero findings                                                                                          |
| First-party skill   | skill-creator validation passed; installed CLI guidance exercised                                                                                                            |

Temporary fixture roots/state and isolated native store registries are owned and removed by their tests. No user registry, global skill/hook/plugin, remote setting or production service is modified. The real operator preview retains its existing private feedback separately.

## Evidence and limits

Source tests preserve UTF-16 offsets, Unicode, CRLF and original-byte hashes. Selections across formatting/paragraphs use enclosing-source precision, including element-boundary and real-pointer gestures. Old/duplicate/removed anchors remain stale/orphaned without invented attachment. Read limits apply during reading; FIFO and malformed-UTF-8 inputs fail without replacing saved data.

Queue tests serialize cancellation against handoff, preserve paused edits/replacements across restart, separate archive retrieval and verify failed persistence never acknowledges delivery. Completion retains read-only history, refuses queued abandonment, returns ended to listeners and requires explicit resumption. Comparison tests use retained snapshots, include additions/removals, preserve baselines through metadata changes/restart, reject unknown IDs and clean up after native failure.

Desktop 1440×900 and mobile 390×844 checks include light/dark reader, viewport-clamped composition, compact queues/history and source diffs. Screenshots are inspected separately from DOM assertions; they do not prove physical-device or assistive-technology conformance. The prior static-shell detector flagged the metadata type hierarchy; rendered document headings are separately sized. No aesthetic acceptance is inferred from automation.

macOS is exercised. Linux storage/IPC/manual opening remain unverified on Linux until remote CI runs; Windows is unsupported. Runner variables are unset and no workflow was pushed/triggered. Renovate configuration was previously validated; bot activation and required-check settings remain unverified. The [security pass](security-review.md) is a self-review, not independent release approval. No release/publication is claimed.

## Performance sample

An earlier `bun run benchmark -- --project . --change local-change-review` sample measured six documents/38,940 source bytes and a 118,171-byte state response. Three warm-cache runs gave median initialization 635.23 ms, state view 0.06 ms, durable save 12.07 ms and refresh 596.90 ms. Native version/context/list/status samples were 54.30/196.33/171.79/185.71 ms. These are historical local samples, not measurements of the final added features, cold launch, large projects, memory or token savings.

Source rendering is cached by hash within the process; unchanged events do not persist/rerender. Theme switching changes root variables without fetching assets or replacing documents. Diffs run only when requested. Native discovery is the main measured refresh cost. Optional optimization experiments remain in the OpenSpec design, not a second task ledger.
