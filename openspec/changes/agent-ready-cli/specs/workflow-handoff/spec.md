## ADDED Requirements

### Requirement: Detached review server

The system SHALL start the review server as a detached process from `open` and return once it is ready. It SHALL record the server's port and an agent token in a private owner-only file in the state directory. The server MUST stop after a configurable idle period with no browser connection and no listener, and on an explicit stop command. A recorded server whose process no longer exists MUST be replaced on the next open.

#### Scenario: Open returns

- **WHEN** an agent runs open for a change with no running server
- **THEN** the command prints the review URL and exits while the server keeps running

#### Scenario: Idle shutdown

- **WHEN** no browser is connected and no listener waits for the idle period
- **THEN** the server stops, releases its writer lock and keeps saved feedback

### Requirement: Change-name addressing

The system SHALL address every agent command by project directory and change name, defaulting the project to the current directory. It MUST resolve the internal review identity through native discovery and MUST NOT require the agent to supply a review identifier or sequence cursor.

#### Scenario: Agent uses the change name

- **WHEN** an agent runs wait, reply, refresh, end or stop with a change name from inside the project
- **THEN** the command targets the same review that open started

### Requirement: Structured agent results

The system SHALL print exactly one JSON object on stdout for each agent command, with a `status` from a fixed set and a `next_step` sentence. Distinct non-success outcomes MUST use distinct documented exit codes.

#### Scenario: Ended review

- **WHEN** wait returns because the reviewer ended the review
- **THEN** stdout holds `status` ended with a next step to stop waiting and not reopen uninvited

### Requirement: Single feedback listener

The system SHALL allow one waiting listener per review. A second wait MUST fail with `listener_active` unless it requests takeover, in which case the previous listener MUST return `listener_replaced`.

#### Scenario: Two agents wait

- **WHEN** a second wait starts while another is waiting, without takeover
- **THEN** it fails with listener_active and the first listener keeps waiting

### Requirement: Open review listing

The system SHALL list open reviews with their change, project, URL, listener presence and next command when run with no arguments.

#### Scenario: No arguments

- **WHEN** a user runs the CLI with no arguments
- **THEN** it lists open reviews, or states that none are open, followed by short usage

### Requirement: Opt-in session hooks

The system SHALL provide a setup command that adds a SessionStart hook for each detected supported agent (Claude Code, Codex, OpenCode, GitHub Copilot CLI) and a matching removal command. The hook MUST only print open reviews for the current project and MUST NOT block, wake or control the agent. Setup MUST be idempotent, report each agent separately and never run implicitly.

#### Scenario: Setup twice

- **WHEN** the user runs hook setup twice
- **THEN** each agent configuration contains one SpecTater hook entry

#### Scenario: No open review

- **WHEN** a session starts in a project with no open review
- **THEN** the hook prints nothing

## MODIFIED Requirements

### Requirement: Bounded feedback waiting

The system SHALL let the existing conversation wait for the next deliverable batch, tracking delivery on the server. It MUST deliver already queued batches, return the same claimed batch again until the agent replies, retain batches across listener disconnects and restarts, bound each wait by a timeout that defaults below ten minutes, and report timeout explicitly. Retrieval MUST NOT imply that feedback was addressed.

#### Scenario: Feedback submitted while waiting

- **WHEN** an agent waits and the reviewer submits feedback
- **THEN** the wait returns that batch without starting or controlling an agent

#### Scenario: No listener or retry

- **WHEN** a batch is submitted before a listener starts or that listener disconnects
- **THEN** the next wait returns the retained batch

#### Scenario: Agent restarts before replying

- **WHEN** an agent receives a batch, stops without replying, and waits again
- **THEN** the wait returns the same batch

#### Scenario: Bounded timeout

- **WHEN** no batch arrives within the timeout
- **THEN** the command returns timeout with a next step to wait again, without deleting data

### Requirement: Active review continuity

The system SHALL reuse a running server for the same review identity and state location. It SHALL let the agent refresh the review after Markdown changes and notify connected readers. It MUST keep the one-writer invariant, preserve unsaved text and reconcile stale or orphaned anchors without treating a refresh as approval.

#### Scenario: Agent revises the plan

- **WHEN** the agent revises Markdown and the server observes the change or refresh is invoked
- **THEN** connected readers show the new source and retained feedback without a second writer

#### Scenario: Open an existing review

- **WHEN** open selects a review whose server is running
- **THEN** the command returns that server's URL instead of starting another

### Requirement: On-demand skill delivery

The system SHALL ship a short skill installable with `npx skills add` that tells the agent to read current guidance from `npx -y spectater workflow`. Installing the skill MUST NOT install hooks, register plugins or change agent configuration.

#### Scenario: Skill reads current guidance

- **WHEN** an agent loads the skill
- **THEN** it reads open, wait, reply and end usage from the CLI and stays in the same conversation

### Requirement: Exact-change opening

The system SHALL open the review URL in the default browser after the server is ready, on macOS and Linux, unless no-open mode is selected. It MUST print the URL in every case and report discovery failure before opening a browser.

#### Scenario: Normal invocation

- **WHEN** an agent runs open with a change name
- **THEN** the browser attempt targets that change after the server is ready

#### Scenario: Readable review address

- **WHEN** the tool opens a selected change
- **THEN** its URL path uses the encoded change name and capability authorization remains required for review data

#### Scenario: Browser unavailable

- **WHEN** the platform opener fails or no-open mode is selected
- **THEN** the server stays ready and the printed URL works

### Requirement: Explicit feedback retrieval

The system SHALL let the reviewer copy or download a batch and let the agent read a numbered batch of a change as JSON or Markdown from saved state, without recording delivery and without a running server. Exports MUST contain relative source paths and revision hashes without absolute workstation paths.

#### Scenario: Copy unavailable

- **WHEN** clipboard access is denied
- **THEN** selectable text or a downloadable export remains available

#### Scenario: Existing conversation reads a batch

- **WHEN** the agent reads a batch of an existing review
- **THEN** it receives the selected source, comments and hashes without starting another model or deleting the batch

#### Scenario: Unknown batch

- **WHEN** retrieval names a batch number that does not exist
- **THEN** the command fails explicitly
