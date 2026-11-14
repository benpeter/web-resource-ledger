# Prompt

Same session as phases 0133 to 0138 (Ben, 2026-11-14: "check if anything has been
missed in the past and check on operational stuff").

A production check found 8 captures that had been `pending` since July to September
2026, all from the founder's hourly apache.org schedule. Their queue messages were gone,
so no consumer or DLQ handler would ever finish them, and the API, dashboard and MCP
showed them as in progress. Nothing in the code fails a capture whose message is lost.

While adding the sweep's log events to `docs/operations/coralogix-events.md`, the file
turned out to give the wrong severity legend (6 = verbose, 7 = debug), to still list
`capture.list` at 6 after phase 0136 moved it to 2, and to miss the events 0136 added.
`email.dispatch_skipped` was logged at 7, outside Coralogix's range.
