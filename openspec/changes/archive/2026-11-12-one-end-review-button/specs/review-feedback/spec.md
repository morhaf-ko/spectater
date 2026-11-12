## MODIFIED Requirements

### Requirement: Send and end

The system SHALL offer one review action that submits pending feedback and ends the review. It MUST read Send & End while comments or a message are pending, End review when nothing is pending, and Resume review after the review ends. The ended state MUST take effect only after the final batch is delivered, so a waiting agent receives the batch first and `ended` on its next wait.

#### Scenario: Send and end with a listener

- **WHEN** the reviewer chooses Send & End while an agent waits
- **THEN** the agent receives the final batch, and its next wait returns ended

#### Scenario: Send and end with nothing pending

- **WHEN** the reviewer chooses Send & End with no pending feedback
- **THEN** the review ends as with End review

#### Scenario: Label follows pending feedback

- **WHEN** the reviewer saves a comment or types a message, then clears it
- **THEN** the review action reads Send & End while feedback is pending and End review once nothing is pending

#### Scenario: One review action

- **WHEN** the reader shows an active or ended review
- **THEN** exactly one review action is present, reading End review, Send & End or Resume review
