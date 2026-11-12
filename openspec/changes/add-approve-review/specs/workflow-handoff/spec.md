## ADDED Requirements

### Requirement: Review approval

The system SHALL let the reviewer approve a review when no comments are unsubmitted and no submission is queued or paused. Approval MUST end the review, record that it was approved, and make waiting listeners receive `approved` once any claimed batch is answered. Resume MUST clear the approval.

#### Scenario: Approve while an agent waits

- **WHEN** the reviewer approves while an agent waits
- **THEN** the wait returns approved with a next step to continue with what the user already asked for, ask the user once if nothing was asked, and never merge or deploy

#### Scenario: Approve with pending feedback

- **WHEN** an approval is requested while comments are unsubmitted or a submission is queued or paused
- **THEN** it is refused and the review stays active with its feedback unchanged

#### Scenario: Resume after approval

- **WHEN** the operator resumes an approved review and later ends it without a decision
- **THEN** the review is active again and the next wait after ending returns ended

## MODIFIED Requirements

### Requirement: Structured agent results

The system SHALL print exactly one JSON object on stdout for each agent command, with a `status` from a fixed set and a `next_step` sentence. Distinct non-success outcomes MUST use distinct documented exit codes.

#### Scenario: Ended review

- **WHEN** wait returns because the reviewer ended the review
- **THEN** stdout holds `status` ended with a next step to stop waiting and not reopen uninvited

#### Scenario: Approved review

- **WHEN** wait returns because the reviewer approved the review
- **THEN** stdout holds `status` approved, exit code 0, and a next step that accepts the artifacts as written without authorizing merge or deployment

### Requirement: Approval separation

The system MUST NOT interpret comments, submission, ending a review, artifact status or task completion as implementation, merge or production approval. An explicit Approve accepts the artifacts as written, so the conversation MAY continue with work the user already requested; it MUST NOT authorize merge or deployment. The system SHALL leave execution and authorization to the existing operator/conversation workflow.

#### Scenario: Planning complete

- **WHEN** native OpenSpec reports all planning artifacts complete or the operator submits a batch
- **THEN** the reader records only planning/review state and does not apply code, merge, deploy or mark feedback addressed
