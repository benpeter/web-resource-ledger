# Decisions: OpenAPI Spec and Security Hardening

## 1. Signing-key response format: JSON envelope vs raw base64

**Decision**: JSON `{ algorithm: "Ed25519", publicKey: "<base64>" }`

The issue specified "base64-encoded raw bytes" but three specialists (api-design-minion, api-spec-minion, security-minion) independently recommended a JSON envelope. The entire API speaks JSON; `text/plain` would be the only exception. Two fields (algorithm + publicKey) are the minimum viable envelope and cost 20 bytes. Forward-compatible with key versioning.

**Rejected**: Raw base64 text/plain (inconsistent with API conventions, not self-describing).

## 2. Key versioning fields (keyId, createdAt)

**Decision**: Do not include. YAGNI.

ux-strategy-minion argued for `keyId` and `createdAt` from day one ("retrofitting it later is a breaking change"). api-design-minion countered that adding fields is not a breaking change -- it is additive. Including `keyId` now creates a contract obligation for key versioning that does not exist.

**Rejected**: Include keyId/createdAt (creates premature contract obligation).

## 3. Key versioning backlog priority

**Decision**: Keep as [should], do not elevate to [must].

ux-strategy-minion argued the signing-key endpoint creates an expectation that key rotation works gracefully. The concern is real but the mitigation is documentation (warn users prominently), not premature feature work.

## 4. HSTS parameters

**Decision**: `max-age=31536000; includeSubDomains` without `preload`.

`preload` is a one-way door -- removal from browser preload lists takes months. The domain is not finalized. Workers are already HTTPS-only, so HSTS is pure defense-in-depth. HSTS preload added as a [should] backlog item for after domain finalization.

**Rejected**: Include preload (irreversible commitment on an unfinalized domain).

## 5. Header consolidation strategy

**Decision**: Move X-Frame-Options to global wrapper. Keep CSP page-specific.

No API endpoint should be frameable (clickjacking prevention). The verify page's CSP contains `unsafe-inline` which is only appropriate for that page -- a global CSP would need to be the union of all endpoint needs, which is always weaker than per-endpoint policies.

## 6. Backpressure approach

**Decision**: Global-key rate limiter on capture endpoint only, returning 503.

The original issue asked for 503 "when Worker concurrency limit is approached" but Cloudflare Workers don't expose a concurrency gauge. edge-minion identified that the real capacity constraint is Browser Rendering (30 concurrent sessions), not Worker invocations. A fixed-key rate limiter (20/min) using the existing binding pattern is ~5 lines of code and provides the needed protection without Durable Objects or infrastructure overhead.

**Rejected**: Durable Object counter (over-engineering for the precision needed), accept-only-platform-503 (no control over the experience).

## 7. DNS pinning TOCTOU

**Decision**: Documentation and test-verification task, not runtime enforcement.

Cloudflare Browser Rendering does not expose `--host-resolver-rules` or any IP-pinning mechanism. The existing pre-resolution check is comprehensive and fails closed. The TOCTOU gap was documented with a risk quantification comment directly in the source code.

## 8. Cache-Control for signing-key

**Decision**: `public, max-age=3600, stale-while-revalidate=86400` (1h fresh, 24h SWR).

edge-minion recommended 24h max-age, api-design-minion recommended 1h. After rotation, a 24h convergence window is too long. 1h gives fast convergence with 24h resilience via SWR.

## 9. OpenAPI validation tooling

**Decision**: `@redocly/cli` with minimal `recommended` preset config.

Preferred over IBM's `openapi-validator` for better OpenAPI 3.1 support and lighter footprint. margo flagged the dependency addition; the recommended preset alone covers the needed validation. redocly.yaml config is minimal (just `extends: recommended`).

## 10. Task 7 merged into Task 1

**Decision**: Merge DNS pinning documentation task into the security headers task.

margo identified that Task 7 (DNS pinning docs) was ~7 lines of comments assigned to the same agent as Task 1 (security-minion). Folding them together eliminated a full delegation round-trip for trivial output.
