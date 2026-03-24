# Phase 0076: Billing UI Panel

## Source

GitHub Issue: #170 — Billing UI panel (usage dashboard, payment method, invoices)

## Task Description

Phase 0058 built the billing API endpoints (checkout, portal, webhook) but no UI.
The web UI at `/ui` has three tabs (Captures, Settings, Schedules) but no Billing tab.
The only billing-related UI element is a small "Add a payment method" link in Settings
that points to a non-existent `/billing` page.

### What's needed

A "Billing" tab in the web UI navigation showing:

- Current period capture count and estimated charges
- Applicable pricing tier (free / volume discount bracket)
- EUR 5 invoice threshold progress
- Payment method status (none / active / failed)
- Link to Stripe Customer Portal for payment method management and invoice history
- eIDAS add-on usage if enabled

Data source: `GET /v1/account/usage` already returns billing sub-object with
all needed fields (captures, charges, tier, threshold progress).

### Scope

- In: Navigation tab, usage dashboard panel, Stripe portal link, responsive layout
- Out: Inline payment form (#147), invoice PDF rendering (Stripe handles this)
