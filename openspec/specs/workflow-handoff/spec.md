# workflow-handoff Specification

## Purpose

Connect local OpenSpec review to the conversation already drafting a change without transferring workflow ownership or approval authority.

## Requirements

### Requirement: Explicit review completion

The system SHALL persist an ended review state and require explicit operator resumption before accepting further feedback. Ending MUST preserve saved history, refuse abandonment of queued or paused submissions, and return an ended result to waiting CLI listeners. It MUST NOT stop a model or imply approval. Already delivered work MAY post a result after review completion.

#### Scenario: End a review

- **WHEN** the operator ends a review with no undelivered submissions
- **THEN** feedback mutations become read-only, saved data remains readable and waiting agents receive ended guidance to stop listening without reopening uninvited

#### Scenario: Outstanding feedback

- **WHEN** the operator attempts to end with queued or paused submissions
- **THEN** the reader asks them to deliver or cancel those submissions without discarding their contents

#### Scenario: Resume explicitly

- **WHEN** the operator selects Resume review or opens with --reopen
- **THEN** the same review resumes against validated current source while ordinary open/restart never silently clears completion

### Requirement: Correctable undelivered feedback

The system SHALL allow cancellation and editing of a submitted batch only before durable delivery handoff. Delivery claims and queue changes MUST serialize through the owning writer. Editing MUST pause delivery until explicit replacement submission. Cancelled, editing and superseded batches MUST be skipped by cursor delivery while their original contents remain available as explicit historical exports. Claimed batches MUST NOT be presented as cancellable or interrupted.

#### Scenario: Cancel races with delivery

- **WHEN** cancellation and CLI retrieval target the same queued batch
- **THEN** one serialized transition wins: cancellation prevents delivery, or durable handoff prevents cancellation, without claiming feedback was recalled

#### Scenario: Edit queued feedback

- **WHEN** the operator edits an undelivered batch
- **THEN** delivery pauses durably, saved comments can be corrected or removed, and explicit update creates a new immutable batch linked from the superseded original

#### Scenario: Offline retrieval

- **WHEN** no owning reader is running
- **THEN** previously handed-off batches remain repeatably readable, pending delivery requires reopening, and an explicit historical export never claims current delivery or receipt

### Requirement: Observed delivery and explicit agent replies

The system SHALL distinguish saved feedback with no listener, queued feedback, CLI receipt, an agent's explicit working report and an agent's explicit reply. Activity MUST persist separately from immutable submitted batch contents. It MUST NOT infer addressed feedback, implementation approval or model execution from file changes alone.

#### Scenario: Submit without a listener

- **WHEN** the operator submits a batch while no feedback CLI is waiting
- **THEN** the reader confirms durable saving and explains that the existing agent must resume listening without losing the batch

#### Scenario: Receive and report work

- **WHEN** the CLI receives a batch and the existing agent explicitly reports working or posts a reply
- **THEN** the browser shows those observed states and reply text without altering the submitted batch

#### Scenario: Retry or restart

- **WHEN** feedback retrieval/reply acknowledgement is retried or the reader restarts
- **THEN** existing batch data and recorded activity remain available without duplicate identical terminal replies

### Requirement: Bounded feedback waiting

The system SHALL let the existing conversation wait for the next immutable submitted batch after an explicit sequence cursor. It MUST deliver already queued batches, retain them across listener disconnects and restarts, bound each wait to at most 55 seconds and report timeout explicitly. Retrieval MUST NOT consume batches or imply that their contents were addressed.

#### Scenario: Feedback submitted while waiting

- **WHEN** an authorized local CLI waits after a known sequence and the operator submits feedback
- **THEN** the wait returns the next durable batch to that CLI without starting or controlling an agent

#### Scenario: No listener or retry

- **WHEN** a batch is submitted before a listener starts or that listener disconnects
- **THEN** the same cursor can retrieve the retained batch on a subsequent call

