## MODIFIED Requirements

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

### Requirement: Detached review server

The system SHALL start the review server as a detached process from `open` and return once it is ready. It SHALL record the server's port and an agent token in a private owner-only file in the state directory; on Windows the state directory MUST be inside the user profile, whose access control keeps it owner-only. The server MUST stop after a configurable idle period with no browser connection and no listener, and on an explicit stop command. A recorded server whose process no longer exists MUST be replaced on the next open.

#### Scenario: Open returns

- **WHEN** an agent runs open for a change with no running server
- **THEN** the command prints the review URL and exits while the server keeps running

#### Scenario: Idle shutdown

- **WHEN** no browser is connected and no listener waits for the idle period
- **THEN** the server stops, releases its writer lock and keeps saved feedback

#### Scenario: Windows start

- **WHEN** open starts a server on Windows
- **THEN** no console window appears and the command returns once the server is ready

### Requirement: Stable review port

The system SHALL treat a session as remote when `SPECTATER_REMOTE` says so, or, when it is unset, when SSH session variables are set, the surrounding tmux session was last attached over SSH, a codespace is detected, or it runs on Linux without a display outside WSL. It SHALL bind a preferred port from configuration or `SPECTATER_PORT`, or a documented default in a remote session, falling back to the next free port in a bounded range. It MUST bind loopback, plus only the tailnet address described in Tailnet review URL.

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

## ADDED Requirements

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
