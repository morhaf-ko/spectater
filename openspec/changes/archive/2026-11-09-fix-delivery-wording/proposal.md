# Proposal

## Why

The "Correctable undelivered feedback" requirement still says withdrawn batches are skipped by "cursor delivery". Since agent-ready-cli, the server tracks delivery and agents pass no cursor (issue #8).

## What changes

- Reword the requirement to say the server's delivery skips cancelled, editing and superseded batches. Behaviour is unchanged.

## Capabilities

### Modified capabilities

- `workflow-handoff`: wording of "Correctable undelivered feedback".

## Impact

Specification text only.
