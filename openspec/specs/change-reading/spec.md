# change-reading Specification

## Purpose

Let an operator read one explicitly selected OpenSpec change while preserving native discovery and canonical source files.

## Requirements

### Requirement: Previous source comparison

The system SHALL retain the current and previous validated source manifests and offer an on-demand comparison of changed, added and removed artifacts. Metadata-only actions MUST NOT move this baseline. Diff output MUST remain inert text, respect bounded execution/output and use only retained snapshots rather than changing canonical files.

#### Scenario: Source changes

- **WHEN** validated source changes or an artifact is added or removed
- **THEN** What changed lists affected paths and compares the latest source update with its predecessor, including after restart

#### Scenario: Comparison unavailable

- **WHEN** native Git is absent or comparison exceeds execution/output limits
- **THEN** the reader reports a comparison-specific error while ordinary reading and saved feedback remain available

### Requirement: Selected-change automatic updates

The system SHALL observe changes within only the explicitly selected change while its reader runs, coalesce filesystem events and refresh through native OpenSpec discovery. It MUST handle normal writes and atomic replacement, preserve unsaved comment text and scroll context, retain the last valid review on refresh failure and expose an actionable manual-refresh fallback. It MUST NOT scan sibling projects, follow escaping symlinks, continuously poll or treat a source update as addressed feedback.

#### Scenario: Agent saves canonical Markdown

- **WHEN** an artifact in the selected change is written or atomically replaced
- **THEN** the browser receives the updated source automatically and old anchors are reconciled conservatively

#### Scenario: Artifact structure changes

- **WHEN** supported artifacts are added or removed under the selected change
- **THEN** native discovery updates the manifest without a second parser or writer

#### Scenario: Observation or refresh fails

- **WHEN** filesystem observation is unsupported or an update is invalid
- **THEN** saved feedback and the last valid source remain, with a visible error and explicit retry path

### Requirement: Minimal system-aware appearance

The system SHALL default to the operating system color scheme and allow explicit light or dark appearance. It MUST preserve the current document, selection and draft when appearance changes. Secondary metadata and export controls SHALL use progressive disclosure while remaining accessible.

#### Scenario: System appearance changes

- **WHEN** the operator uses System appearance and the operating system changes color scheme
- **THEN** the reader follows that scheme without refreshing source or replacing the document

#### Scenario: Manual appearance

- **WHEN** the operator selects Light or Dark
- **THEN** that choice overrides the operating system until System is selected again and a draft remains intact

#### Scenario: Preference storage unavailable

- **WHEN** the browser refuses preference storage
- **THEN** System remains the default and manual appearance controls still work for the current page

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

### Requirement: Native discovery

The system SHALL use native OpenSpec root, schema, artifact-path and status discovery for the selected project and change. It SHALL accept any OpenSpec version from 1.15.0 whose JSON output matches the expected contract shape. It MUST preserve explicit store selection and report unsupported CLI contracts or native failures without a replacement discovery engine.

#### Scenario: Custom artifact layout

- **WHEN** native status returns a custom schema with existing Markdown artifact paths
- **THEN** the reader lists those paths and native artifact states without assuming standard filenames

#### Scenario: Newer OpenSpec release

- **WHEN** an OpenSpec version newer than the tested versions returns the expected JSON shape
- **THEN** discovery succeeds without a version error

#### Scenario: CLI failure

- **WHEN** OpenSpec is unavailable, older than 1.15.0, returns an unsupported contract or rejects the selected change
- **THEN** the command reports the diagnostic and does not open a partial review under a guessed root

#### Scenario: Unselected global default

- **WHEN** discovery resolves a machine-global default store without explicit store selection
- **THEN** the command requests explicit selection and does not serve that store's documents

### Requirement: Planning identity

The system SHALL identify a review by canonical resolved root and change path. It MUST expose the selected identity locally and MUST NOT scan sibling worktrees or follow referenced roots automatically.

#### Scenario: Same change slug in separate worktrees

- **WHEN** two worktrees contain different canonical paths for the same change slug
- **THEN** opening each produces isolated review state

#### Scenario: Shared planning store

- **WHEN** explicit project discovery resolves the same canonical store and change
- **THEN** the review uses that planning identity rather than the caller's branch name

### Requirement: Deterministic source-preserving reading

The system SHALL render Markdown deterministically from exact document snapshots, provide a source view, and show unsupported artifact types explicitly. It MUST NOT edit canonical Markdown, execute embedded content or fetch remote document assets.

#### Scenario: Unsafe document content

- **WHEN** a document contains raw HTML, script URLs, remote images or executable diagram syntax
- **THEN** active content remains inert, no remote asset is fetched and source text remains readable

#### Scenario: Read and comment

- **WHEN** the operator reads artifacts and writes review feedback
- **THEN** canonical files remain byte-for-byte unchanged by the reader

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

### Requirement: Accepted hosts and origins

The system SHALL accept requests whose host is `127.0.0.1`, `localhost` or `[::1]` with any port or none, or the host of the active public or tailnet URL. It MUST require any request origin to equal the request's own loopback host or the active public origin.

#### Scenario: Forwarded loopback address

- **WHEN** the reviewer opens the review through a port forward that presents `localhost` or a different local port
- **THEN** the review loads and accepts feedback with the capability

#### Scenario: Rebound hostname

- **WHEN** a request arrives with a non-loopback host that is not the active public URL's host
- **THEN** the server refuses it without serving review data
