## MODIFIED Requirements

### Requirement: Bounded local access

The system SHALL serve only the selected manifest on loopback and, when enabled, the tailnet address and authorize review requests with a per-process capability. It MUST reject unaccepted hosts, foreign mutation origins, unauthorized requests, oversized input and filesystem paths outside the selected change. It MUST serve GET requests for the review route and its static assets whatever the browser's `Sec-Fetch-Site` reports, and MUST reject every other request a browser marks cross-site.

#### Scenario: Cross-site write

- **WHEN** a foreign page submits feedback without the review capability or correct origin
- **THEN** the server rejects the request without changing review state

#### Scenario: Link opened from another site

- **WHEN** the reviewer opens the review URL from a page on another site
- **THEN** the reader loads, while cross-site requests for review data, agent commands or writes are refused

#### Scenario: Escaping document path

- **WHEN** a discovered path or subsequent filesystem change escapes the selected change through traversal or a symlink
- **THEN** the server refuses access and never serves the escaped file

#### Scenario: Explicit shutdown

- **WHEN** the operator interrupts the process
- **THEN** the listener closes, acknowledged review state remains and no login daemon or repository scanner is left running
