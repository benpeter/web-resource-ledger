# Margo Review: Hashed IP Logging

## Verdict: ADVISE

The changeset is proportional to the requirement. A single new module
(`ip-hash.js`, 62 lines) implements daily-rotating HMAC-SHA256 IP hashing
with zero external dependencies -- just Web Crypto API. No new abstractions,
no new layers, no frameworks. The `cip` value threads through existing log
calls as one additional field. This is the right shape for the feature.

Two items are worth calling out. Neither blocks the PR, but both should be
addressed before or shortly after merge.

---

## Findings

### 1. Wasted async work on read-only public endpoints

**What:** `handleGetSigningKey` (line 468) and `handleGetSigningKeys`
(line 492) in `src/index.js` both call `await computeCip(env, ...)` on
every request. Both endpoints only use the resulting `cip` inside the
rate-limit rejection branch. On the happy path (the vast majority of
requests), the HMAC computation runs and the result is discarded.

**Why accidental:** These are public, cacheable, read-only endpoints.
Running two HMAC operations (importKey + sign, or cached sign) per request
adds latency on the hot path for a value that is only consumed when the
rate limiter fires. The cost is small per-call (sub-ms with the cache hit)
but multiplied across all requests to these endpoints.

**Simpler alternative:** Move `computeCip` inside the `if (!success)` block
so it only runs when a rate-limit log is actually emitted:

```js
if (!success) {
  const cip = await computeCip(env, request.headers.get('CF-Connecting-IP') || 'unknown');
  ctx.waitUntil(log(..., { ..., cip }) ?? Promise.resolve());
  return problemResponse(429, ...);
}
```

The same pattern applies to `handleVerifyCapture` (line 367), which also
computes `cip` at the top but only uses it in the rate-limit rejection log.

**Severity:** Low. Non-blocking. The daily key cache means the second+ call
per isolate per day is a single HMAC sign (~microseconds). But the principle
of "don't compute what you won't use" applies -- especially on latency-
sensitive public endpoints where the project targets sub-300ms uncached.

### 2. Repeated `request.headers.get('CF-Connecting-IP') || 'unknown'` pattern

**What:** The expression `request.headers.get('CF-Connecting-IP') || 'unknown'`
appears 10 times across `src/index.js` -- once per `computeCip` call and once
per rate-limiter call in each handler.

**Why accidental:** This is a readability and maintenance concern. If the
header name ever changes (unlikely but possible with non-Cloudflare
deployments) or the fallback logic needs adjustment, 10 locations need
updating. More importantly, the duplication makes it harder to verify at a
glance that all call sites behave consistently.

**Simpler alternative:** Extract the IP once at the top of each handler:

```js
const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
```

Then pass `clientIp` to both `computeCip` and the rate limiter. This is a
one-line extraction, not an abstraction layer.

**Severity:** Low. Non-blocking. Readability improvement only.

### 3. Log INVARIANT comment update in `src/log.js` is correct and necessary

The INVARIANT comment now explicitly calls out HMAC-derived values and
truncated framework error messages as acceptable log data. This is good --
it documents the security reasoning for the new `cip`, `errorName`, and
`errorMessage` fields without widening the contract to arbitrary
attacker-controlled input. No concern here; noting for completeness.

---

## Complexity Budget Tally

| Addition                              | Column    | Cost |
|---------------------------------------|-----------|------|
| New module (ip-hash.js)               | Serverless| 0    |
| New secret (IP_HASH_SEED)             | Serverless| 1    |
| New dependency                        | --        | 0    |
| New abstraction layer                 | --        | 0    |

**Total spend: 1.** Well within budget. The module uses platform-native
Web Crypto (zero dependencies). The only new operational surface is one
additional secret to manage per environment.

---

## What is done well

- **Zero dependencies.** Web Crypto HMAC is the right tool. No npm packages
  for hashing.
- **Graceful degradation.** `computeCip` returns `undefined` when the seed
  is absent. Log calls include `cip: undefined` harmlessly. Local dev and
  tests without the seed just omit the field. No feature flags, no
  conditionals in callers.
- **Daily rotation via HMAC key derivation.** The two-step HMAC
  (seed -> daily key -> IP hash) is a clean pattern that limits the
  correlation window without complex key management. The daily key cache
  avoids redundant importKey calls.
- **Module-scoped cache is appropriate.** Worker isolates are short-lived;
  a module-scoped cache with a date check is the simplest correct approach.
  No LRU, no TTL library, no Map with eviction -- just a variable and a
  string comparison.
- **Tests cover the right surface.** Determinism, graceful degradation
  (null env, empty seed, missing seed), edge cases (IPv6, empty string,
  "unknown"). The `capture.test.js` additions for new error patterns are
  proportional.
- **The INVARIANT update is honest.** It documents exactly what expanded
  and why, rather than silently widening the contract.

---

## Summary

The implementation is lean, dependency-free, and proportional to the
requirement. The two items above are minor efficiency and readability
improvements -- not architectural concerns. No YAGNI violations, no
premature optimization, no scope creep. The new error patterns in
`categorizeError` are driven by observed Playwright failure modes, not
speculation.
