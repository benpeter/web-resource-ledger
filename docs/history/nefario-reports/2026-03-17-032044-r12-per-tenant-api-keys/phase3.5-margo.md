# Margo Review: R12 Per-Tenant API Keys

## Verdict: APPROVE

This plan is well-proportioned to the problem. The scope aligns tightly with
the issue request (multi-tenant keys, admin API, scope enforcement, migration
runbook). The conflict resolutions are sound -- every one either chose the
simpler option or justified the added complexity with a concrete operational
need. Several decisions actively reduce complexity versus alternatives
considered.

---

## Positive Findings

**YAGNI applied correctly in five places:**

1. `lastUsedAt` deferred (Conflict 5) -- KV write on every request for 2-3
   tenants is textbook premature optimization.
2. No pagination on list endpoint -- correct at single-digit key counts.
3. No CORS on admin endpoints -- server-to-server only.
4. No separate `verifyAdminAuth()` -- reuses unified `verifyApiKey()` +
   `requireScope()`.
5. `performCapture` parameter sprawl acknowledged but not refactored (Risk 6)
   -- right call; refactoring for aesthetics mid-feature is scope creep.

**Complexity budget is proportional:**

- 0 new dependencies
- 0 new technologies
- 1 new file (`src/admin.js`)
- 1 new KV schema pattern (apikey: records, tenant-keys: index)
- Reuses existing infrastructure (KV, rate limiters, problemResponse, log)

This is exactly the footprint a multi-tenant key system should have on a
Cloudflare Worker.

**Conflict resolutions are sound:**

- Folding `scope_violation` into `auth_fail` (Conflict 2) removes an event type.
  Simpler.
- Full 64-char hash everywhere (Conflict 3) removes a mapping between display ID
  and storage ID. One identifier format is simpler than two.
- Required `name` field (Conflict 4) is a single string field that prevents
  operational guesswork. Justified.
- 200 with confirmation body on DELETE (Conflict 1) is a minor deviation from
  REST convention, but the reasoning (operator safety on a security-critical
  action) is sound.

---

## Findings

### Finding 1: Task 2 prompt cognitive complexity -- dense but not over-engineered

The Task 2 prompt for `src/admin.js` is the longest in the plan (~190 lines of
specification for three handlers). I examined whether this could be decomposed
into separate tasks.

**Assessment: justified.** The three handlers share key generation logic, KV
schema, auth patterns, and rate limiting. Splitting them would create artificial
task boundaries and inter-task coordination overhead. The density is proportional
to the surface area (three endpoints with security invariants). The "What NOT to
do" section actively prevents complexity (no separate auth function, no
pagination, no lastUsedAt, no raw key logging).

No action needed.

### Finding 2: Secondary index race condition (Risk 4) -- acceptable tradeoff

The `tenant-keys:{tenantId}` read-modify-write pattern has a known race
condition under concurrent key creation. The plan acknowledges this, cites the
5/min rate limit and single-digit key counts as mitigations, and notes the
primary record is the source of truth.

**Assessment: correct tradeoff.** Fixing this properly would require either a
Durable Object or a transactional KV pattern -- both add substantial complexity
for a scenario that is effectively impossible at current scale. The plan's
documentation of this as a known limitation is the right approach.

No action needed.

### Finding 3: Task 3 line-number references are brittle

Task 3's prompt references specific line numbers in `src/index.js` (lines 144,
153, 177, 221, 228, 263, 292) and `src/capture.js` (line 192). These will be
wrong if Task 1 or Task 4 modifies the file first, or if upstream commits shift
lines before execution.

**Assessment: low risk.** Task 3 depends on Task 1, and Task 1 only modifies
`src/auth.js` -- not `src/index.js` or `src/capture.js`. Task 4 modifies
`wrangler.toml` and `vitest.config.js`, not source files. The line numbers are
guidance for the implementing agent, not machine-parsed offsets. The surrounding
context (event names like `security.rate_limit`, `security.capacity_limit`) is
sufficient for the agent to locate the correct log calls even if line numbers
drift.

No action needed.

### Finding 4: Admin rate-limit-before-auth ordering

The plan places rate limiting *before* auth on admin endpoints (Task 2), while
existing capture/list endpoints do auth *before* rate limiting (Task 3
explicitly preserves this). This is an intentional divergence documented in the
plan.

**Assessment: justified.** Admin endpoints are high-value targets for
credential-stuffing attacks. Rate limiting before auth prevents an attacker from
consuming compute on auth checks. The capture endpoints rate-limit after auth
because they need `tenantId` for the rate limit key, and unauthenticated
requests are cheap to reject. The plan's "What NOT to do" in Task 3 calls this
out explicitly. Two patterns for different threat models is warranted here.

No action needed.

---

## Summary

Six tasks, zero new dependencies, one new file, tight scope alignment with the
issue request. The plan actively applies YAGNI in five documented places, defers
features that are not needed at current scale, and reuses existing
infrastructure throughout. The conflict resolutions consistently chose the
simpler option or justified added complexity with concrete operational needs.
The complexity is essential, not accidental.
