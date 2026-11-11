## MODIFIED Requirements

### Requirement: Durable private review state

The system SHALL persist acknowledged comments and batches privately outside canonical source and browser storage. It MUST detect conflicting writers and preserve valid state on interrupted writes; corrupt or unsupported state MUST produce a visible error without silent replacement.

#### Scenario: Restart

- **WHEN** the process restarts after acknowledging a saved comment or batch
- **THEN** the same planning identity loads the acknowledged data

#### Scenario: Concurrent or failed write

- **WHEN** another writer conflicts, persistence fails or stored data is invalid
- **THEN** the operation reports failure without false acknowledgement, discarding prior valid data or overwriting another writer

#### Scenario: Windows storage

- **WHEN** the state directory is outside the user profile on Windows
- **THEN** opening the review fails with an error naming the profile requirement and writes no state
