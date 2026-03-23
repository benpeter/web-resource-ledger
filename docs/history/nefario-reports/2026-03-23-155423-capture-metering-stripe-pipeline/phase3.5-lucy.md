# Lucy Review: capture-metering-stripe-pipeline

## Verdict: ADVISE

The plan is well-structured, aligns with the project's engineering philosophy, and reuses existing patterns appropriately. Three items need attention -- one is a genuine intent-vs-plan mismatch that requires a conscious decision, the other two are minor.

---

### Finding 1: Free-Tier Reporting Contradicts Stated Success Criterion

- **SCOPE**: DRIFT
- **CHANGE**: Plan reports ALL captures to Stripe including the first 200 free-tier captures, relying on Stripe's graduated pricing (tier 1 at EUR 0.00) to produce zero charges.
- **WHY**: The original prompt's success criterion #3 states verbatim: "First 200 captures/month are free and **not reported to Stripe as billable usage**." The plan deliberately inverts this -- it reports them to Stripe, just at a zero price. The plan's rationale (single source of truth, simpler reconciliation) is sound engineering, but it contradicts the literal requirement text. This is not a bug in the plan; it is a design decision that should be explicitly acknowledged as a deviation from the stated requirement, not silently shipped.
- **TASK**: At the approval gate for Task 3, confirm with the human that "report all captures, let Stripe handle free tier at EUR 0.00" is the accepted interpretation of success criterion #3. If confirmed, update the issue description to match. The plan's conflict resolution (Section "Conflict 2") already documents the rationale -- this just needs the human to sign off on the deviation.

---

### Finding 2: Invoice Threshold Enforcement Not Implemented

- **SCOPE**: TRACE
- **CHANGE**: Plan defines `INVOICE_THRESHOLD_EUR = 5.00` in `pricing.js` and exposes `invoiceThreshold.met` boolean on the dashboard response. No task implements the actual enforcement (deferring Stripe invoice finalization until charges >= EUR 5).
- **WHY**: The original prompt's success criterion #5 states: "Invoice threshold enforced: Stripe invoice finalization deferred until accumulated charges >= threshold; sub-threshold balances roll over." The plan's dashboard endpoint displays threshold progress, but displaying a threshold is not enforcing it. Success criterion #6 ("Invoices generated automatically at billing period end if threshold met") also has no corresponding task. The plan's scope section and risk table are silent on this deferral. The plan should either (a) include a task for threshold enforcement via Stripe's invoice configuration, or (b) explicitly declare these as out-of-scope for this phase with a backlog entry.
- **TASK**: Add an explicit "Deferred to backlog" note in the plan for success criteria #5 and #6 (invoice threshold enforcement and automatic invoice generation). These are Stripe configuration concerns (e.g., `collection_method`, `pending_invoice_items_behavior`, draft invoice thresholds) that may already be partially handled by the existing subscription setup -- but the plan must not be silent about unaddressed requirements. Flag in `outcome.md` and `docs/backlog.md` after execution.

---

### Finding 3: `reportMeterEvent` Parameter Shape

- **SCOPE**: CONVENTION
- **CHANGE**: Task 3's prompt instructs calling `reportMeterEvent(env, { event_name, payload: { stripe_customer_id, value }, identifier, timestamp })`.
- **WHY**: The existing `reportMeterEvent` in `src/stripe.js:119-121` is a thin wrapper around `stripeRequest` which uses `flattenParams` to form-encode nested objects with bracket notation. The Stripe Billing Meter Events API expects top-level `event_name`, `payload[stripe_customer_id]`, `payload[value]`, and `identifier` as form parameters. The plan's parameter shape will be correctly flattened by the existing `flattenParams` utility (nested `payload` object becomes `payload[stripe_customer_id]` and `payload[value]`). This is fine -- just confirming no issue here. The `identifier` field maps to Stripe's idempotency mechanism for meter events (not the `Idempotency-Key` header). This is correct usage.
- **TASK**: None required. Included for completeness -- the parameter shape was verified against the existing code.

---

### Traceability Matrix

| # | Requirement (from prompt.md) | Plan Coverage | Status |
|---|---|---|---|
| 1 | Usage records reported to Stripe hourly | Task 3: cron + meter-reporter.js | COVERED |
| 2 | Volume discount tiers applied automatically | Task 1: pricing.js VOLUME_TIERS | COVERED |
| 3 | First 200 free, not reported to Stripe | Plan INVERTS this: reports all, Stripe prices free tier at 0 | DEVIATION -- see Finding 1 |
| 4 | Dashboard shows captures, charges, tier, threshold | Task 2: billing sub-object on GET /v1/account/usage | COVERED |
| 5 | Invoice threshold enforced (defer finalization) | INVOICE_THRESHOLD_EUR constant + display only; no enforcement | GAP -- see Finding 2 |
| 6 | Invoices generated at period end if threshold met | No task addresses this | GAP -- see Finding 2 |
| 7 | Idempotent usage reporting | Task 3: deterministic identifier key | COVERED |
| 8 | Reconcilable within 1% tolerance | Task 3: watermark design; reconciliation endpoint deferred | PARTIAL (deferred reconciliation endpoint acknowledged in risks table) |
| 9 | Failed submissions retried and logged | Task 3: natural hourly retry + Coralogix logging | COVERED |

### CLAUDE.md Compliance

| Directive | Compliance |
|---|---|
| YAGNI | PASS -- no speculative features. `projectedCharges` explicitly deferred with null + note. |
| KISS | PASS -- columns on existing table, piggyback on existing cron, no new infrastructure. |
| Fail loudly | PASS -- Task 3 specifies per-tenant error handling, Coralogix logging at severity 5 for failures, watermark not advanced on error. |
| Test the real boundaries | PASS -- integration tests in `test/meter-batch.test.js` exercise the cron-to-Stripe path. Stripe calls are stubbed (appropriate for unit tests), but the cron integration is real. |
| Evolution log | Plan does not explicitly mention evolution log entries, but this is handled by the nefario orchestration framework (phases 7-8). No violation. |
| Lean and Mean | PASS -- 3 tasks, no new dependencies, reuses existing `stripe.js`, `log.js`, `db.js` modules. |

### Scope Assessment

No scope creep detected. The plan's 3 tasks map cleanly to the core requirements. Cross-cutting concerns (security, observability, documentation) are handled within existing tasks or explicitly deferred. The `projectedCharges: null` placeholder is a reasonable skeleton for future work, not gold-plating -- it prevents a breaking API change later.

---

**Summary**: The plan is well-aligned with project conventions and engineering philosophy. Two issues require action before execution: (1) the free-tier reporting deviation from the literal requirement text needs human acknowledgment, and (2) the invoice threshold enforcement gap needs explicit deferral documentation. Neither blocks execution if addressed at the first approval gate.
