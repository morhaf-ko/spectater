## MODIFIED Requirements

### Requirement: Send and end

The system SHALL offer one primary review action. It MUST read Send & End while comments or a message are pending, Approve when nothing is pending, and Resume review after the review ends. Send & End MUST end the review only after the final batch is delivered, so a waiting agent receives it first and `ended` on its next wait. While nothing is pending, a secondary End without approving link MUST end the review without a decision.

#### Scenario: Send and end with a listener

- **WHEN** the reviewer chooses Send & End while an agent waits
- **THEN** the agent receives the final batch, and its next wait returns ended

#### Scenario: Send and end with nothing pending

- **WHEN** Send & End is requested with no pending feedback
- **THEN** the review ends as with End without approving

#### Scenario: Label follows pending feedback

- **WHEN** the reviewer saves a comment or types a message, then clears it
- **THEN** the review action reads Send & End while feedback is pending and Approve once nothing is pending

#### Scenario: One review action

- **WHEN** the reader shows an active or ended review
- **THEN** exactly one primary review action is present, reading Approve, Send & End or Resume review

#### Scenario: End without a decision

- **WHEN** nothing is pending and the reviewer chooses End without approving
- **THEN** the review ends and a waiting agent receives ended

#### Scenario: Secondary link only when nothing is pending

- **WHEN** feedback is pending or the review has ended
- **THEN** the End without approving link is hidden
