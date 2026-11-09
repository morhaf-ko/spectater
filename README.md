# SpecTater

Read and comment on one local OpenSpec change. Markdown stays authoritative; feedback and source snapshots persist privately outside the repository.

## Run

Use Bun 1.4.4 and OpenSpec 1.16.1 (also verified: 1.15.0). OpenSpec retains its upstream Node prerequisites; Node 24 is tested. Native Git enables optional source comparisons.

```sh
bun install --frozen-lockfile --ignore-scripts
bun run bin/spectater.js open --project /path/to/project --change change-id
```

For the published package, install with `bun add --global spectater@0.1.0` and use `spectater` instead of the checkout launcher. Automatic opening is implemented for macOS; elsewhere use `--no-open` and the printed URL. The URL uses the change name; its secret fragment disappears after opening. Keep the initial link private. Ctrl-C stops the server without deleting saved feedback.

## Review

1. Read rendered Markdown or exact Source. Select text to open the comment popover. Selections across formatting/paragraphs use labeled enclosing-source precision.
2. Save comments, then submit new or changed feedback. A listening agent receives the batch; otherwise it stays queued.
3. Before delivery, Edit queued pauses a batch for correction and explicit replacement. Cancel submission preserves its comments. After delivery, Send correction creates new feedback without recalling instructions.
4. Source saves update the reader automatically. Old comments become stale/orphaned; reattachment is explicit. What changed compares the latest source update with the previous one, including added/removed files.
5. End review preserves read-only history and tells a waiting agent to stop listening. Deliver or cancel queued batches first. Resume review or `open --reopen` explicitly resumes; a normal open does not silently restart an ended review.

The sun/moon button initially follows your system. Details restores System appearance. Metadata, withdrawn history and copy/download use collapsed disclosures. Draft text may recover in the same tab; save comments for durable storage.

Submission, replies, task completion and End review never grant implementation, merge or deployment approval. SpecTater does not start, interrupt or wake models. See [the existing-conversation workflow](docs/workflow.md) for bounded waiting, replies and the supplied on-demand skill.

## Preferences and storage

No config is required. Defaults are rendered view, a browser-opening attempt and private platform storage. An optional JSON file at `$XDG_CONFIG_HOME/spectater/config.json` (otherwise `~/.config/spectater/config.json`) may contain:

```json
{
  "defaultView": "source",
  "openBrowser": false
}
```

`stateDirectory` optionally selects an absolute private path. `--config` overrides `SPECTATER_CONFIG`, which overrides the default config path; `SPECTATER_STATE_DIR` overrides the storage preference. `--no-open` always suppresses opening. Repo content cannot configure the process. Invalid settings fail visibly.

Storage defaults to `~/Library/Application Support/SpecTater` on macOS and `$XDG_STATE_HOME/spectater` (otherwise `~/.local/state/spectater`) on Linux. Back it up separately from Git; feedback exports are not full state backups. Corrupt state is preserved, and conflicting writers are refused. After a crash, verify the recorded writer has stopped before explicitly removing its lock. Moving a worktree or changing storage does not migrate review identity automatically.

## Boundaries

Native OpenSpec selects the root, schema and artifact paths, including declared/explicit stores and isolated worktrees. Unselected global stores are refused. Only that selected change is observed; there is no polling scanner, account, hosted backend or installed hook.

Raw HTML and diagrams remain inert; remote images do not load. Relative links do not navigate. Unmapped selection boundaries require Source. Limits are 1 MiB/file, 128 artifacts, 16 MiB current source, 64 MiB private state, 10,000 characters/selection or comment, and 256 observed directories. Git comparisons are bounded to 3 seconds/256 KiB output.

macOS and Linux storage/IPC/browser flows are exercised. Automatic opening is macOS-only; Linux prints the manual URL. Windows storage/IPC/opening are unsupported. See [security](SECURITY.md), [the security pass](docs/security-review.md) and [verification](docs/verification.md).

## Development

```sh
bun run check
```

This runs Biome formatting/import/lint checks, contract/browser/package tests, the owned smoke, strict OpenSpec validation, whitespace checks and dependency audit. Use `bun run format` to apply Biome fixes. Install Chrome with `bun run playwright install chrome` if absent. Package installation and dependency audit require registry access. `bun run benchmark` measures an isolated fixture; add `-- --project . --change local-change-review` for a full change.

The public CI workflow pins its actions and uses repository runner variables configured for isolated GitHub-hosted runners. The same-repository condition limits automatic execution; it is not a runner security boundary. Renovate is the sole update producer; automatic merges remain disabled pending reporting and required checks.

Requirements/design/tasks live in [the OpenSpec specs](openspec/specs/); [DESIGN.md](DESIGN.md) contains reusable visual tokens. MIT license; see LICENSE.
