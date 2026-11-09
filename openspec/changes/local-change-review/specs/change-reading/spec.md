# Change reading

## Purpose

Let an operator read one explicitly selected OpenSpec change while preserving native discovery and canonical source files.

## ADDED Requirements

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
The system SHALL provide built-in defaults without requiring a configuration file. It SHALL allow an optional user-selected configuration to choose the initial document view, browser-opening preference and private state location. It MUST reject invalid settings visibly and MUST NOT expose settings that disable filesystem, browser or revision protections.

#### Scenario: No configuration
- **WHEN** the default configuration file is absent
- **THEN** the reader uses rendered view, a browser-opening attempt and private platform review storage

#### Scenario: Partial or invalid preferences
- **WHEN** the operator supplies a partial valid configuration
- **THEN** omitted preferences retain their defaults and explicit no-open mode suppresses browser opening

#### Scenario: Invalid preferences
- **WHEN** a selected configuration has invalid syntax, unknown settings or unsupported values
- **THEN** the command reports the configuration error and does not start a review

### Requirement: Native discovery
The system SHALL use native OpenSpec root, schema, artifact-path and status discovery for the explicit project and change. It MUST preserve explicit store selection and report unsupported CLI contracts or native failures without a replacement discovery engine.

#### Scenario: Custom artifact layout
- **WHEN** native status returns a custom schema with existing Markdown artifact paths
- **THEN** the reader lists those paths and native artifact states without assuming standard filenames

#### Scenario: CLI failure
- **WHEN** OpenSpec is unavailable, returns an unsupported contract or rejects the selected change
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
The system SHALL serve only the selected manifest on loopback and authorize review requests with a per-process capability. It MUST reject foreign mutation origins, forged hosts, unauthorized requests, oversized input and filesystem paths outside the selected change.

#### Scenario: Cross-site write
- **WHEN** a foreign page submits feedback without the review capability or correct origin
- **THEN** the server rejects the request without changing review state

#### Scenario: Escaping document path
- **WHEN** a discovered path or subsequent filesystem change escapes the selected change through traversal or a symlink
- **THEN** the server refuses access and never serves the escaped file

#### Scenario: Explicit shutdown
- **WHEN** the operator interrupts the process
- **THEN** the listener closes, acknowledged review state remains and no login daemon or repository scanner is left running
