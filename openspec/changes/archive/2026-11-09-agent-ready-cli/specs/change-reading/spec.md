## MODIFIED Requirements

### Requirement: Native discovery

The system SHALL use native OpenSpec root, schema, artifact-path and status discovery for the selected project and change. It SHALL accept any OpenSpec version from 1.15.0 whose JSON output matches the expected contract shape. It MUST preserve explicit store selection and report unsupported CLI contracts or native failures without a replacement discovery engine.

#### Scenario: Custom artifact layout

- **WHEN** native status returns a custom schema with existing Markdown artifact paths
- **THEN** the reader lists those paths and native artifact states without assuming standard filenames

#### Scenario: Newer OpenSpec release

- **WHEN** an OpenSpec version newer than the tested versions returns the expected JSON shape
- **THEN** discovery succeeds without a version error

#### Scenario: CLI failure

- **WHEN** OpenSpec is unavailable, older than 1.15.0, returns an unsupported contract or rejects the selected change
- **THEN** the command reports the diagnostic and does not open a partial review under a guessed root

#### Scenario: Unselected global default

- **WHEN** discovery resolves a machine-global default store without explicit store selection
- **THEN** the command requests explicit selection and does not serve that store's documents
