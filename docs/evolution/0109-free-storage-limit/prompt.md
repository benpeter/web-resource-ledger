# Phase 0109: Free storage limit that fits the free captures

## Task

From Ben, 2026-10-22:

> then, cut-off and raise the storage limit with sufficient headroom

Context from the assessment that came before it: the free tier promises 200
captures a month, but it also has a 1 GB storage limit per month. Captures in
production store 9 to 19 MB each across all artifacts, so 1 GB runs out after
roughly 55 to 120 captures. When a free tenant reached the storage limit, the API
answered `429 Storage quota reached` and nothing else happened. Only the
capture-count branch sent the `limit_reached` email with a link to add a payment
method. The scheduler had the same gap: a tenant at the limit had its scheduled
captures skipped every run with a log line and no email.

Fix the cut-off (tell the tenant and show them how to keep capturing) and raise
the free storage limit with enough headroom for 200 captures.
