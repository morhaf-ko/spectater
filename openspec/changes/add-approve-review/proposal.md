# Proposal

## Why

When the reviewer reads a change, has no comments and clicks End review, `wait` returns `ended` with a next step to stop. The agent stalls and the reviewer has to go back to the terminal to say the change looks good. End review means done, no comments and stop at once, so the agent cannot tell acceptance from abandonment.

## What changes

- With nothing pending, the primary review action reads Approve. It ends the review, records the approval and makes `wait` return a new status `approved`.
- The `approved` next step tells the agent the artifacts are accepted as written and to continue with what the user already asked for (for example, review then implement). If nothing further was asked, the agent asks the user once. Approval never authorizes merge or deployment.
- Approve is refused while comments are unsubmitted or a submission is queued or paused.
- Send & End, shown while feedback is pending, is unchanged.
- End without a decision stays available as a quiet secondary "End without approving" link next to the primary action, shown only when nothing is pending. It keeps today's `ended` behaviour.
- Resume after an approved or ended review behaves as today and clears the approval.

## Capabilities

### Modified capabilities

- `review-feedback`: the review action reads Approve with nothing pending, with a secondary link that ends without a decision.
- `workflow-handoff`: approving a review, the additive `approved` wait status, and approval separation.

## Impact

`src/review.js`, `src/server.js`, `src/storage.js`, `bin/spectater.js` (workflow text and next steps), `web/`, `skills/spectater/SKILL.md`, README and tests. `approved` is additive and exits 0. Agents on older skills read the `next_step` of every result, and `npx -y spectater workflow` prints the new loop. Stored reviews without `approved` load unchanged. Not breaking.
