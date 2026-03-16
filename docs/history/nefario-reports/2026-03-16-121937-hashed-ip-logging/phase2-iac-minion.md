# Domain Plan Contribution: iac-minion

## Recommendations

### 1. Web Crypto API is the correct and only choice

`crypto.subtle` is the right primitive. Zero npm dependencies needed. The project already uses `crypto.subtle` extensively in `src/signing.js` (importKey, sign, verify, digest) and `src/auth.js` (timingSafeEqual) and `src/warc.js` (digest). HMAC-SHA256 via `crypto.subtle.sign('HMAC', ...)` is a standard Web Crypto operation fully supported in Cloudflare Workers. Adding an npm crypto dependency would violate the project's lean-and-mean philosophy and introduce supply chain risk for zero benefit.

The specific Web Crypto calls needed:

```js
// One-time per request (or cached per day):
const key = await crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(seed + dateString),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign']
);

// Per log call:
const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
```

### 2. IP_HASH_SEED secret provisioning

**Production**: Set via `wrangler secret put IP_HASH_SEED`. This follows the exact same pattern as `CORALOGIX_SEND_KEY`, `CAPTURE_API_KEY`, and `SIGNING_KEY`. The wrangler.toml comment block (line 39) should be updated to include `IP_HASH_SEED` in the documented secrets list. No changes to wrangler.toml `[vars]` -- this is a secret, not a var.

**Staging**: Set via `wrangler secret put IP_HASH_SEED --env staging`. The comment block at line 46 should be updated. The deploy-staging.yml workflow needs `IP_HASH_SEED` added to:
1. The `secrets: |` block (line 43-45) -- add `IP_HASH_SEED`
2. The `env:` block (line 47-49) -- add `IP_HASH_SEED: ${{ secrets.WRL_STAGING_IP_HASH_SEED }}`

**GitHub environment secret**: Add `WRL_STAGING_IP_HASH_SEED` to the `staging` GitHub environment. For production, `IP_HASH_SEED` is set directly on the Worker via `wrangler secret put` (no GitHub Actions deploy for production yet).

**Seed value**: The seed should be a high-entropy random string (32+ bytes, generated via `openssl rand -base64 32` or similar). Production and staging MUST use different seeds -- sharing seeds would allow cross-environment correlation of hashed IPs, which defeats the purpose of environment isolation.

**Local dev**: For local development, the seed can be set in `.dev.vars` (which is gitignored). The `log()` function already no-ops when `CORALOGIX_SEND_KEY` is absent, so in practice the hashing code path will only execute when logging is active.

### 3. Test environment binding

**Yes, `vitest.config.js` needs an `IP_HASH_SEED` binding** -- but only if the hashing function is testable via the log module or a dedicated unit. Looking at the current pattern:

- `vitest.config.js` miniflare bindings (line 22-26) already include `CAPTURE_API_KEY` and `SIGNING_KEY`
- The log test file (`test/log.test.js`) constructs its own `mockEnv` objects rather than using the miniflare bindings

There are two valid approaches:

**Option A (recommended)**: Add `IP_HASH_SEED: 'test-ip-hash-seed'` to the miniflare bindings in `vitest.config.js`. This makes the secret available to integration tests that exercise the full request path (where `env` comes from miniflare). Unit tests of the hash function itself can pass any seed. This is consistent with how `CAPTURE_API_KEY` and `SIGNING_KEY` are handled.

**Option B**: Don't add to vitest.config.js. Since `log()` already no-ops in tests (CORALOGIX_SEND_KEY absent from miniflare wrangler config), the hashing code path never fires in integration tests. Only add the binding if integration tests are written that set up a full Coralogix-mocked env.

I recommend Option A for forward compatibility. The cost is one line in vitest.config.js. The benefit is that any future integration test that exercises logging with IP hashing won't need to remember to set this binding.

### 4. Latency concern with async crypto.subtle.sign in fire-and-forget path

**No latency concern.** Here is the analysis:

