# Decisions

- The `[WRL] Capture Failures` alert claimed to watch terminal failures, but it
  counts `capture.fail`, which the pipeline only logs on its catch-all path.
  Permanent failures on the normal path go through the dead-letter queue and
  log `capture.dlq`, and no alert counted those. Coralogix shows 0
  `capture.fail` and 2 `capture.dlq` events in the 8 days before 2026-10-23.
- New alert `[WRL] Captures Dead-Lettered`: more than 0 `capture.dlq` events in
  30 minutes, production only, P2, email. At this volume every dead-lettered
  capture is a user without a capture, so any one is worth a look. The
  60-minute notification throttle keeps a batch of failures to one email.
- `[WRL] Capture Failures` stays as it is, with its description corrected.
- A runbook for the new alert, and the ops-runbook skill no longer points to
  the auto-investigation removed in phase 0110.
