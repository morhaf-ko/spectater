## MODIFIED Requirements

### Requirement: Correctable undelivered feedback

The system SHALL allow cancellation and editing of a submitted batch only before durable delivery handoff. Delivery claims and queue changes MUST serialize through the owning writer. Editing MUST pause delivery until explicit replacement submission. Cancelled, editing and superseded batches MUST be skipped by server delivery while their original contents remain available as explicit historical exports. Claimed batches MUST NOT be presented as cancellable or interrupted.

#### Scenario: Cancel races with delivery

- **WHEN** cancellation and CLI retrieval target the same queued batch
- **THEN** one serialized transition wins: cancellation prevents delivery, or durable handoff prevents cancellation, without claiming feedback was recalled

#### Scenario: Edit queued feedback

- **WHEN** the operator edits an undelivered batch
- **THEN** delivery pauses durably, saved comments can be corrected or removed, and explicit update creates a new immutable batch linked from the superseded original

#### Scenario: Offline retrieval

- **WHEN** no owning reader is running
- **THEN** previously handed-off batches remain repeatably readable, pending delivery requires reopening, and an explicit historical export never claims current delivery or receipt
