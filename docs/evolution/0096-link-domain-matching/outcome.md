# Phase 0096 — Outcome

## What changed

One-line fix in `src/billing.js`: replaced `invoice?.hosted_invoice_url`
with `${baseUrl}/ui#billing` for the `invoice_generated` email template
data. All outbound WRL emails now exclusively link to WRL domain URLs.

## PR

Created by supervisor after killing a stalled nefario session (35 min,
31 subagents, zero commits). The fix was a single line change.

## Backlog changes

None.
