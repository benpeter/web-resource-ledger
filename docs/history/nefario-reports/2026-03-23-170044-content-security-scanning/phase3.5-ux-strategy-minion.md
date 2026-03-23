## UX Strategy Review

**Verdict: ADVISE**

### What works well

The journey is coherent for the developer/API-consumer audience. One new status value (`quarantined`), one new response code (451), metadata always accessible, artifacts restricted. The `capture.quarantined` webhook gives tenants timely notification. The earlier recommendation to reject the `contentRestriction` overlay was correct -- `status` as single source of truth is simpler to consume. Provider-agnostic naming (`threatCheck`, not `safeBrowsing`) reduces future breaking-change risk.

### Issue: `threatCheck` field tells the wrong story on quarantined captures

The quarantined capture metadata response (Task 3, Step 4) includes `threatCheck: record.threatCheck`. This field reflects the pre-capture screening result -- `'pass'` for any capture quarantined by the background re-scan cron (the common case), because it passed the check at creation time.

A developer seeing `status: 'quarantined'` alongside `threatCheck: 'pass'` will be confused: the two fields appear contradictory. They passed the threat check but are quarantined? The real explanation is buried in `quarantineReason`.

**Recommendation:** Omit `threatCheck` from the quarantined capture 200 response. The quarantine fields (`quarantineReason`, `quarantinedAt`) already communicate what matters. `threatCheck` is meaningful only on active captures (status `complete`) where it records the pre-capture gate result. Include it there but suppress it on quarantined captures, or add a brief schema note in the OpenAPI description: "Reflects pre-capture check only; not updated on quarantine by re-scan."

The alternative -- including it with a clarifying description -- works but adds cognitive load. Omitting it is simpler.

### Minor observations (non-blocking)

1. **Backwards compatibility gap**: API consumers currently using `status !== 'complete'` as their "ready" gate will silently treat quarantined captures as pending/in-progress rather than restricted. This is tolerable for a pre-1.0 product, but the OpenAPI spec and README should call it out explicitly: "Clients should handle `status: 'quarantined'` explicitly; it is distinct from `'pending'` and `'failed'`."

2. **UI deferral is correct**: The existing dashboard showing raw `status` value for unknown states is an acceptable stopgap. No objection to backend-first here.

3. **No threat types exposed to tenants in 451 body**: Correct. Generic "content security policy" wording in the 451 detail text is the right call -- threat type details belong to the operator layer, not the tenant-facing surface.

### Summary

The plan is ready to execute with one change: clarify `threatCheck` semantics on quarantined responses in Task 3 (Step 4) and in the OpenAPI spec (Task 6). Implementation can proceed; this can be resolved during implementation without a re-plan.
