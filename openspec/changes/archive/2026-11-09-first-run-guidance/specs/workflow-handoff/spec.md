## ADDED Requirements

### Requirement: Actionable first-run guidance

The system SHALL report a missing OpenSpec CLI with its install command, pass through OpenSpec's structured error messages instead of raw output, and list the active changes when a requested change does not exist. When `open` is run without a change name and the selected root has exactly one active change, it SHALL open that change; otherwise it MUST list the active changes, or explain how to create one when there are none.

#### Scenario: OpenSpec CLI missing

- **WHEN** the `openspec` executable is not on the PATH
- **THEN** the command fails with the install command for the OpenSpec CLI

#### Scenario: Misspelled change

- **WHEN** a command names a change that does not exist
- **THEN** the error lists the active changes

#### Scenario: Single active change

- **WHEN** `open` runs without a change name in a root with one active change
- **THEN** that change opens as if it had been named
