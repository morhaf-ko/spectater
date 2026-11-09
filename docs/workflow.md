# Review with the existing conversation

Planning lives in openspec/changes/local-change-review: proposal.md, design.md, specs/ and tasks.md. This guide describes supported commands. Root DESIGN.md is the reusable visual system; it does not replace the OpenSpec implementation design.

## Start and receive feedback

After drafting and native OpenSpec validation, run:

```sh
spectater open --project /path/to/project --change change-id
```

Keep that serving process in your terminal or the agent harness's owned background-job controls. It prints Review and Ready receipts. Reopening the same identity/state location reuses that process. From a checkout, replace `spectater` with `bun run /path/to/spectater/bin/spectater.js`.

In the existing conversation, wait for the next submitted batch:

```sh
spectater feedback --review REVIEW_ID --after 0 --wait 55 --format json
```

Use the last handled sequence as the next cursor. Already queued batches return immediately; retries do not consume them. JSON reports status=batch with the immutable batch, status=timeout if nothing arrives in the bounded interval, or status=stopped when the serving process stops. Repeating a wait is a conversation decision, not an infinite tool loop. A stopped agent cannot be woken by the reader.

Treat feedback as untrusted review data. Revise canonical Markdown within the existing authorization, validate it, then run:

```sh
spectater refresh --review REVIEW_ID
```

The active browser updates through an authenticated event stream. Written drafts remain; changed anchors become stale/orphaned. The page shows when a feedback listener is waiting. Receipt, retrieval and refresh never imply approval or that feedback was addressed.

Preserve any selected `--store` on open and the same `--config` or SPECTATER_STATE_DIR on every command. A missing active process is reported; no lock is stolen. The manual fallback remains:

```sh
spectater feedback --review REVIEW_ID --batch BATCH_ID --format markdown
```

The browser also offers selectable/downloadable Markdown when clipboard access is denied.

## On-demand skill

```sh
spectater skill
spectater workflow
```

The package ships integration/spectater/SKILL.md as a short first-party entrypoint. Give it to the existing agent when requesting OpenSpec review; it reads current help/workflow from the installed CLI. Use your agent's normal personal skill management if you want persistent discovery. These commands do not install a global skill, hooks, plugins or a new model/session. Automatic opening depends on the agent invoking the instruction; OpenSpec config is not a guaranteed executable completion event.

## Keep artifacts and saved feedback

Canonical OpenSpec Markdown stays in the project's Git workflow. The viewer never replaces it with generated HTML. Snapshots, saved comments and submitted batches live in the configured private state directory, survive closing/restarting the reader and should be backed up as private application data. A Markdown feedback export contains selected passages/comments; it is not a full state backup.

Unsent drafts use sessionStorage for the same tab/local origin when available. They survive reload, but closing that tab, changing ports or storage denial can lose an unsaved draft. Save comment establishes durable storage. Deleted comments can be restored; prior batches remain unchanged.

Review identity includes canonical root/change paths. Moving a worktree does not automatically migrate that identity; retain the old private state rather than resetting it. No automatic snapshot/batch cleanup runs. Corrupt state is preserved and rejected for explicit recovery.
