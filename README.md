# SpecTater

A local browser companion for reading and commenting on OpenSpec changes. Canonical Markdown stays authoritative; SpecTater stores feedback separately and never edits source.

## Run locally

Use stable Bun 1.4.4 and OpenSpec 1.16.1. The native JSON contract is also verified against OpenSpec 1.15.0. Other versions fail explicitly. OpenSpec retains its upstream runtime prerequisites.

```sh
bun install --frozen-lockfile --ignore-scripts
bun bin/spectater.js open --project /path/to/project --change change-id
```

For a checkout's development CLI, `bun run` puts the pinned development OpenSpec executable on PATH:

```sh
bun run bin/spectater.js open --project /path/to/project --change change-id --no-open
```

No registry release is published by these instructions. Automatic browser opening is implemented for macOS; use `--no-open` and the printed URL elsewhere. Keep that capability URL private. Stop with Ctrl-C; saved feedback survives restart.

## Review loop

1. Read the selected change's native artifact list and rendered or exact source view.
2. Select text, type in the popover and save a comment. Rendered selections show exact or enclosing-span precision; use Source for selections across spans or blocks.
3. Submit a batch. Copy its retrieval command into the existing conversation, or copy/download its Markdown export.
4. Have the existing agent read the explicit batch and revise Markdown within its existing authorization.
5. Refresh source. Old comments become stale or orphaned; reattachment is explicit and preserves original anchors. Submitted batches remain unchanged.

```sh
bun bin/spectater.js feedback --review REVIEW_ID --batch BATCH_ID --format markdown
```

Submission does not send feedback to an agent, resolve comments or approve implementation, merge or deployment. See [workflow integration](docs/workflow.md).

## Appearance

The reader follows the Clean design system. The sun/moon button starts by following your OS preference. Click it to switch light/dark; **Use system theme** under **Details** restores automatic appearance. The choice survives reloads for that local origin. A new server port starts with System. No theme setup or dependencies are needed.

Artifact metadata is under **Details**. Select text to open a focused comment popover; saved comments appear in the sidebar, where you can edit, resolve or delete them. Deletion has Undo and a restore list. Submitted batches remain immutable. Drafts can resume after a reload in the same tab when browser storage is available; save comments for durable storage. Batch export appears after submission or opening a saved batch. The interface uses the native Apple system font stack and a local vector potato logo, with no font downloads.

## Configuration

No configuration file is required. Defaults are rendered view, automatic browser-opening attempt and private platform review storage. An optional JSON file at `$XDG_CONFIG_HOME/spectater/config.json` (otherwise `~/.config/spectater/config.json`) can override preferences:

```json
{
  "defaultView": "source",
  "openBrowser": false
}
```

`stateDirectory` optionally selects an absolute private storage path. `--config <file>` overrides `SPECTATER_CONFIG`, which overrides the default config path. `SPECTATER_STATE_DIR` overrides the configured storage location. `--no-open` always suppresses opening. Missing default config uses built-in defaults; invalid settings or explicitly selected missing files produce an actionable error. Repo content cannot configure the process. Security boundaries are fixed.

Review storage defaults to `~/Library/Application Support/SpecTater` on macOS and `$XDG_STATE_HOME/spectater` (otherwise `~/.local/state/spectater`) on Linux. Reviews remain until you explicitly remove their state. Storage has a 64 MiB per-review limit and fails visibly instead of evicting context. Moving storage does not migrate reviews automatically. After a crash, inspect the writer lock and verify its process has stopped before explicitly removing that lock. Never remove a live writer's lock.

## Compatibility and boundaries

The reader uses native root/schema/status discovery, including custom artifact paths, explicit/declared stores and isolated worktree identities. It does not scan siblings or follow context members. Global-default stores require explicit selection.

Markdown uses CommonMark/GFM parsing. Raw HTML and diagrams remain inert, remote images do not load and relative document links have no navigation route. Rendered selections spanning multiple source leaves require Source view. Files must be strict UTF-8 and no larger than 1 MiB; one review allows 128 artifact paths and 16 MiB of current source.

The server binds `127.0.0.1` with capability authorization, Host/Origin checks and a fixed manifest. Review storage is private and outside the repository. macOS is the exercised platform. Linux permissions and manual opening are implemented but remain unverified on Linux; Windows private storage and browser opening are unsupported. See [security](SECURITY.md) and [verification](docs/verification.md).

There are no accounts, hosted services, embedded models, hooks, source editing or agent lifecycle control.

## Development

```sh
bun run test
bun run test:browser
bun run test:package
bun run smoke -- --fixture local-review --no-open
bun run benchmark
bun run benchmark -- --project . --change local-change-review
```

Browser checks use a dedicated headless installed Chrome channel. Package checks create a local tarball and temporary offline install; fill Bun's package cache through the normal install first. No global install or publication occurs.

Renovate inherits the shared preset in `renovate.json`. A stricter local override keeps automatic merges disabled until remote validation is reporting and required. No Dependabot update producer is configured.

## License

MIT. See LICENSE.
