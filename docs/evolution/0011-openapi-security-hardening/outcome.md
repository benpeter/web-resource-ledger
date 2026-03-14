# Outcome: OpenAPI Spec and Security Hardening

## What was built

All six work items from Issue #8 were completed:

1. **OpenAPI spec completed** -- `openapi.yaml` grew from 634 to 985 lines. Added verification endpoint (content negotiation with JSON + HTML), signing-key endpoint, 4 new schemas (VerificationResult, VerificationCheck, VerificationSigning, VerificationCapture), and fixed 5 spec-implementation gaps. `@redocly/cli` installed for validation; `npm run lint:api` passes clean.

2. **Security headers** -- HSTS (`max-age=31536000; includeSubDomains`) and X-Frame-Options (`DENY`) added globally to all responses. CSP kept page-specific on the verify page.

3. **DNS pinning verified** -- TOCTOU risk quantified in source code comments. Existing test coverage confirmed comprehensive (14 IPv4 ranges, IPv6 variants, fail-closed behavior).

4. **Global backpressure** -- Global-key rate limiter on capture endpoint (20 req/min/PoP). Returns 503 with `Retry-After: 10` when at capacity. ~5 lines of code using existing rate limiter binding pattern.

5. **Signing-key endpoint** -- `GET /.well-known/signing-key` returns `{ algorithm: "Ed25519", publicKey: "<base64>" }`. Cached 1h, CORS `*`, rate-limited via VERIFY_RATE_LIMITER. Returns 503 when signing not configured.

6. **Documentation** -- Key rotation section added to README with prominent warning about old-capture invalidation. Public key endpoint referenced. Backlog updated (HSTS marked done, HSTS preload added as [should]).

## Additional deliverables

- **Verify page enhancement** -- Public key link added to cryptographic details (collapsed `<details>` section). Keyboard-accessible with consistent focus-visible styling.
- **31 new tests** -- `test/signing-key.test.js` (9 tests including round-trip key verification), `test/security-headers.test.js` (7 tests across all routes), content-negotiation integration test. Total: 321 tests (was 290).
- **OpenAPI lint infrastructure** -- `@redocly/cli` as devDependency with `lint:api` npm script and minimal config.

## Files changed

| File | Action | Lines |
|------|--------|-------|
| `src/index.js` | Modified | +30 (headers, rate limiter, signing-key handler, route) |
| `src/verify-page.js` | Modified | +15 (public key link, CSS focus-visible rule) |
| `src/url-validation.js` | Modified | +9 (TOCTOU risk documentation) |
| `wrangler.toml` | Modified | +5 (GLOBAL_CAPTURE_LIMITER binding) |
| `openapi.yaml` | Modified | +351 (verification, signing-key, gap fixes) |
| `package.json` | Modified | +3 (redocly dep, lint:api script, yaml dep) |
| `README.md` | Modified | +30 (key rotation, public key endpoint) |
| `docs/backlog.md` | Modified | +2 (HSTS done, preload backlog) |
| `redocly.yaml` | Created | 3 lines |
| `.redocly.lint-ignore.yaml` | Created | 8 lines |
| `test/signing-key.test.js` | Created | ~80 lines |
| `test/security-headers.test.js` | Created | ~60 lines |
| `test/verify-integration.test.js` | Modified | +8 lines |

## Surprises and deviations

- **Backpressure reframing**: The original issue assumed Workers expose a concurrency gauge. They don't. edge-minion identified the real constraint (Browser Rendering's 30-session limit) and proposed the simpler global-key rate limiter. The solution is architecturally different from what was specified but achieves the same goal.

- **JSON signing-key format**: The issue specified "base64-encoded raw bytes" but three specialists independently recommended a JSON envelope for consistency with the all-JSON API. This deviates from the issue text but is a better design.

- **redocly peer dependency**: `@redocly/cli` 1.34.x requires `yaml` as a peer dependency, adding one more devDependency than planned.

- **Lint ignore file**: Two intentional spec warnings required an explicit ignore file (`.redocly.lint-ignore.yaml`) -- placeholder server URL and health endpoint without 4xx responses.

## Backlog changes

**Marked done:**
- [should] HSTS header on all responses (Verification Page section)

**Added:**
- [should] HSTS preload submission -- add preload directive and submit to hstspreload.org after domain is finalized

**Unchanged:**
- Key versioning remains [should] -- documented limitation in README instead
- All other existing backlog items unchanged
