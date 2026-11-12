# Proposal

## Why

The reader shows Send & End next to Submit batch and a separate End review button below the receipts. With nothing pending, Send & End already ends the review exactly like End review, so two buttons ask the reviewer to choose between actions that differ only by whether feedback is pending.

## What changes

- Replace both buttons with one review action next to Submit batch. It reads Send & End while comments or a message are pending, End review when nothing is pending, and Resume review after the review ends.
- Send & End keeps its delivery order: the final batch reaches a waiting agent before the review ends. End review keeps refusing to abandon queued or paused submissions.

## Capabilities

### Modified capabilities

- `review-feedback`: "Send and end" becomes one review action whose label follows pending feedback.

## Impact

`web/index.html`, `web/app.js`, `web/style.css`, the browser tests and README. No CLI, status, exit code or stored state changes.
