---
task: "Capture pipeline observability via keyName"
date: 2026-03-17
mode: execution
task-count: 1
gate-count: 0
agents: observability-minion, margo
reviewers: []
compaction-events: 0
---

## Summary

Documented the decision to NOT thread keyName/authMethod through performCapture(). Added a `capture.queued` bridge log event at the handler level, tying captureId to keyName/authMethod at dispatch time. This closes the captureId→keyName correlation gap on the success path without coupling auth context to the capture pipeline.

## Original Prompt

Evaluate whether to add keyName/authMethod to capture pipeline logs. Decision: do NOT change performCapture() signature. Log at handler level and correlate via captureId.

## Key Design Decisions

1. **Handler-level logging, not pipeline threading** — keyName/authMethod are auth context that performCapture() doesn't act on. Threading adds 2 logging-only parameters to a 7-parameter function. Both observability-minion and margo independently rejected this approach.

2. **capture.queued bridge event** — observability-minion identified that the success path lacked a log event tying captureId to keyName. The new `capture.queued` event at dispatch time closes this gap. Operators query `captureId:"abc" | event:"capture.queued"` for key correlation.

## Verification

Verification: 582 tests pass.

## Working Files

[`docs/history/nefario-reports/2026-03-17-150058-capture-pipeline-observability/`](./2026-03-17-150058-capture-pipeline-observability/)
