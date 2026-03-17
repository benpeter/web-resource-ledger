# Margo Review -- Admin Key Revocation Safety Guards

## Verdict: APPROVE

## Reasoning

The plan is well-proportioned to the problem. The user asked for two guards; the plan delivers one runtime guard and one TODO comment. Single task, single batch, two files touched. That is the right shape.

### Complexity Assessment

**Essential complexity**: The last-admin-key guard requires a pre-flight read and a list-then-count check. This is inherent to the problem -- you cannot know if a key is the last admin key without listing admin keys. The pre-flight read to handle the already-revoked idempotent path without a redundant write is a reasonable optimization given that it also eliminates the timestamp heuristic.

**Accidental complexity**: None identified. The plan explicitly avoids:
- Distributed locking or CAS (YAGNI -- rate limit + env var fallback make races acceptable)
- Refactoring `revokeApiKeyRecord` (leaves working code alone, accepts the extra KV read)
- New KV indexes (YAGNI -- single-digit keys per tenant)
- Runtime self-revocation guard (YAGNI -- impossible today since ADMIN_KEY has no hash)

**Complexity budget tally**: Zero new technologies, zero new services, zero new abstraction layers, zero new dependencies. The change is localized to one function in one file plus tests. Budget spend: effectively zero.

### YAGNI Check

- Self-revocation: correctly scoped as a TODO, not code. The plan explains why it is impossible today (ADMIN_KEY is an env var with no keyHash). Building it now would be speculative.
- Race condition mitigation: correctly deferred. The plan documents why (rate limit, env var fallback) rather than building distributed locking for a problem that requires concurrent requests within the same 60s rate limit window on a single-digit-keys-per-tenant system.
- Pagination: noted as future consideration, not built. Correct.

### Proportionality

The implementation adds roughly 20-30 lines of logic (one read, one conditional list, one count, one 409 return) plus a TODO comment and a limitation comment. Six tests cover the guard's behavior comprehensively, including tenant isolation and idempotency edge cases. This is proportionate to a safety guard on a rate-limited admin endpoint.

### One Observation (Non-Blocking)

The plan specifies six tests for a guard that has three branches (admin key + last = 409, admin key + not last = 200, non-admin key = skip). Tests 4 (idempotent re-delete) and 6 (RFC 9457 shape) test behavior that already exists or is covered by `problemResponse` infrastructure. They are not wrong -- they verify the new code path exercises existing behavior correctly -- but this is thorough coverage, not minimal coverage. Not a concern, just noting that the test count is at the upper bound of proportionality.

### Boundaries

The plan's explicit "do NOT" list (lines 170-177) prevents scope creep effectively. No files beyond admin.js and the test file. No refactoring of existing KV functions. No new infrastructure.

No simplifications to propose. The plan is already the simple version.