1. **The log path is already fire-and-forget.** The `log()` function returns a Promise that callers pass to `ctx.waitUntil()`. The response to the client has already been sent by the time logging executes. Adding ~0.1ms of HMAC-SHA256 computation to a path that already does an outbound HTTP fetch to Coralogix is negligible.

2. **HMAC-SHA256 is extremely fast.** On Cloudflare Workers (V8 isolates), `crypto.subtle.sign('HMAC', ...)` for a short input (an IP address is at most 45 bytes for IPv6) completes in microseconds. Benchmarks on Workers show <0.05ms for HMAC-SHA256. The Coralogix fetch itself takes 50-200ms.

3. **Key import is the heavier operation.** `crypto.subtle.importKey` is more expensive (~0.1-0.5ms) than the sign operation. The daily key rotation design means the key can be cached for the entire day. **Recommendation: cache the imported CryptoKey in module scope, keyed by the date string, exactly like `src/signing.js` caches the Ed25519 key.** This amortizes the importKey cost to once per isolate per day.

4. **The log function is synchronous-entry, async-internal.** Currently `log()` synchronously creates a fetch Promise. With IP hashing, it must become async (await the HMAC). This changes the function signature: callers using `log(env, ...)` without await will get a Promise back, which is already the pattern. However, the `try { return fetch(...) }` pattern in `log()` must be updated to accommodate the async hashing step before the fetch. The function should remain infallible -- any crypto error should be caught and result in either logging without the hash field or silently dropping the hash.

### 5. Interaction with existing secret bindings

The existing secrets model is clean and consistent:

| Secret | Set via | Used in |
|--------|---------|---------|
| `CAPTURE_API_KEY` | `wrangler secret put` | `src/auth.js` |
| `SIGNING_KEY` | `wrangler secret put` | `src/signing.js` |
| `CORALOGIX_SEND_KEY` | `wrangler secret put` | `src/log.js` |
| `IP_HASH_SEED` (new) | `wrangler secret put` | `src/log.js` (or new hash helper) |

`IP_HASH_SEED` follows the same pattern. No conflicts. The `env` object in Workers makes all secrets available as string properties. The new secret is independent of the others -- no key derivation chain, no ordering dependency.

**Graceful degradation**: The hashing function should be designed to degrade gracefully when `IP_HASH_SEED` is absent. Two options:
- **Option A**: Omit the `ipHash` field from log entries entirely when the seed is missing. This is the safest -- no partial data, clear signal in logs that hashing is not configured.
- **Option B**: Log a placeholder value (e.g., `"unconfigured"`).

I recommend Option A. It matches the `log()` function's existing pattern of graceful degradation (no-op when config is missing).

### 6. Daily key rotation design consideration

The issue specifies "hash key rotates daily (derived from date + secret seed)." The derivation should use a deterministic, unambiguous date format. I recommend:

```js
const dateKey = new Date().toISOString().slice(0, 10); // "2026-03-16"
const keyMaterial = `${env.IP_HASH_SEED}:${dateKey}`;
```

This means the same IP on different days produces different hashes, preventing long-term tracking. But within a single day, the same IP produces the same hash, enabling abuse correlation within a 24-hour window. The colon separator prevents ambiguity between seed and date (important if the seed happens to end with digits).

**Timezone consideration**: `new Date().toISOString()` uses UTC. This is correct -- Workers run on UTC by default, and all timestamps in the existing log entries use `Date.now()` (epoch ms, timezone-agnostic). Using UTC ensures all Worker isolates across all PoPs derive the same daily key.

## Proposed Tasks

### Task 1: Create IP hashing helper
- New function (either in `src/log.js` or a new `src/ip-hash.js`) that:
  - Takes `env` and `ip` string
  - Returns a hex-encoded HMAC-SHA256 hash (or truncated, e.g., first 16 hex chars)
  - Caches the imported CryptoKey in module scope, keyed by date string
  - Returns `null` when `IP_HASH_SEED` is absent
  - Never throws (infallible, like `log()`)

### Task 2: Update log() signature or add ipHash to log callers
- Modify `log()` to accept an optional `ipHash` field in the `data` object, or
- Have callers compute the hash and include it in the data payload before calling `log()`
- The second approach is simpler -- `log()` stays unchanged, callers add `ipHash` to their data objects

