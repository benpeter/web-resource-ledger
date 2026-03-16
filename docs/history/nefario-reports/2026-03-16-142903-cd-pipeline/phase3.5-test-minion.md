# Test-Minion Review: R14 Production CD Pipeline

**Verdict: ADVISE**

The plan is sound and the smoke test script is fit for purpose. Two issues worth flagging.

---

## Issue 1: Staging smoke job checks staleness, not correctness (low severity)

The production workflow's `staging-smoke` job runs the smoke test against staging before allowing production deploy. But it validates that staging is *currently healthy*, not that staging is *running the code being promoted*. If staging is healthy from a prior deploy and the current push introduced a regression that staging hasn't picked up yet (race condition between the two workflows both triggered on the same push), the gate passes incorrectly.

This is inherent to the chosen architecture (Conflict 1) and the synthesis correctly acknowledges it: "staging always runs the same or newer code than any tag being deployed." For a solo linear history on main, this is acceptable. The risk is documented in the risk table.

No change needed — just confirming this is understood and the synthesis's rationale holds.

---

## Issue 2: Production smoke uses SMOKE_SKIP_CAPTURE=1, reducing functional coverage (noted concern, not a blocker)

The production smoke skips Check 4 (capture round-trip). The rationale is solid: no cleanup API, real R2 cost, Browser Rendering sessions. But this means production smoke only validates:
- Health endpoint responds 200 with `status: ok`
- Security headers are present
- Signing key endpoint returns Ed25519 key

It does NOT validate:
- POST /v1/captures accepted (auth is working, API routing is live)
- R2/KV bindings are configured for production

This is a conscious tradeoff. The synthesis notes "environment-specific R2/KV binding issues are inherent in multi-env setups." If production KV bindings are misconfigured, the smoke passes and the first real user discovers the failure.

The backlog already has `[consider] Deploy version check in smoke test`. I'd add a companion:
- `[consider] Minimal authenticated request in production smoke` — POST /v1/captures with a synthetic URL, immediately retrieve status, then DELETE (if a DELETE endpoint exists or is added). Validates auth, R2 write path, and KV read path without leaving real data. Trigger: when production has had a silent R2/KV binding failure.

This is advisory, not a blocker. The current scope is appropriate for MVP.

---

## Confirmed: No test infrastructure gaps

- Smoke test script is environment-agnostic and correct. `SMOKE_SKIP_CAPTURE` flag works as designed.
- SHA-pinned actions match staging workflow. No new test dependencies introduced.
- The staging `test` job (npm test + lint) still runs on every push via the staging workflow. The production workflow does not duplicate this, which is correct — it reuses the staging validation signal.
- Parallel workflow execution (staging + production both trigger on push to main) is safe. The two smoke jobs are independent reads against staging's live URL; no shared write state.

---

## Summary

The plan is implementable as written. The two issues above are acknowledged risks, not defects. The backlog suggestion for a production authenticated-request check is the only net-new recommendation.
