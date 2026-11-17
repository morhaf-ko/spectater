## ADDED Requirements

### Requirement: Revision after completion

The system SHALL let the agent refresh an ended or approved review and re-read the change before recording a reply, without resuming the review or clearing its approval. Feedback mutations MUST stay read-only until the operator resumes.

#### Scenario: Revise after the review ended

- **WHEN** the agent revises Markdown after the review ended and runs refresh or replies to the last delivered batch
- **THEN** the reader shows the current source and the reply while the review stays ended and feedback stays read-only

#### Scenario: Revise after approval

- **WHEN** the agent replies to a batch delivered before approval after revising Markdown
- **THEN** the reader shows the current source and the reply while the review stays approved
