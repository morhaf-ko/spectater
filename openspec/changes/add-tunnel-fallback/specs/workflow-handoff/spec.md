## MODIFIED Requirements

### Requirement: Remote access result

For a remote session or an applicable public URL, `open` SHALL add an `access` object to its result: a tunnel command for the port in use, a forward mode inside a container, or the public mode, and its next step MUST keep the URL and access instructions even when a browser helper ran. In the public mode of a remote session where an SSH tunnel to this host can work, `access` SHALL also carry the tunnel command and the loopback review URL as a fallback, and the next step MUST tell the agent to give the reviewer both with the URL. The system MUST NOT start, configure or require a tunnel, proxy or hosted service, and MUST NOT probe whether the public URL is reachable.

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

#### Scenario: Public URL blocked for the reviewer

- **WHEN** open runs in a remote SSH session and prints a tailnet or configured public URL
- **THEN** `access` keeps the public mode and also has the tunnel command for the port in use and the loopback review URL, and the next step tells the agent to give the reviewer both as a fallback

#### Scenario: Public URL in a local session

- **WHEN** open runs on a desktop session and prints a tailnet or configured public URL
- **THEN** `access` has the public mode and port only

#### Scenario: Codespace URL

- **WHEN** open runs in a codespace without `publicUrl`
- **THEN** `access` has the public mode and port only
