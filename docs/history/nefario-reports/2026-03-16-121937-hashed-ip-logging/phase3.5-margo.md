# Margo Review: hashed-ip-logging

## Verdict: APPROVE

This plan is proportional to the problem. Two issues, three tasks, seven modified files, one new file, zero new dependencies. The complexity budget is low and justified.

### What I checked

**Scope alignment**: The request asks for HMAC-SHA256 hashed IP logging (#36) and fixing categorizeError (#52). The plan delivers exactly that. No adjacent features, no future-proofing, no technology expansion. Task count (3) is appropriate for two features plus their tests.

**Dependency minimalism**: Zero new dependencies. Uses Web Crypto API (`crypto.subtle`) already present in the project (pattern established in `signing.js`). This is the correct choice.

**YAGNI compliance**: The plan explicitly declines IPv6 normalization ("YAGNI -- the project is single-tenant with low traffic"), declines testing daily key rotation via Date mocking ("adds complexity for low value"), and declines refactoring `performCapture()` to an options object ("acceptable for this PR, flag for future refactor if more parameters are added"). All three are correct calls.

**Abstraction layers**: `ip-hash.js` is a single-function module. No class hierarchy, no factory, no interface. The function is called directly from `index.js` and the result is threaded as a plain value. This is the right level of abstraction.

**KISS check**: The two-step HMAC derivation (`dailyKey = HMAC(seed, date)`, then `hash = HMAC(dailyKey, ip)`) is the one area that could appear over-engineered compared to single-step `HMAC(seed + date, ip)`. However, the plan documents the reasoning (HKDF-like separation, daily key caching), and the implementation cost is one extra `importKey` call cached in module scope. The complexity delta is negligible and the security hygiene is real.

**Complexity metrics**: `computeCip()` will have cyclomatic complexity around 3-4 (null checks, date comparison, try/catch). The changes to `index.js` are mechanical (add `cip` to existing log data objects). The `categorizeError()` additions are three new `if` branches -- well within thresholds.

### One minor note (non-blocking)

The `performCapture()` signature is expanding to 7 positional parameters (`env, url, ip, captureId, tenantId, cip, renderer`). The plan acknowledges this and defers the options-object refactor. That is correct for this PR. If a future task adds an 8th parameter, that refactor should happen then, not now.

No BLOCK or ADVISE items. The plan is lean and does what was asked.
