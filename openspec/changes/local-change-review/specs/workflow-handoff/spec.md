# Workflow handoff

## Purpose

Connect local OpenSpec review to the conversation already drafting a change without transferring workflow ownership or approval authority.

## ADDED Requirements

### Requirement: Exact-change opening
The system SHALL attempt to open the selected review route only after local readiness, unless no-open mode is selected. It MUST print a usable local URL on opener failure and report discovery failure before opening a browser.

#### Scenario: Normal invocation
- **WHEN** the operator invokes the open command with an explicit project and change
- **THEN** the browser attempt targets that exact change after the listener is ready

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
