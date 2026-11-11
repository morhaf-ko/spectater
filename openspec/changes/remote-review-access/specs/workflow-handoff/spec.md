## MODIFIED Requirements

### Requirement: Exact-change opening

The system SHALL open the review URL after the server is ready, on macOS and Linux, unless no-open mode is selected, trying the `$BROWSER` executables before the platform opener. On Linux without a display or `$BROWSER` it MUST NOT run an opener. It MUST print the URL in every case and report discovery failure before opening a browser.

#### Scenario: Normal invocation

- **WHEN** an agent runs open with a change name
- **THEN** the browser attempt targets that change after the server is ready

#### Scenario: Readable review address

- **WHEN** the tool opens a selected change
- **THEN** its URL path uses the encoded change name and capability authorization remains required for review data

#### Scenario: Browser helper

- **WHEN** `$BROWSER` names an executable, as in a VS Code remote terminal
- **THEN** open runs it with the review URL before the platform opener

#### Scenario: Headless host

- **WHEN** open runs on Linux without `DISPLAY`, `WAYLAND_DISPLAY` or `$BROWSER`
- **THEN** no opener runs, the result reports the browser as not opened and no opener error is written

#### Scenario: Browser unavailable

- **WHEN** the opener fails or no-open mode is selected
- **THEN** the server stays ready and the printed URL works

## ADDED Requirements

### Requirement: Stable review port

The system SHALL treat a session as remote when SSH session variables are set, a codespace is detected, or it runs on Linux without a display. It SHALL bind a preferred port from configuration or `SPECTATER_PORT`, or a documented default in a remote session, falling back to the next free port in a bounded range. It MUST keep binding loopback only.

#### Scenario: Stable port across reviews

- **WHEN** a remote session opens one review, stops it and opens another
- **THEN** both use the same default port, so one existing forward reaches both

#### Scenario: Busy preferred port

- **WHEN** the preferred port is held by another review
- **THEN** the server binds the next free port in the range and reports that port

#### Scenario: Local desktop

- **WHEN** open runs on a desktop session with no SSH variables and no preferred port
- **THEN** the server keeps a random port

### Requirement: Remote access result

For a remote session or an applicable public URL, `open` SHALL add an `access` object to its result: a tunnel command for the port in use, or the public mode. The system MUST NOT start, configure or require a tunnel, proxy or hosted service.

#### Scenario: Multiplexer pane

- **WHEN** open runs on a headless Linux host inside a terminal multiplexer without SSH variables
- **THEN** the result includes the tunnel command for the port in use

#### Scenario: Local result

- **WHEN** open runs on a desktop session with no SSH variables and no public URL
- **THEN** the result has no `access` object

### Requirement: Public review URL

The system SHALL use a configured public URL, or a codespace's forwarded-port URL, for every printed review URL when the server holds the matching port, and accept that host and origin. Agent commands MUST keep using loopback.

#### Scenario: Configured public URL

- **WHEN** `publicUrl` is set and the server holds the configured port
- **THEN** the printed review URL uses the public origin, the server accepts that host and origin, and agent commands keep using loopback

#### Scenario: Public URL after fallback

- **WHEN** `publicUrl` is set but the configured port is busy
- **THEN** the review uses a fallback port with a loopback URL and `access` gives the tunnel command

#### Scenario: Codespace

- **WHEN** open runs in a codespace without `publicUrl`
- **THEN** the printed review URL uses the codespace's forwarded-port domain for the port in use
