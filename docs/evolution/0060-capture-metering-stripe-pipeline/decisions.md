# Phase 0060: Decisions

## Graduated pricing module

Chose a standalone `src/pricing.js` module that computes charges from a
graduated tier table. The tier definitions live in code (not Stripe config)
so the dashboard can show "current tier" and "next tier" without an API
call. Stripe's graduated pricing is configured to match.

## Hourly batch reporting vs per-capture

Chose hourly batch reporting via Cron Trigger over per-capture Stripe API
calls. Rationale: per-capture would add latency to the hot path and risks
rate limiting at scale. Hourly batches are idempotent (keyed by tenant +
period + hour) and retry-safe.

## EUR 5 invoice threshold

Implemented as application-side logic that defers Stripe invoice
finalization until accumulated charges reach EUR 5. Sub-threshold amounts
roll over automatically because Stripe usage records accumulate until the
invoice is finalized.

## D1 migration for metering

Added `0008_metering.sql` with columns tracking the last-reported hour
per tenant. This avoids re-reporting the same hour on retry and provides
a reconciliation anchor.
