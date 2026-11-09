# Design

## Context

See proposal.md for motivation. This repository has no application runtime. The design is for operator Markdown review; no proposed default below authorizes implementation. Native discovery was exercised with OpenSpec 1.15.0 in the planning worktree. Other compatibility cases below are implementation acceptance targets, not verified support.

## Goals / Non-goals

Preserve exact source identity across reading, commenting and feedback retrieval. Keep the runtime on demand and reuse native OpenSpec semantics. Do not create a second OpenSpec parser, workflow controller or generated HTML document that agents must maintain.

## Decisions

### Decision register

| Status | Decision | Basis |
| --- | --- | --- |
| Confirmed requirement | OpenSpec only; canonical Markdown; selected-text comments; concise feedback to the existing conversation | Product scope |
| Confirmed requirement | Local process; no accounts, backend service, embedded model, agent ownership or approval inference | Product scope |
| Confirmed requirement | Attempt exact-change browser opening after integrated drafting; retain manual fallback | Product scope |
| Proposed default | Node.js CLI using built-in HTTP, crypto, filesystem, subprocess and test facilities; plain browser JavaScript/CSS | One language across the boundary; no frontend framework, app template, WebSocket server or DB |
| Proposed default | Maintained Markdown AST parser with GFM extensions; native selection and source mapping | Avoid handwritten Markdown grammar and general annotation machinery |
| Proposed default | One explicit change per process; private JSON review store; immutable feedback batches | Small persistence contract with no repository source writes |
| Proposed default | On-demand workflow instruction plus explicit CLI; export/copy fallback | OpenSpec rules supply prompts rather than executable completion events |
| Unresolved implementation authorization | Operator must review this proposal and authorize the defaults or request revisions | Required before application work |

There is no further product decision blocking proposal capture. Runtime support versions, dependency versions and release channel verification belong to the first authorized implementation gate. Their values must be recorded before installing dependencies; there is no preapproved release or automatic installer.

### Reuse comparison

Public primary sources inspected on 2026-11-09; these are source/documentation comparisons, not runtime benchmarks.