#### Scenario: Bounded timeout

- **WHEN** no newer batch arrives within the requested wait budget
- **THEN** the command returns an explicit timeout result without deleting data or continuing indefinitely

### Requirement: Active review continuity

The system SHALL reuse a running review for the same canonical identity and private state location. It SHALL let an authorized local CLI refresh that process after canonical Markdown changes and notify connected readers. It MUST keep the one-writer invariant, preserve unsaved text, and reconcile stale/orphaned anchors without treating a refresh as approval.

#### Scenario: Agent revises the plan

- **WHEN** the existing conversation revises and validates Markdown and invokes refresh for the review
- **THEN** connected readers display the new source and retained feedback without a second server or writer

#### Scenario: Open an existing review

- **WHEN** open selects an identity already served from the same state location
- **THEN** the command returns that active review rather than creating another writer

### Requirement: On-demand skill delivery

The system SHALL ship a small first-party skill entrypoint which delegates current commands and the review loop to the installed CLI. It MUST preserve explicit project/change/store/state selections and existing conversation authorization. Providing the skill MUST NOT install hooks, register plugins or mutate personal agent configuration implicitly.

#### Scenario: Skill reads current guidance

- **WHEN** an existing agent loads the tool's supplied skill
- **THEN** it discovers open, bounded wait and refresh usage from the CLI and stays in the same conversation

### Requirement: Exact-change opening

The system SHALL attempt to open the selected review route only after local readiness, unless no-open mode is selected. It MUST print a usable local URL on opener failure and report discovery failure before opening a browser.

#### Scenario: Normal invocation

- **WHEN** the operator invokes the open command with an explicit project and change
- **THEN** the browser attempt targets that exact change after the listener is ready

#### Scenario: Readable review address

- **WHEN** the tool opens a selected change
- **THEN** its URL path uses the encoded change name, internal identity still isolates canonical roots/worktrees, and capability authorization remains required for review data

#### Scenario: Browser unavailable

- **WHEN** the platform opener fails or no-open mode is selected
- **THEN** the process preserves the ready review and prints its manual access URL

### Requirement: On-demand workflow convenience

The system SHALL provide an optional instruction for an existing proposal workflow to invoke the explicit open command after drafting and validation. It MUST disclose instruction-following dependence and MUST NOT require global hooks, a background scanner or a new agent session.

#### Scenario: Agent follows the instruction

- **WHEN** an integrated workflow finishes the requested artifacts and invokes the open command
- **THEN** review opens at its supplied change without changing the conversation owner

#### Scenario: Workflow does not invoke the command

- **WHEN** an agent omits the optional instruction
- **THEN** manual invocation remains available and the integration does not claim that automatic opening occurred

### Requirement: Explicit feedback retrieval

The system SHALL let the operator copy or export a batch and let the existing agent retrieve an explicit review/batch identifier as Markdown or JSON. Exports MUST contain relative source references and revision identity without absolute workstation paths or automatic conversation delivery.

#### Scenario: Copy unavailable

- **WHEN** clipboard access is denied
- **THEN** selectable text or a downloadable export remains available

#### Scenario: Existing conversation reads a batch

- **WHEN** the agent invokes retrieval for an existing review and batch
- **THEN** it receives concise selected-source feedback and hashes without starting another model or consuming the batch destructively

#### Scenario: Unknown batch

- **WHEN** retrieval names an unknown review or batch
- **THEN** the command fails explicitly rather than returning another review's latest feedback

### Requirement: Approval separation

The system MUST NOT interpret comments, submission, artifact status or task completion as implementation, merge or production approval. It SHALL leave revision execution and authorization to the existing operator/conversation workflow.

#### Scenario: Planning complete

- **WHEN** native OpenSpec reports all planning artifacts complete or the operator submits a batch
- **THEN** the reader records only planning/review state and does not apply code, merge, deploy or mark feedback addressed
