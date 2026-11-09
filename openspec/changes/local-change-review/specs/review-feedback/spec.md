# Review feedback

## Purpose

Preserve selected-text feedback with the exact reviewed source revision so an existing conversation can revise canonical Markdown safely.

## ADDED Requirements

### Requirement: Contextual comment composition and management
The system SHALL open a focused, non-modal comment composer near a valid text selection and show saved feedback separately. It MUST preserve unsaved text on dismissal and support editing, resolving and recoverably deleting saved comments. These operations MUST NOT alter prior submitted batches.

#### Scenario: Selection composer
- **WHEN** the operator selects supported text
- **THEN** the composer appears within the viewport with input focus, source precision and explicit save/dismiss actions

#### Scenario: Edit or delete submitted feedback
- **WHEN** the operator edits or deletes a saved comment after submitting it
- **THEN** the saved-comment list reflects the operation, deletion can be undone, and the submitted batch stays unchanged

#### Scenario: Draft reload
- **WHEN** optional tab storage is available and the operator reloads with an unsaved draft
- **THEN** its text is recoverable in that tab and a changed source revision requires a new selection before saving

### Requirement: Revision-bound selection
The system SHALL bind each comment to a document path, original-byte hash, immutable source snapshot, selected source span and comment body. It MUST distinguish exact selection from enclosing-span precision and offer source selection when rendered mapping is ambiguous.

#### Scenario: Exact source selection
- **WHEN** the operator selects text in the source view and saves a comment
- **THEN** the recorded half-open offsets and source slice identify that text in the hashed snapshot

#### Scenario: Rendered text differs from source
- **WHEN** a rendered selection contains markup transformations that prevent exact boundary mapping
- **THEN** the reader labels an enclosing source span or asks for source-view selection rather than claiming exact offsets

### Requirement: Revision conflict detection
The system SHALL recheck document revisions on comment save and batch submission. It MUST reject a write based on changed source, preserve the unsaved draft and offer refresh rather than attaching it to unseen bytes.

#### Scenario: Agent edits during review
- **WHEN** the file changes after display but before comment save or submission
- **THEN** the write fails with a revision conflict and the operator can recover the draft after refreshing

### Requirement: Conservative comment reconciliation
The system SHALL mark prior comments stale after document bytes change. Missing or ambiguous anchors MUST be orphaned. It MUST preserve original snapshots and require explicit reattachment before a comment targets the new revision.

#### Scenario: Repeated quote after edit
- **WHEN** changed source contains multiple possible matches for a prior anchor
- **THEN** the comment is orphaned and remains readable against its original snapshot without highlighting an arbitrary match

#### Scenario: Unique surviving quote
- **WHEN** changed source contains one possible matching source slice and context
- **THEN** the comment remains stale with a suggested location until the operator explicitly reattaches it

#### Scenario: Removed artifact
- **WHEN** a previously reviewed artifact is removed
- **THEN** its comments remain available as orphaned feedback with the original source context

### Requirement: Durable private review state
The system SHALL persist acknowledged comments and batches privately outside canonical source and browser storage. It MUST detect conflicting writers and preserve valid state on interrupted writes; corrupt or unsupported state MUST produce a visible error without silent replacement.

#### Scenario: Restart
- **WHEN** the process restarts after acknowledging a saved comment or batch
- **THEN** the same planning identity loads the acknowledged data

#### Scenario: Concurrent or failed write
- **WHEN** another writer conflicts, persistence fails or stored data is invalid
- **THEN** the operation reports failure without false acknowledgement, discarding prior valid data or overwriting another writer

### Requirement: Immutable submission
The system SHALL create an identified immutable batch on explicit submission and acknowledge its durable receipt. It MUST retain selected source, document hashes and comment bodies for deterministic retrieval and MUST NOT infer agent receipt, resolution or implementation approval.

#### Scenario: Retry retrieval
- **WHEN** the same submitted batch is read twice after comments or source change
- **THEN** both reads return the same submitted content and hashes

#### Scenario: Submission receipt
- **WHEN** the operator submits comments successfully
- **THEN** the reader shows a batch identifier and retrieval action without claiming that an agent has read or acted on it
