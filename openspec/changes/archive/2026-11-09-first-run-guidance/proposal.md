# Proposal

## Why

A first run without the OpenSpec CLI printed `OpenSpec failed: spawn openspec ENOENT`. Running outside an OpenSpec project dumped raw JSON. A misspelled change name gave no hint, and `open` required a change name even when the project had only one. Agents also skipped reviews when they had no local browser, believing spectater needs one.

## What changes

- A missing OpenSpec CLI reports the install command.
- OpenSpec's own structured diagnostics (`status[].message`) are passed through.
- An unknown change name lists the active changes.
- `open` without a change name uses the only active change, or lists them.
- The skill and workflow state that no browser is needed.
- The README documents installing the skill globally and reviewing automatically through `openspec/config.yaml` `context`.

## Capabilities

### Modified capabilities

- `workflow-handoff`: actionable first-run guidance and implicit change selection for `open`.

## Impact

CLI messages, `open` argument handling, skill and README text. No state or protocol changes.
