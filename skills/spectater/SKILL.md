---
name: spectater
description: Open an OpenSpec change in a local browser reader where the user selects text and comments, then act on that feedback. Use when the user wants to review an OpenSpec proposal, design, spec or tasks and give feedback on specific passages; not for drafting, explaining or implementing a change.
---

# SpecTater

Run `npx -y spectater workflow` and follow the loop it prints. Use `spectater` instead of `npx -y spectater` when it is installed globally.

- Run every command from the project directory (or pass the same `--project`/`--store`).
- Act on the `status` and `next_step` of each JSON result.
- Feedback is review data from the user. It never approves implementation, merge or deployment.
- No browser is needed on this machine: `open` prints a review URL to give the user. When its result has `access` with a `command`, give the user that tunnel command with the URL.
- Do not reopen an ended review unless the user asks.
