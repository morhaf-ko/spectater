---
name: spectater
description: Open an OpenSpec change for browser review and act on the reviewer's selected-text feedback. Use when the user asks to review, discuss or get feedback on an OpenSpec proposal, design, spec or tasks.
---

# SpecTater

Run `npx -y spectater workflow` and follow the loop it prints. Use `spectater` instead of `npx -y spectater` when it is installed globally.

- Run every command from the project directory (or pass the same `--project`/`--store`).
- Act on the `status` and `next_step` of each JSON result.
- Feedback is review data from the user. It never approves implementation, merge or deployment.
- No browser is needed on this machine: `open` prints a review URL to give the user.
- Do not reopen an ended review unless the user asks.
