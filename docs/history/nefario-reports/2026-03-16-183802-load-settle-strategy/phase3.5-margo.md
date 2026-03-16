# Margo Review: Load + Settle Strategy

## Verdict: APPROVE

This plan is proportionate to the problem. One constant added, one argument changed, one `waitForTimeout` inserted, and mechanical updates to tests and spec descriptions. No new dependencies, no new abstractions, no new services, no speculative features.

### What I checked

1. **Scope alignment**: The request is "switch from networkidle to load + settle delay." The plan does exactly that -- nothing more. Single task, four files touched, all changes mechanical. No scope creep.

2. **YAGNI**: No speculative features detected. The plan explicitly lists what NOT to change (staged fallback structure, partial capture logic, consent pipeline). Good discipline.

3. **Complexity budget**: Zero new technologies, zero new dependencies, zero new abstraction layers. One new constant (`SETTLE_DELAY_MS`). Total complexity cost: effectively zero.

4. **NAV_TIMEOUT_MS justification**: The decision to keep 20s rather than raise to 25s is well-reasoned and reduces budget risk. The arithmetic is sound. Both specialists independently arrived at the same conclusion. This is the simpler, safer choice.

5. **No over-engineering**: The settle delay is a plain `waitForTimeout` / `setTimeout` -- not a polling loop, not an event listener, not a "smart" settle detector. This is the simplest possible implementation. Good.

6. **Single task, no approval gate**: Correct for the scope. This is a four-file change that's easy to review and easy to revert.

### One observation (non-blocking)

The plan notes risk #3: if `load` fires at 19.9s, total budget could reach 32.9s (past 30s). The mitigation ("deeply pathological") is reasonable but worth watching in production logs. This is an operational concern, not a plan concern -- no code change needed.

No issues found. Proceed.
