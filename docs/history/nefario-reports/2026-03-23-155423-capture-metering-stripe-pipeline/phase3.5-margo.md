# Margo Review: Capture Metering to Stripe Pipeline

## Verdict: ADVISE

The plan is well-proportioned to the problem. Three tasks for three deliverables (pricing module, dashboard extension, meter reporter) with no gratuitous abstraction layers, no new dependencies, no new infrastructure. The conflict resolutions all chose the simpler option -- columns over tables, all-captures-to-Stripe over deduct-first, short idempotency keys over verbose ones. This is how KISS should look in practice.

Two non-blocking items to watch:

---

### [simplicity-1]: `VOLUME_TIERS` duplicates Stripe Dashboard configuration

- **SCOPE**: Task 1, `src/pricing.js` -- `VOLUME_TIERS` constant
- **CHANGE**: None required now, but worth noting the ongoing cost
- **WHY**: The plan correctly identifies this as a risk (Risks table, row 1) and the mitigation is a JSDoc comment plus a future reconciliation endpoint. That is proportional. However, the `VOLUME_TIERS` constant exists solely to power the `calculateCharges()` display function for the dashboard. This is display-only math -- Stripe does the actual billing. If the tiers drift, the dashboard shows wrong numbers but nobody is overbilled. The risk severity in the plan says "High" -- it should say "Medium" since this is a display error, not a billing error. No code change needed; just calibrate the risk honestly so it does not justify building a reconciliation endpoint prematurely.
- **TASK**: When reviewing Task 1 output at Gate 1, confirm the JSDoc comment makes the Stripe-is-authoritative relationship clear. Resist any future temptation to add automated Stripe-to-code tier sync until there is evidence of actual drift.

---

### [simplicity-2]: Month-boundary previous-period query adds conditional complexity

- **SCOPE**: Task 3, `src/meter-reporter.js` -- previous-period tail logic
- **CHANGE**: Consider deferring the previous-period query (day 1 of month, first 12 hours)
- **WHY**: The prompt in Task 3 specifies: "Add a second query for the previous period if `new Date().getUTCDate() <= 1 && new Date().getUTCHours() < 12`." This is a conditional code path that fires ~12 hours per month, handling unreported tail from the prior period. It adds branching, a second DB query, and a second reporting loop -- all for an edge case that only matters if the final hourly tick of the month (23:00 UTC on the last day) fails AND the tenant had unreported delta at that moment. The natural retry (next hourly tick at 00:00) already picks up any delta because `capture_count > reported_capture_count` is period-scoped and the prior period's rows persist. The 12-hour window is arbitrary. A simpler approach: always query both current and previous period (one query with `WHERE period IN (?, ?)`) -- eliminates the conditional branch entirely while still catching the edge case. Or defer the entire previous-period concern until there is evidence it matters (YAGNI). At WRL's current scale, a single missed hour at month boundary is not a billing emergency.
- **TASK**: At Gate 2, evaluate whether the month-boundary logic should be simplified to a two-period `IN` clause or deferred entirely. The conditional `getUTCDate() <= 1 && getUTCHours() < 12` check is the kind of time-dependent branching that is hard to test and easy to get wrong.

---

### What the plan gets right (worth preserving)

- **No new infrastructure**: piggybacks on existing per-minute cron. Zero new services, triggers, or bindings. Complexity budget spend: ~0.
- **No new dependencies**: pricing module is pure arithmetic. Meter reporter uses existing `stripe.js` and `db.js`. No npm additions.
- **Stripe as pricing authority**: reporting raw counts and letting Stripe's graduated tiers handle the math avoids duplicating billing logic. The `calculateCharges()` function is explicitly display-only.
- **Idempotency via state, not time**: `{tenantId}:{period}:{captureCount}` is deterministic and survives retry windows. Correct choice.
- **Clean file ownership**: no task touches another task's files. Parallel execution is safe.
- **Proportional gate placement**: Gate 1 on the schema migration (hard to reverse), Gate 2 on the billing pipeline (financial correctness). Dashboard endpoint has no gate (low blast radius, easy to fix). Good judgment.

### Complexity budget tally (managed/serverless column)

| Item | Cost | Justification |
|------|------|---------------|
| New module (`pricing.js`) | 0 | Pure function, no abstraction layer |
| New module (`meter-reporter.js`) | 0 | Orchestration only, uses existing primitives |
| D1 schema change (2 columns) | 1 | Schema changes are permanent; cost is real but minimal |
| Dashboard response extension | 0 | Additive field on existing endpoint |
| **Total** | **1** | Well within budget for the problem size |

No blocking concerns. Proceed to execution.
