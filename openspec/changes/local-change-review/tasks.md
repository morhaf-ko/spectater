# Tasks

The operator authorized implementation after proposal review. Runtime and command updates are recorded in design.md; the implementation uses Bun. Checked items record implementation evidence and do not grant publication, merge or production authority. Verification interfaces and limits are documented in docs/verification.md.

## 1. Establish implementation inputs

- [x] 1.1 Record operator authorization, approved defaults, Bun/OpenSpec/browser versions, dependency/license choices and exact acceptance scripts in the implementation mission ledger before installing anything; verify the record covers this proposal and no live actions.
- [x] 1.2 Create the smallest CLI/browser package and approved lockfile with Bun test entrypoint; verify `bun install --frozen-lockfile --ignore-scripts`, CLI help and a test run succeed, and document the local invocation.

## 2. Deliver one end-to-end review slice

- [x] 2.1 Discover one explicit local change through native CLI JSON and expose its manifest with visible identity and native status; verify `bun run test` covers missing CLI/change, unsupported JSON and nonstandard artifact names, with no copied schema/status parser.
- [x] 2.2 Serve safe rendered/source views through a capability-protected loopback process with explicit stop; verify `bun run test` rejects escaping paths, foreign origins, forged hosts, missing capability and active Markdown content, and document the local boundary.
- [x] 2.3 Save one exact plain-text selection with its original-byte hash, immutable snapshot and private atomic state; verify `bun run test` covers offsets, durable restart, failed persistence, corrupt state and conflicting writers without canonical source writes.
- [x] 2.4 Submit an immutable batch and retrieve it through the CLI in Markdown/JSON; verify repeated retrieval is stable, unknown IDs fail and exports omit absolute paths; document the batch receipt and copy fallback.
- [x] 2.5 Refresh after an external Markdown revision and retain stale/orphaned comments with explicit reattachment; verify changed, deleted and duplicate-text cases in `bun run test`.
- [x] 2.6 Complete `bun run test:browser` for read → select → comment → submit → CLI retrieve → external revision → stale/orphan display → restart; verify canonical hashes change only during the explicit fixture revision and record the exact owned runtime and result before expanding features.

## 3. Expand only within the accepted contracts

- [x] 3.1 Extend rendered mapping with precision labels and source fallback; verify `bun run test` plus `bun run test:browser` cover Unicode, CRLF, escapes/entities, emphasis, task lists, tables and cross-block selection; document unsupported selection behavior.
- [x] 3.2 Exercise custom schemas, declared/explicit stores, global-default refusal and separate worktrees sharing a change slug; verify native discovery fixtures and identity isolation through `bun run test`, and document only exercised compatibility.
- [x] 3.3 Add the optional on-demand workflow instruction, macOS opener and no-open/manual URL path; verify opener success once locally and forced failure/clipboard denial through `bun run test:browser`, and document that instruction-based opening is not a guaranteed OpenSpec event hook.
- [x] 3.4 Build and inspect a local package, install into a temporary prefix and exercise installed help/review/retrieval through `bun run test:package`; run `bun run smoke -- --fixture local-review --no-open`, strict OpenSpec validation and `git diff --check`; record readiness, completed browser checks and human visual review separately. Registry publication and releases require separate authority.

## 4. Complete the operator review loop

- [x] 4.1 Fix actual pointer selection and add the local favicon; verify real drag/double-click composition and favicon loading in Chrome browser tests.
- [x] 4.2 Add bounded feedback waiting with durable batch sequence cursors; verify queued-before-wait delivery, live submission, timeouts and repeatable retrieval without a second agent.
- [x] 4.3 Reuse an active exact-change review and refresh it through private local IPC; verify no second writer, browser update, draft preservation and stale/orphan reconciliation.
- [x] 4.4 Ship a small first-party skill stub which reads current CLI guidance without installing global hooks or changing agent ownership; validate the stub and exercise its documented commands.
- [x] 4.5 Reconcile design/spec/tasks as the planning authority, keep docs/workflow.md as usage only, and run the integrated contract/browser/package/smoke/native gates before local commit and Chrome preview handoff.
