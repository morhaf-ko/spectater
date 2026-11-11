## MODIFIED Requirements

### Requirement: Bounded local access

The system SHALL serve only the selected manifest on loopback and, when enabled, the tailnet address and authorize review requests with a per-process capability. It MUST reject unaccepted hosts, foreign mutation origins, unauthorized requests, oversized input and filesystem paths outside the selected change.

#### Scenario: Cross-site write

- **WHEN** a foreign page submits feedback without the review capability or correct origin
- **THEN** the server rejects the request without changing review state

#### Scenario: Escaping document path

- **WHEN** a discovered path or subsequent filesystem change escapes the selected change through traversal or a symlink
- **THEN** the server refuses access and never serves the escaped file

#### Scenario: Explicit shutdown

- **WHEN** the operator interrupts the process
- **THEN** the listener closes, acknowledged review state remains and no login daemon or repository scanner is left running

### Requirement: Accepted hosts and origins

The system SHALL accept requests whose host is `127.0.0.1`, `localhost` or `[::1]` with any port or none, or the host of the active public or tailnet URL. It MUST require any request origin to equal the request's own loopback host or the active public origin.

#### Scenario: Forwarded loopback address

- **WHEN** the reviewer opens the review through a port forward that presents `localhost` or a different local port
- **THEN** the review loads and accepts feedback with the capability

#### Scenario: Rebound hostname

- **WHEN** a request arrives with a non-loopback host that is not the active public URL's host
- **THEN** the server refuses it without serving review data
