## ADDED Requirements

### Requirement: Free-form review message

The system SHALL let the reviewer submit a message that is not attached to a text selection. A message MUST be delivered in the same immutable batch as pending comments and MUST be limited to 10,000 characters.

#### Scenario: Message without selection

- **WHEN** the reviewer types a message and submits with no new comments
- **THEN** a batch containing only that message is queued for the agent

#### Scenario: Message with comments

- **WHEN** the reviewer types a message and has pending comments
- **THEN** one batch carries both, and the agent receives the message before the comments

### Requirement: Send and end

The system SHALL offer one action that submits pending feedback and ends the review. The ended state MUST take effect only after the final batch is delivered, so a waiting agent receives the batch first and `ended` on its next wait.

#### Scenario: Send and end with a listener

- **WHEN** the reviewer chooses Send & End while an agent waits
- **THEN** the agent receives the final batch, and its next wait returns ended

#### Scenario: Send and end with nothing pending

- **WHEN** the reviewer chooses Send & End with no pending feedback
- **THEN** the review ends as with End review

### Requirement: Keyboard shortcuts

The system SHALL support keyboard submission in the comment and message composers: Enter saves, Shift+Enter inserts a newline, Cmd+Enter (Ctrl+Enter off macOS) saves and submits all pending feedback, and Escape closes an empty composer. Escape MUST NOT discard unsaved text.

#### Scenario: Escape with text

- **WHEN** the composer contains unsaved text and the reviewer presses Escape
- **THEN** the composer stays open with its text unchanged
