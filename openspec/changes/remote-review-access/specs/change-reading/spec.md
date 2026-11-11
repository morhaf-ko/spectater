## MODIFIED Requirements

### Requirement: Bounded local access

The system SHALL serve only the selected manifest on loopback and authorize review requests with a per-process capability. It SHALL accept requests whose host is `127.0.0.1`, `localhost` or `[::1]` with any port or none, or the host of the active public URL, and MUST require any request origin to equal the request's own loopback host or the active public origin. It MUST reject other hosts, foreign mutation origins, unauthorized requests, oversized input and filesystem paths outside the selected change.

#### Scenario: Cross-site write

- **WHEN** a foreign page submits feedback without the review capability or correct origin
- **THEN** the server rejects the request without changing review state

#### Scenario: Forwarded loopback address

- **WHEN** the reviewer opens the review through a port forward that presents `localhost` or a different local port
- **THEN** the review loads and accepts feedback with the capability

#### Scenario: Rebound hostname

- **WHEN** a request arrives with a non-loopback host that is not the active public URL's host
- **THEN** the server refuses it without serving review data

#### Scenario: Escaping document path

- **WHEN** a discovered path or subsequent filesystem change escapes the selected change through traversal or a symlink
- **THEN** the server refuses access and never serves the escaped file

#### Scenario: Explicit shutdown

- **WHEN** the operator interrupts the process
- **THEN** the listener closes, acknowledged review state remains and no login daemon or repository scanner is left running

### Requirement: Optional reader preferences

The system SHALL provide built-in defaults without requiring a configuration file. It SHALL allow an optional user-selected configuration to choose the initial document view, browser-opening preference, private state location, preferred server port and public URL. It MUST reject invalid settings visibly and MUST NOT expose settings that disable filesystem, browser, host or revision protections.

#### Scenario: No configuration

- **WHEN** the default configuration file is absent
- **THEN** the reader uses rendered view, a browser-opening attempt and private platform review storage

#### Scenario: Partial or invalid preferences

- **WHEN** the operator supplies a partial valid configuration
- **THEN** omitted preferences retain their defaults and explicit no-open mode suppresses browser opening

#### Scenario: Invalid preferences

- **WHEN** a selected configuration has invalid syntax, unknown settings or unsupported values
- **THEN** the command reports the configuration error and does not start a review

#### Scenario: Invalid public URL

- **WHEN** `publicUrl` has a path, query, fragment, credentials or a scheme other than http or https, or is set without `port`
- **THEN** the command reports the configuration error and does not start a review
