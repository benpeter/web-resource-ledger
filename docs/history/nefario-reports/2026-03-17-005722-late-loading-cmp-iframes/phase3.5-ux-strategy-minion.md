## UX Strategy Review — cmp-late-frame-injection

**Verdict: APPROVE**

---

### Review Scope

This change has no user-facing UI. My review focuses on the operator and developer
experience of consuming the consent audit record (`{ status, cmp, durationMs }`),
specifically whether the journey from `notDetected` to `dismissed` or `failed` is
coherent and whether the status vocabulary serves the people who read it.

---

### Journey Coherence: Before and After

**Current state (broken journey)**

For NYT/OneTrust, the audit consumer sees:

```
status: 'none', cmp: null
```

This is a lie. The CMP exists and is active; the system simply missed it because
the iframe arrived late. The consumer cannot distinguish "no CMP on this page" from
"CMP present but injection missed the window." Both produce identical output. This
actively misleads anyone building dashboards, compliance reports, or alerting on
consent outcomes.

**After this fix (correct journey)**

NYT/OneTrust will produce either `dismissed` (success) or `failed`/`timeout`
(attempted but incomplete). The `cmp` field will be populated. The audit consumer
now knows: a CMP was present, an opt-out was attempted, and here is the outcome.
That is a meaningfully better signal.

---

### `failed` vs `notDetected`: The Core Question

The synthesis correctly closes the question by eliminating `notDetected` as a
reachable state for sites like NYT. After this fix, the status vocabulary covers
four distinct operator-legible outcomes:

| Status | Meaning | Actionable? |
|--------|---------|-------------|
| `dismissed` | CMP found, opted out | No action needed |
| `none` | No CMP detected | Verify page has no CMP |
| `timeout` | CMP found, opt-out stalled | Check CMP/timing |
| `failed` | CMP found, opt-out returned false | Check CMP rules/selectors |

`failed` is strictly more informative than `notDetected` for audit consumers. It
tells them: the system reached the CMP and tried, it just could not complete the
opt-out. That maps to a specific, diagnosable problem (selector mismatch, rule gap)
rather than an ambiguous absence.

The current status vocabulary has no `notDetected` state at the code level -- that
label appears only in the staging table in the synthesis doc, as a human-readable
gloss on what `none` meant before the fix. This is good design. Keeping the status
set minimal (4 values) is the right call.

---

### One Observation: `none` Still Carries Ambiguity

After this fix, `none` is closer to its intended meaning ("this page genuinely has
no CMP"), but it still collapses two distinct cases:

1. No CMP framework detected by autoconsent
2. CMP framework present but autoconsent has no matching rule for it

Both return `none`. This is a pre-existing limitation outside the scope of this
fix, and I am not recommending a change here. It is worth noting in the backlog
so a future phase can consider a `unsupported` status for case 2 if operator
observability becomes a priority. The current scope is correct -- do not expand it.

---

### Staging Validation Table

The expected outcomes table is well-constructed from a UX strategy perspective:
it distinguishes between "detected but failing" (Sourcepoint) and "not detected at
all" (NYT before fix), which is exactly the distinction that matters for audit
consumers. The explicit Sourcepoint acknowledgment (`failed` is acceptable, known
selector mismatch) prevents the team from interpreting a `failed` result as a
regression. That is clear, honest communication of system state.

---

### Summary

The fix improves the operator journey from misleading to accurate. The status
vocabulary is minimal and meaningful. The Sourcepoint situation is correctly
classified as a separate known limitation rather than scope-creep for this fix.
No UX concerns block execution.