### Task 3: Provision IP_HASH_SEED secret
- Update wrangler.toml comments to document `IP_HASH_SEED` as a required secret
- Add `IP_HASH_SEED` to deploy-staging.yml secrets block
- Add `WRL_STAGING_IP_HASH_SEED` GitHub environment secret
- Generate and set the production secret via `wrangler secret put IP_HASH_SEED`
- Generate and set the staging secret via `wrangler secret put IP_HASH_SEED --env staging`
- Add to `~/.secrets` for local reference (non-exported, matching `WRL_CAPTURE_API_KEY` pattern)

### Task 4: Update vitest.config.js
- Add `IP_HASH_SEED: 'test-ip-hash-seed'` to miniflare bindings

### Task 5: Write unit tests for IP hashing
- Test that the hash is deterministic (same IP + same date + same seed = same hash)
- Test that different IPs produce different hashes
- Test that different dates produce different hashes (mock Date)
- Test that missing `IP_HASH_SEED` returns null
- Test that the function never throws (pass garbage inputs)

### Task 6: Update index.js log calls to include ipHash
- In `handleCreateCapture`, compute ipHash from `CF-Connecting-IP` and pass it through to all log calls in the capture pipeline
- In security event log calls (auth_fail, rate_limit), compute ipHash from `CF-Connecting-IP`
- The `ip` parameter already flows through `performCapture(env, url, ip, captureId, tenantId)` -- the hash can be computed at the entry point and threaded through

## Risks and Concerns

### Risk 1: IP_HASH_SEED not set in production at deploy time
**Impact**: All log entries will lack the `ipHash` field. Not a correctness issue (graceful degradation), but defeats the purpose.
**Mitigation**: Add `IP_HASH_SEED` to the documented secrets checklist. Consider a health check enhancement that reports which optional features are configured (low priority, post-MVP).

### Risk 2: Module-scoped key cache and isolate recycling
**Impact**: Cloudflare Workers recycle V8 isolates. The module-scoped cache persists across requests within an isolate but not across isolate restarts. If an isolate lives across a UTC day boundary, it will serve stale keys until the date check invalidates the cache.
**Mitigation**: The cache key includes the date string. On each call, compare current date to cached date. If different, re-derive. This is already the designed behavior -- just verify the implementation does this correctly.

### Risk 3: Truncated hash length and collision risk
**Impact**: If the hash is truncated (e.g., 16 hex chars = 64 bits), birthday paradox gives ~2^32 IPs before a 50% collision probability. With the typical request volume of this service (hundreds/day), collision risk is effectively zero.
**Mitigation**: Use full 64 hex chars (256 bits) unless log storage cost is a concern. 64 extra bytes per log entry is negligible.

### Risk 4: deploy-staging.yml must be updated before first staging deploy
**Impact**: If the code references `env.IP_HASH_SEED` and the secret is not provisioned, the feature degrades gracefully (returns null). But the staging deploy workflow needs the secret in the `secrets:` block for wrangler-action to inject it.
**Mitigation**: Update deploy-staging.yml in the same PR as the code change. The secret must be added to the GitHub environment before merging.

### Risk 5: The `log()` INVARIANT comment
The existing doc comment states: "INVARIANT: data must contain only static values and predetermined strings, never attacker-controlled input." An IP hash is derived from attacker-controlled input (the client IP), but the HMAC output is a fixed-length hex string -- it cannot contain injection payloads. The invariant is preserved in spirit (the hash is a fixed-format derived value, not raw attacker input). The doc comment should be updated to clarify that HMAC-derived values from attacker input are acceptable because the output format is constrained.

## Additional Agents Needed

None beyond what is presumably already involved. The task is well-scoped within infrastructure (secrets provisioning, CI/CD pipeline updates) and application code (log.js, capture.js). If a **security-minion** is not already part of this planning round, they should review the HMAC construction (seed + date concatenation, key derivation correctness, hash truncation decision) to confirm there are no cryptographic weaknesses. But the construction is standard and low-risk.
