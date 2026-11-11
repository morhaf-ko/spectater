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

The system SHALL allow cancellation and editing of a submitted batch only before durable delivery handoff. Delivery claims and queue changes MUST serialize through the owning writer. Editing MUST pause delivery until explicit replacement submission. Cancelled, editing and superseded batches MUST be skipped by server delivery while their original contents remain available as explicit historical exports. Claimed batches MUST NOT be presented as cancellable or interrupted.

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

#### Scenario: Reply while file watching is unavailable

- **WHEN** the agent replies after editing Markdown and the server could not observe the edit, for example inside an agent sandbox
- **THEN** the server re-reads the change before recording the reply, so the reader shows the edits with the reply

### Requirement: On-demand skill delivery

The system SHALL ship a short skill installable with `npx skills add` that tells the agent to read current guidance from `npx -y spectater workflow`. Installing the skill MUST NOT install hooks, register plugins or change agent configuration.

#### Scenario: Skill reads current guidance

- **WHEN** an agent loads the skill
- **THEN** it reads open, wait, reply and end usage from the CLI and stays in the same conversation

### Requirement: Exact-change opening

The system SHALL open the review URL after the server is ready, on macOS, Linux and Windows, unless no-open mode is selected, launching `$BROWSER` entries without waiting for them to exit before trying the platform opener. In a remote session it MUST NOT run the platform opener. It MUST print the URL in every case and report discovery failure before opening a browser.

#### Scenario: Normal invocation

- **WHEN** an agent runs open with a change name
- **THEN** the browser attempt targets that change after the server is ready

#### Scenario: Readable review address

- **WHEN** the tool opens a selected change
- **THEN** its URL path uses the encoded change name and capability authorization remains required for review data

#### Scenario: Browser helper

- **WHEN** `$BROWSER` names an executable, as in a VS Code remote terminal, or a browser command with arguments or `%s`
- **THEN** open starts it with the review URL before the platform opener and returns while the browser keeps running

#### Scenario: Headless host

- **WHEN** open runs in a remote session without `$BROWSER`, such as on Linux without `DISPLAY` or `WAYLAND_DISPLAY`
- **THEN** no opener runs, the result reports the browser as not opened and no opener error is written

#### Scenario: Browser unavailable

- **WHEN** the opener fails or no-open mode is selected
- **THEN** the server stays ready and the printed URL works

#### Scenario: Windows desktop

- **WHEN** open runs on Windows without SSH variables
- **THEN** the default browser opens the review URL with its capability fragment intact

#### Scenario: WSL without xdg-open

- **WHEN** open runs in WSL and `xdg-open` is not installed
- **THEN** the Windows default browser opens the review URL

### Requirement: On-demand workflow convenience

The system SHALL provide an optional instruction for an existing proposal workflow to invoke the explicit open command after drafting and validation. It MUST disclose instruction-following dependence and MUST NOT require global hooks, a background scanner or a new agent session.

#### Scenario: Agent follows the instruction

- **WHEN** an integrated workflow finishes the requested artifacts and invokes the open command
- **THEN** review opens at its supplied change without changing the conversation owner

#### Scenario: Workflow does not invoke the command

- **WHEN** an agent omits the optional instruction
- **THEN** manual invocation remains available and the integration does not claim that automatic opening occurred

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

### Requirement: Approval separation

The system MUST NOT interpret comments, submission, artifact status or task completion as implementation, merge or production approval. It SHALL leave revision execution and authorization to the existing operator/conversation workflow.

#### Scenario: Planning complete

- **WHEN** native OpenSpec reports all planning artifacts complete or the operator submits a batch
- **THEN** the reader records only planning/review state and does not apply code, merge, deploy or mark feedback addressed

### Requirement: Detached review server

The system SHALL start the review server as a detached process from `open` and return once it is ready. It SHALL record the server's port and an agent token in a private owner-only file in the state directory, which on Windows MUST be inside the user profile. The server MUST stop after a configurable idle period with no browser connection and no listener, and on an explicit stop command. A recorded server whose process no longer exists MUST be replaced on the next open.

#### Scenario: Open returns

- **WHEN** an agent runs open for a change with no running server
- **THEN** the command prints the review URL and exits while the server keeps running

#### Scenario: Idle shutdown

- **WHEN** no browser is connected and no listener waits for the idle period
- **THEN** the server stops, releases its writer lock and keeps saved feedback

#### Scenario: Windows start

- **WHEN** open starts a server on Windows
- **THEN** no console window appears and the command returns once the server is ready

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

The system SHALL list open reviews with their change, project root and next command when run with no arguments. The listing MUST NOT print review URLs, because they carry the capability and hook output enters agent context.

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

### Requirement: Stable review port

The system SHALL treat a session as remote when `SPECTATER_REMOTE` says so, or, when it is unset, when SSH session variables are set, tmux was last attached over SSH, a codespace is detected, or it runs on Linux without a display outside WSL. It SHALL bind a preferred port from configuration or `SPECTATER_PORT`, or a documented default in a remote session, falling back to the next free port in a bounded range. It MUST bind only loopback and the Tailnet review URL address.

#### Scenario: Stable port across reviews

- **WHEN** a remote session opens one review, stops it and opens another
- **THEN** both use the same default port, so one existing forward reaches both

#### Scenario: Busy preferred port

- **WHEN** the preferred port is held by another review
- **THEN** the server binds the next free port in the range and reports that port

