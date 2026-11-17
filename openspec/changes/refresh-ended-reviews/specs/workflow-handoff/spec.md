## MODIFIED Requirements

### Requirement: Explicit review completion

The system SHALL persist an ended review state and require explicit operator resumption before accepting further feedback. Ending MUST preserve saved history, refuse abandonment of queued or paused submissions, and return an ended result to waiting CLI listeners, or approved after an approval. Ending without approving MUST NOT stop a model or imply approval. Already delivered work MAY post a result after review completion. Agent refresh and reply MUST re-read the change on an ended review without resuming it.

#### Scenario: End a review

- **WHEN** the operator ends a review without approving and with no undelivered submissions
- **THEN** feedback mutations become read-only, saved data remains readable and waiting agents receive ended guidance to stop listening without reopening uninvited

#### Scenario: Outstanding feedback

- **WHEN** the operator attempts to end with queued or paused submissions
- **THEN** the reader asks them to deliver or cancel those submissions without discarding their contents

#### Scenario: Resume explicitly

- **WHEN** the operator selects Resume review or opens with --reopen
- **THEN** the same review resumes against validated current source while ordinary open/restart never silently clears completion

#### Scenario: Revise after the review ended

- **WHEN** the agent revises Markdown after the review ended and runs refresh or replies to the last delivered batch
- **THEN** the reader shows the current source and the reply while the review stays ended and feedback stays read-only
