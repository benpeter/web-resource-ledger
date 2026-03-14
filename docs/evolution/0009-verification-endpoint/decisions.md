# Decisions: Verification Endpoint

## 1. Server Key Only (Not Embedded Key)

**Decision**: Use `env.SIGNING_KEY` exclusively for signature verification.
Never trust the embedded `signedData.publicKey` from the WACZ.

**Alternatives considered**:
- Embedded key (simpler, no server dependency) -- rejected because it
  enables key-substitution attacks: an attacker who replaces the WACZ can
  replace both the signature and the embedded key, and verification passes.
- Dual verification (check both) -- rejected as unnecessary complexity;
  server key is the trust anchor.

**Rationale**: The WACZ code itself states "Verifiers MUST pin against an
operator-published key, not trust the embedded key blindly." Key rotation
breaking old verifications is an accepted MVP limitation with a clear fix
(key versioning, backlogged).

## 2. Cache-Control: Conditional Split (Deviation from Issue Spec)

**Decision**: `public, max-age=86400, stale-while-revalidate=604800` for
`verified: true`; `no-store` for `verified: false` and 404.

**Issue spec said**: `Cache-Control: public, immutable, max-age=31536000`

**Why we deviated**: The captures and WACZ files are immutable, but the
verification *judgment* depends on a mutable trust anchor (the server signing
key). If a key is compromised, `immutable` would persist stale verification
results indefinitely. The 24-hour TTL means key compromise propagates within
a day. `no-store` on false results prevents transient failures from caching.

security-minion raised this, ux-strategy-minion provided the conditional
split refinement. Documented as a deliberate deviation.

## 3. Response Shape: Array of Checks (Deviation from Issue Spec)

**Decision**: Three named checks in an array with `pass/fail/skip` status
strings, plus `signing` metadata object.

**Issue spec said**: `{ "verified": true|false, "capture": { ... }, "artifacts": { ... } }`

**What changed**:
- `artifacts` became `checks` -- an array of `{ name, status, detail? }`
  objects for the three verification steps
- Added `signing` field (not `wacz`) with bundleHash, signature, publicKey,
  signedAt from the WACZ digest
- `capture` object omits `url` (security: verify is public/cached, retrieval
  uses private/no-store to protect URLs)

**Rationale**: api-design-minion proposed the extensible array format,
ux-strategy-minion contributed the `pass/fail/skip` enum (forward-compatible
for future check types). The field is named `signing` (not `wacz`) to avoid
collision with the retrieval endpoint's `wacz` field which has a different
shape (url, size, bundleHash).

## 4. Three Checks vs Two

**Decision**: Three independent checks: `artifactHashes`, `bundleHash`,
`signature`. All run regardless of earlier failures.

**Alternative**: Two checks (`bundleHash` + `signature` only) for MVP
simplicity.

**Rationale**: `artifactHashes` verifies individual file integrity inside
the WACZ -- without it, an attacker could replace an inner file as long as
they don't change `datapackage.json`. The implementation cost is low (the
WACZ is already unzipped). Running all checks prevents timing oracles and
gives operators diagnostic value.

## 5. Drop capture.url from Verify Response

**Decision**: The verify response's `capture` object contains `id`,
`createdAt`, `completedAt` but NOT `url`.

**Rationale**: The retrieval endpoint uses `Cache-Control: private, no-store`
specifically because the capture URL may be sensitive (legal/compliance
captures). The verify endpoint caches `verified: true` responses publicly
for up to 7 days. Publishing `capture.url` on a public, long-cached endpoint
breaks the access-control model that private caching was designed to enforce.
security-minion raised this as a HIGH priority advisory.

## 6. Size Guard Before arrayBuffer()

**Decision**: Check `obj.size` BEFORE calling `obj.arrayBuffer()`, not after.

**Rationale**: If a WACZ in R2 is unexpectedly large, the size check must
gate the memory allocation. As originally written in the plan, the step
numbers would have loaded the full object into memory before checking size.
security-minion caught this ordering issue.