| Candidate | Existing mechanism | Missing contract / cost | Recommendation |
| --- | --- | --- | --- |
| Native OpenSpec CLI | Root resolution and schema-aware artifact/status JSON | No browser comment store | Use as authority |
| Small CLI plus native browser selection | Direct control of source identities and explicit batches | Must implement conservative mapping, persistence and local boundary | Preferred starting point |
| [Recogito Text Annotator](https://github.com/recogito/text-annotator-js/blob/main/README.md) | Framework-independent text annotation, quote/character selectors and events; BSD-3-Clause | Rendered selectors still need Markdown source mapping and revision checks; package adds annotation dependencies | Reconsider only if native selection cannot meet the defined slice |
| [Lavish](https://github.com/kunchenguid/lavish-axi/blob/main/README.md) | Local HTML annotation and CLI feedback; optional session hooks and sharing | Thin adapter must generate deterministic HTML, carry source mapping through annotations and reconcile rewritten Markdown | Do not adopt the full workflow |
| [spek](https://github.com/spekhq/spek/blob/master/README.md) | Read-only OpenSpec viewer with worktree aggregation and schema-aware views | No comment feedback loop; its broader reader/aggregation surface exceeds one-change scope | Reference for reader behavior, no second discovery engine |
| [SpecLens](https://github.com/dansreis/speclens/blob/main/README.md) | Selected-text comments, SQLite persistence and Markdown export | Tauri/React desktop stack and broader project/history features exceed browser CLI scope | Reference for comment/export interaction |

[Lavish's package](https://github.com/kunchenguid/lavish-axi/blob/main/package.json) includes Express, WebSockets, file watching and design styling dependencies. A thin adapter saves some annotation UI work but still requires the core correctness work. [Recogito's package](https://github.com/recogito/text-annotator-js/blob/main/packages/text-annotator/package.json) similarly does not remove that requirement. These comparisons justify a narrow custom selection contract; they do not establish smaller install bytes, faster runtime or token savings.

### Runtime and rendering

Propose an npm CLI package with a Node.js LTS prerequisite, an externally installed compatible OpenSpec CLI and bundled local browser assets. Start from a local checkout; validate packaging before proposing registry publication. Do not silently install OpenSpec or invoke a floating remote package. No framework, database, worker service or global process is needed. Use subprocess argument arrays, never shell interpolation.

Use [Markdown AST tooling](https://github.com/remarkjs/remark/blob/main/readme.md) for CommonMark plus GFM lists, task lists and tables. Preserve parser offsets; render a restricted AST to DOM with escaped text and allowed elements/URLs. Do not hand-parse OpenSpec requirements or task status. Mermaid and other code fences remain selectable code. Raw HTML remains escaped text, remote images are not fetched, and links require explicit navigation. The source view shows exact Markdown with line references.

Rendered text is not byte-identical to Markdown. Each selectable leaf maps to its enclosing source span, with projected rendered text retained separately. For plain unescaped text, map selection boundaries exactly; otherwise record the enclosing source span and label its precision. Cross-block/ambiguous selections use the source view instead of inventing exact offsets. Source-view selection always anchors exact text. Store offsets as half-open UTF-16 indices in the strictly decoded UTF-8 document, without newline normalization; include the selected raw source slice. Hash original bytes with SHA-256. Test escapes, entities, CRLF, Unicode, inline emphasis and repeated text before broadening rendered selection.

### Discovery and worktree contract

Proposed interface: `spectater open --project <directory> --change <id> [--store <id>] [--no-open]`. From the explicit project cwd, run native `openspec context --json`, `openspec list --json`, then `openspec status --change <id> --json`, preserving the explicit store selector on every applicable call. Do not follow context members, enumerate sibling worktrees or create/register stores. Display the resolved root and source before serving a change. Refuse implicit/global-default root selection unless the operator explicitly selects that store.

Use returned `changeRoot`, `schemaName`, `artifacts` and `artifactPaths.*.existingOutputPaths`. Status already resolves globs: no copied glob/schema engine or hardcoded proposal/design filenames. Show missing/skipped artifacts and native diagnostics; do not reinterpret planning completion as approval. Render Markdown paths; show unsupported artifact types without executing them. [OpenSpec 1.15.0 status contracts](https://github.com/Fission-AI/OpenSpec/blob/v1.15.0/src/core/artifact-graph/instruction-loader.ts) expose these fields. [Its root selector](https://github.com/Fission-AI/OpenSpec/blob/v1.15.0/src/core/root-selection.ts) handles nearest roots, declared stores and global fallback.

Use canonical resolved root plus canonical change path as review identity, never branch name or change slug alone. Different worktrees with the same slug stay separate. A shared store intentionally resolves to one planning identity. Do not remap on rename or relocate automatically. Missing CLI, unsupported version/JSON, invalid metadata, no change, native errors and missing root cause actionable failure before opening a browser; no guessed parser fallback. Bound subprocess output/time and preserve native error diagnostics.

### State and revision contract

Store under the user's platform application-state directory, keyed by a hash of canonical root/change identity; neither browser storage nor Git HEAD is authoritative. Working files can be uncommitted. State is private, outside repositories, with owner-only permissions where supported. Fail visibly if private storage cannot be established. One writer per review identity; a second writer exits with a diagnostic, not lock stealing. Persist through same-directory temporary write and atomic rename; acknowledge only durable writes. A crash leaves the previous valid state; corrupt/unknown formats are preserved and rejected, never silently reset.

Version-1 records:

| Record | Required fields |
| --- | --- |
| Review | formatVersion, reviewId, canonical root/change identity, schemaName, ordered document IDs |
| Document snapshot | relative path, original-byte SHA-256, immutable UTF-8 source, rendererVersion |
| Comment | id, document ID/hash, source start/end and slice, rendered quote, prefix/suffix, precision, body, created time, open/resolved state |
| Batch | id, reviewId, monotonically increasing sequence, submitted time, immutable comment entries and document hashes |

Every read/refresh hashes the selected files; cache rendering only by document hash and renderer version. Recheck hashes on comment save and batch submission. If a document changed since the displayed revision, reject the stale write, preserve the draft in the UI and offer refresh. Do not acknowledge a comment against bytes the operator did not review.

Same hash means current. On changed bytes, every prior comment is stale even if its quote still exists. A uniquely matching source slice plus context may suggest a new location, but requires explicit reattachment and keeps the original anchor. No match or multiple matches is orphaned; removed files remain visible as orphaned. Old snapshots retain the context needed to read those comments. No automatic reattachment, fuzzy search or line-number-only matching. Closing/resolving comments does not alter submitted batches. State persists until explicit operator removal; automatic retention cleanup is outside the initial slice.

### Feedback and integration

Browser Submit durably creates a batch and displays its receipt. It does not send keystrokes, contact an agent API or claim the conversation received it. Proposed command `spectater feedback --review <id> --batch <id> --format markdown` prints that exact batch; JSON output exposes the same fields. A short copyable instruction identifies the CLI command. Include relative file paths, original hashes, precision, line references derived from snapshots, selected source and comment bodies; exclude absolute workstation paths and whole unchanged documents. Treat feedback text as untrusted review data, never executable commands. Clipboard denial has a selectable-text/download fallback.

The agent reads the batch in the existing conversation, revises canonical Markdown within its existing authorization, then explicitly reopens/refreshes the review. No new agent or model invocation. Submission and reading do not mark comments addressed or approve proposed work. Repeat reads of one batch are identical, allowing safe retries without destructive consume semantics.

[Project configuration](https://openspec.dev/docs/project-config) injects guidance through `openspec instructions`; [customization](https://openspec.dev/docs/customize) distinguishes configuration, profiles and schemas. Neither establishes a guaranteed draft-completed event. Proposed optional on-demand workflow instruction: after requested artifacts are written and validated, call the explicit open command with the current project and change ID. This depends on the agent following instructions. A standalone manual command provides deterministic invocation; no claim of universal automatic opening across arbitrary workflows. No hooks or schema fork are necessary.

### Local browser and filesystem boundary

Bind only `127.0.0.1` on an OS-assigned port. After server readiness, invoke the platform opener with an argument array and exact review route. Print a usable fallback URL if opening fails; `--no-open` skips the attempt. Proposed initial platform target is macOS; Linux/Windows openers remain unclaimed until exercised. The process ends on explicit stop or interrupt, closes the listener and preserves review state. It never starts at login.

Use an unpredictable per-process capability in the URL fragment, exchange it for request authorization without logging it, and remove it from the visible fragment after bootstrap. Bind requests to the selected review; check exact Host, Origin for mutations, authorization, JSON content type and bounded bodies; disable CORS. Apply CSP restricting assets/connections to this origin, block framing, and use no-referrer/no-store headers. Reject foreign origins, cross-site form posts, forged hosts and missing capability even on loopback. This is local process isolation, not a hosted authentication service.

Browser routes accept opaque document IDs, never arbitrary paths. Build a fixed manifest from native discovery; canonicalize every file and reject symlinks/path traversal escaping the selected change. Revalidate boundaries at reads, and fail on identity changes; reject non-regular files. No generic file server, shell endpoints, external asset loads or browser source writes. Local users able to modify this process or its files are outside this boundary.

## Risks / Trade-offs

- Mapping rendered text can be lossy → label enclosing spans and require source-view selection when exact mapping is unavailable; prove the vertical slice before expansion.
- Native CLI JSON can evolve → capability/version checks and fail-closed contract fixtures; initial baseline is 1.15.0 only.
- Browser opening/instruction following can fail → exact manual command and URL fallback; do not call this guaranteed integration.
- Snapshot persistence retains reviewed text → private local storage and explicit removal; no uploads, telemetry or public evidence dumps.
- Atomic local persistence does not provide shared collaboration → one writer per identity; concurrent browser writes use a state revision precondition and conflicts retain drafts.

## Migration plan and acceptance commands

No deployment/migration applies to this planning change. Future implementation starts only after operator authorization, in this order:

1. One local change: native discovery, safe rendered/source reading, exact plain-text comment, durable submit, CLI retrieval, external Markdown revision and stale/orphan display. Include source-write and foreign-origin rejection in this slice.
2. Expand mapping fixtures, custom schemas/store selection/worktree isolation and recovery behavior. Unsupported cases remain explicit until exercised.
3. Add the optional workflow instruction, opener fallback and local package-install smoke. Propose distribution separately after evidence.

Proposed future commands below are acceptance interfaces to implement, not existing scripts or executed evidence:

| Command | Required proof |
| --- | --- |
| `npm ci` | Reproducible approved lockfile; only after dependency authorization |
| `npm test` | Built-in Node tests for discovery errors/schema paths, offsets/revisions, batches, persistence/conflicts, manifest traversal, Host/Origin/capability checks and safe rendering |
| `npm run test:browser` | Automated local browser vertical slice, revision refresh, denied clipboard/opener and malicious Markdown; no external navigation or canonical writes |
| `npm run test:package` | Build local tarball, inspect file allowlist and install into temporary prefix without global mutation; invoke installed help and the fixture review loop |
| `npm run smoke -- --fixture local-review --no-open` | Start/stop owned loopback process; expose readiness separately from completed browser acceptance |
| `openspec validate local-change-review --type change --strict --no-interactive --json` | Valid planning contracts |
| `git diff --check` | Clean patch whitespace |

The implementation gate must record selected Node/OpenSpec/browser versions, exact fixture/test files and actual commands/results in its mission ledger. Exercise macOS browser opening once in an authorized owned runtime and report human visual verification separately. Stop/delete only test-owned temporary data; uninstalling a local package does not delete user reviews. No application tests, dependency installation, runtime performance measurements or savings measurements were performed for this proposal.