#### Scenario: Local desktop

- **WHEN** open runs on a desktop session with no SSH variables and no preferred port
- **THEN** the server keeps a random port

#### Scenario: Explicit remote override

- **WHEN** `SPECTATER_REMOTE=1` is set on a macOS host reached over SSH from a terminal multiplexer without SSH variables
- **THEN** the session is remote: the default port is used, no platform opener runs and `open` reports the tunnel command

#### Scenario: Explicit local override

- **WHEN** `SPECTATER_REMOTE=0` is set on a headless Linux host
- **THEN** the session is local and keeps a random port without an `access` object

#### Scenario: tmux attached over SSH

- **WHEN** open runs in a tmux pane without SSH variables and tmux reports `SSH_CONNECTION` for its session
- **THEN** the session is remote

#### Scenario: Other multiplexer on a desktop host

- **WHEN** open runs in a Herdr pane or another multiplexer that does not report the attached client, on a host with a display
- **THEN** the session is local unless `SPECTATER_REMOTE=1` is set

### Requirement: Remote access result

For a remote session or an applicable public URL, `open` SHALL add an `access` object to its result: a tunnel command for the port in use, a forward mode inside a container, or the public mode, and its next step MUST keep the URL and access instructions even when a browser helper ran. The system MUST NOT start, configure or require a tunnel, proxy or hosted service.

#### Scenario: Multiplexer pane

- **WHEN** open runs on a headless Linux host inside a terminal multiplexer without SSH variables
- **THEN** the result includes the tunnel command for the port in use

#### Scenario: Container

- **WHEN** open runs in a remote session inside a Docker or Podman container or a Kubernetes pod without SSH variables
- **THEN** `access` has the forward mode and port and no SSH command

#### Scenario: Helper on the wrong machine

- **WHEN** a browser opener reports success in a remote session
- **THEN** the next step still gives the reviewer the URL and access instructions

#### Scenario: WSL

- **WHEN** open runs in WSL without SSH variables or a display
- **THEN** the session is local and the result has no `access` object

#### Scenario: Local result

- **WHEN** open runs on a desktop session with no SSH variables and no public URL
- **THEN** the result has no `access` object

### Requirement: Public review URL

The system SHALL use a configured public URL when the server holds the config's `port`, or a codespace's forwarded-port URL for the port in use, for the printed review URL, and accept that host and origin. Agent commands MUST keep using loopback.

#### Scenario: Configured public URL

- **WHEN** `publicUrl` is set and the server holds the configured port
- **THEN** the printed review URL uses the public origin, the server accepts that host and origin, and agent commands keep using loopback

#### Scenario: Public URL after fallback

- **WHEN** `publicUrl` is set, the configured port is busy and Tailscale is not running
- **THEN** the review uses a fallback port with a loopback URL and `access` gives the tunnel command

#### Scenario: Port override with a public URL

- **WHEN** `publicUrl` and `port` are configured, `SPECTATER_PORT` names a different port and Tailscale is not running
- **THEN** the review uses a loopback URL on that port, since the proxy targets the configured port

#### Scenario: Codespace

- **WHEN** open runs in a codespace without `publicUrl`
- **THEN** the printed review URL uses the codespace's forwarded-port domain for the port in use

### Requirement: Tailnet review URL

When no configured public URL or codespace URL applies to the bound port and Tailscale reports an IPv4 tailnet address and a MagicDNS name, the system SHALL also listen on that address and print the review URL with the MagicDNS name. `SPECTATER_TAILSCALE=0` MUST disable it. A port busy only on the tailnet side SHALL be skipped; other bind failures MUST leave the review on loopback with a logged reason. Agent commands MUST be refused on the tailnet listener.

#### Scenario: Phone on the tailnet

- **WHEN** open runs on a host with Tailscale and MagicDNS running and no public URL configured
- **THEN** the review URL uses `http://<machine>.<tailnet>.ts.net:<port>`, `access` has the public mode and any tailnet device holding the URL can review

#### Scenario: Tailscale absent or disabled

- **WHEN** Tailscale is not installed, not running, has no MagicDNS name, or `SPECTATER_TAILSCALE=0` is set
- **THEN** the server listens on loopback only and remote sessions get the tunnel command

#### Scenario: Tailnet port in use

- **WHEN** the preferred port is free on loopback but in use on the tailnet address, for example by `tailscale serve`
- **THEN** the server binds the next port free on both and prints the tailnet URL for it

#### Scenario: Configured public URL wins

- **WHEN** `publicUrl` applies to the bound port
- **THEN** no tailnet listener starts

#### Scenario: Agent command over the tailnet

- **WHEN** a request to `/agent/*` arrives on the tailnet address, even with the capability
- **THEN** the server refuses it

### Requirement: Herdr waiting notification

When `HERDR_ENV=1` and `SPECTATER_HERDR_CHIME=1` are set in the environment that started the review server, the system SHALL show one Herdr notification with its request sound when an agent starts waiting with nothing to deliver, at most once per delivered batch. A missing, failing or stalled Herdr MUST NOT delay or change feedback delivery.

#### Scenario: Chime once per round

- **WHEN** an agent opens a review in Herdr with the chime enabled and runs wait repeatedly with no feedback
- **THEN** Herdr notifies once, and again only after a batch has been delivered and the agent waits again

#### Scenario: Chime off

- **WHEN** either variable is unset or not `1`
- **THEN** no Herdr command runs
