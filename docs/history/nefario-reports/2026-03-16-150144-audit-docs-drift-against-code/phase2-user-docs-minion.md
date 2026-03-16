## Domain Plan Contribution: user-docs-minion

### Recommendations

I walked through every section of `README.md` and `CONTRIBUTING.md` as both a new deployer and an API consumer, cross-referencing against the actual source code in `src/index.js`, `src/signing.js`, `src/ip-hash.js`, `src/log.js`, `src/kv.js`, `wrangler.toml`, `package.json`, the GitHub Actions workflows, and the OpenAPI spec. The findings are organized by document and section, with severity indicated.

---

#### README.md: Factually Wrong Statements

**1. Key Rotation section is dangerously wrong (CRITICAL)**

README lines 218-226 say:

> **Warning:** Rotating the signing key invalidates signature verification for all captures signed with the previous key. There is no key history endpoint yet -- old captures will show "Verification Failed" until key versioning is implemented.

and:

> Key versioning and old-key verification are not yet implemented.

This is flatly false. PR #54 shipped key versioning. The code now:
- Computes a `keyId` (first 8 hex chars of SHA-256 of the raw public key) for every key (`src/signing.js:73-74`)
- Archives every signing key in KV before completing a capture (`src/kv.js:251-263`)
- Looks up the archived key by `keyId` from the KV record during verification (`src/index.js:438-448`)
- Exposes `/.well-known/signing-keys` (plural) listing all historical keys (`src/index.js:534-551`)
- Returns `keyId` in the `/.well-known/signing-key` response (`src/index.js:528`)

A deployer reading the current warning would believe key rotation destroys old capture verification. The opposite is true -- old captures continue to verify because the system archives and retrieves historical keys. This is the highest priority fix.

**2. Public Key Endpoint response shape is incomplete (HIGH)**

README line 230 says the shape is `{ algorithm, publicKey }`. The actual response is `{ algorithm, publicKey, keyId }` (see `src/index.js:528`). The `keyId` field is critical for API consumers doing offline verification -- they need it to match WACZ `signedData.keyId` against the key archive.

**3. `/.well-known/signing-keys` (plural) endpoint is completely undocumented in README (HIGH)**

The route exists at `src/index.js:27`, handled by `handleGetSigningKeys` (line 534), and documented in `openapi.yaml` (line 1219). The README mentions only the singular `/.well-known/signing-key`. The plural endpoint is the key archive that makes key rotation safe. An API consumer wanting to verify old captures or build a third-party verifier would not know it exists.

**4. `GET /health` endpoint undocumented in README (MEDIUM)**

The health endpoint exists (`src/index.js:19`, lines 112-120), is covered in `openapi.yaml`, and is used in the smoke test, but is never mentioned in the README Usage section. A deployer or monitoring integration needs to know about it.

**5. `Link` header with Terms of Service is undocumented for API consumers (MEDIUM)**

Every response includes `Link: <...TERMS.md>; rel="terms-of-service"` (src/index.js:107). This is relevant for API consumers building clients that need to surface legal notices. The smoke test even validates it (smoke-test.sh:71-76). README does not mention it anywhere in the API reference.

**6. `X-RateLimit-Limit` header undocumented in README (MEDIUM)**

PR #57 added this header on rate-limited endpoints (`src/index.js:96-100`). The OpenAPI spec documents it, but the README's rate limit paragraph (line 106) does not mention it. API consumers building retry logic need to know this header exists.

**7. HSTS `preload` directive undocumented (LOW)**

PR #57 upgraded HSTS to include `preload` (`src/index.js:105`). The README does not mention HSTS at all, but this is relevant for deployers who need to submit their domain to the HSTS preload list.

---

#### README.md: Setup Section -- Missing Secrets

**8. `IP_HASH_SEED` secret missing from Setup (HIGH)**

PR #56 introduced `IP_HASH_SEED` for HMAC-hashed IP logging (`src/ip-hash.js`). It must be set as a Wrangler secret (`wrangler.toml:40`). The README Setup lists only `CAPTURE_API_KEY` and `SIGNING_KEY`. A deployer following the Setup section would deploy without `IP_HASH_SEED`, causing all log entries to have `cip: undefined` -- degraded abuse correlation.

**9. `CORALOGIX_SEND_KEY` secret missing from Setup (HIGH)**

Logging to Coralogix requires `CORALOGIX_SEND_KEY` (`src/log.js:24`, `wrangler.toml:39`). Without it, the worker is silent -- no structured observability. The deploy-staging workflow sets four secrets (lines 43-51 of deploy-staging.yml): `CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`, `IP_HASH_SEED`. The README only covers two of the four.

**10. `CORS_ORIGINS` configuration missing from Setup (MEDIUM)**

PR #57 added CORS support via the `CORS_ORIGINS` environment variable (`wrangler.toml:46-47`, `src/index.js:30-38`). Without documentation, a deployer building a browser extension or web UI that calls the API would not know how to enable CORS. The variable is already in `wrangler.toml` as a commented example but the README provides no guidance.

---

#### README.md: Staging Environment -- Completely Absent

**11. No mention of staging environment anywhere in README (HIGH)**

PR #55 introduced a full staging environment: `[env.staging]` in `wrangler.toml` (lines 53-90), `deploy-staging.yml` workflow, `smoke-test.sh` script, and `npm run smoke` in `package.json`. A deployer has no way to know that staging exists, how to set it up, or how to run smoke tests. The Setup section's "Deploy" step (line 193) only shows `wrangler deploy` with no mention of `--env staging`.

---

#### README.md: Roadmap Section

**12. Roadmap says "in progress" but all Act 1 items are complete (LOW)**

Line 204 says "Solid Foundation (in progress)". The backlog shows every Act 1 item is DONE. The parenthetical should say "(complete)" or the specific items listed should be updated.

---

#### README.md: List Captures Example Response

**13. List captures response example is correct but incomplete (LOW)**

The example at lines 85-101 only shows the `complete` status shape. The actual `CaptureSummary` also includes `failedAt`, `error`, and `retryable` for failed captures, and no extra fields for pending. The OpenAPI spec documents this, but a README consumer might assume all captures have `completedAt`.

---

#### CONTRIBUTING.md: Missing Information

**14. CONTRIBUTING.md does not mention the staging environment (HIGH)**

A contributor needs to know:
- Staging exists and how pushes to `main` auto-deploy to it
- How to deploy to staging manually (`wrangler deploy --env staging`)
- That staging has its own secrets (set via `wrangler secret put <NAME> --env staging`)
- That the staging KV namespace ID placeholder needs replacement

**15. CONTRIBUTING.md does not mention the smoke test (HIGH)**

`npm run smoke` exists in `package.json` (line 22). The smoke test is part of the CI/CD pipeline (`deploy-staging.yml`, job `smoke`). A contributor should know:
- How to run smoke tests locally against staging
- What the smoke test validates (health, security headers, signing key, capture round-trip)
- Environment variables needed (`SMOKE_URL`, `SMOKE_API_KEY`)

**16. CONTRIBUTING.md does not mention `deploy-staging.yml` (MEDIUM)**

The deploy workflow is `deploy-staging.yml`, not just `ci.yml`. A contributor opening a PR should understand that merging to `main` triggers: CI test -> staging deploy -> smoke test. This is the deploy pipeline.

**17. CONTRIBUTING.md `.dev.vars` list is incomplete (MEDIUM)**

Line 20 says `.dev.vars` needs `SIGNING_KEY` and `CAPTURE_API_KEY`. For full local dev with observability and CORS, it should also mention `IP_HASH_SEED`, `CORALOGIX_SEND_KEY`, `CORALOGIX_ENDPOINT`, and optionally `CORS_ORIGINS`.

---

#### SECURITY.md: No Issues Found

SECURITY.md is accurate and does not reference any features from the recent PRs. No changes needed.

---

#### openapi.yaml: No Drift Found

The OpenAPI spec is fully aligned with the current codebase. It correctly documents:
- `keyId` in the signing-key response
- `/.well-known/signing-keys` endpoint
- CORS headers
- `X-RateLimit-Limit` header
- `Link` header (TermsLink)
- List captures endpoint with CaptureSummary schema
- Staging server entry

The drift is between README/CONTRIBUTING and the code, not between the spec and the code.

---

### Proposed Tasks

Tasks are ordered by severity and dependency.

**Task 1: Rewrite Key Rotation section** (CRITICAL -- blocks all other Reference changes)
- Remove the incorrect warning about key rotation invalidating old captures
- Document how key versioning works: `keyId` fingerprinting, automatic archival, historical key lookup during verification
- Document the key rotation procedure with the new behavior: rotate freely, old captures continue to verify
- Mention that pre-key-versioning captures (signed before PR #54) fall back to current key verification
- Deliverable: Replacement text for README lines 216-226

**Task 2: Update Public Key Endpoint section** (HIGH -- depends on Task 1)
- Add `keyId` to the response shape: `{ algorithm, publicKey, keyId }`
- Explain what `keyId` is (8-char hex fingerprint of SHA-256 of raw public key bytes)
- Deliverable: Replacement text for README lines 228-230

**Task 3: Add `/.well-known/signing-keys` endpoint documentation** (HIGH -- depends on Task 1)
- Document the key archive endpoint
- Show the response shape: `{ keys: [{ keyId, algorithm, publicKey, archivedAt }] }`
- Explain its purpose: third-party verifiers matching WACZ `signedData.keyId` against historical keys
- Deliverable: New subsection in README Reference, after the Public Key Endpoint section

**Task 4: Add missing secrets to Setup section** (HIGH -- no dependencies)
- Add step for `IP_HASH_SEED`: generate, set via `wrangler secret put`, add to `.dev.vars`
- Add step for `CORALOGIX_SEND_KEY`: explain purpose (structured log ingestion), set via `wrangler secret put`
- Add step for `CORALOGIX_ENDPOINT`: explain it is pre-configured in `wrangler.toml` but deployers using non-EU Coralogix may need to change it
- Document `CORS_ORIGINS` as an optional environment variable with explanation of when it is needed (browser extensions, web UIs calling the API)
- Present secrets as a complete table so deployers can verify they have everything: `CAPTURE_API_KEY` (required), `SIGNING_KEY` (optional but recommended), `IP_HASH_SEED` (recommended for privacy-safe logging), `CORALOGIX_SEND_KEY` (recommended for observability), `CORS_ORIGINS` (optional, only for browser clients)
- Deliverable: Updated Setup section in README with all secrets documented

**Task 5: Add staging environment documentation** (HIGH -- depends on Task 4)
- Add a "Staging" subsection to Setup or Development
- Document: `wrangler deploy --env staging`, that `deploy-staging.yml` auto-deploys on merge to `main`
- List staging-specific setup: separate R2 bucket (`wrl-captures-staging`), KV namespace (placeholder needs replacing), secrets set with `--env staging`
- Document `npm run smoke` and its required env vars (`SMOKE_URL`, `SMOKE_API_KEY`)
- Deliverable: New section in README and updated CONTRIBUTING.md

**Task 6: Update CONTRIBUTING.md** (HIGH -- depends on Task 5)
- Add "Staging Environment" subsection explaining the deploy pipeline: merge to main -> CI -> staging deploy -> smoke test
- Add `.dev.vars` complete example with all four secrets
- Mention `npm run smoke` with required environment variables
- Mention `deploy-staging.yml` as the CD pipeline
- Deliverable: Updated CONTRIBUTING.md

**Task 7: Document new response headers for API consumers** (MEDIUM -- no dependencies)
- Add a "Response Headers" subsection to Reference or a note in Usage
- Document `Link` header with `rel="terms-of-service"` (present on all responses)
- Document `X-RateLimit-Limit` header (present on rate-limited endpoints)
- Document `Strict-Transport-Security` with `preload` directive
- Mention HSTS preload submission for deployers using a custom domain
- Deliverable: New subsection or expanded reference text in README

**Task 8: Document health endpoint** (MEDIUM -- no dependencies)
- Add `/health` to the Usage or Reference section
- Show response shape including `legal.terms` and `legal.policy` URLs
- Useful for deployers setting up monitoring
- Deliverable: Brief entry in README Reference

**Task 9: Update Roadmap section** (LOW -- no dependencies)
- Change "Solid Foundation (in progress)" to "(complete)" or similar
- Optionally update bullet points to reflect that all Act 1 items shipped
- Deliverable: Updated README Roadmap section

---

### Risks and Concerns

1. **Key Rotation section could cause data loss decisions.** A deployer reading the current (incorrect) warning might avoid rotating a compromised key because they believe it will break all old captures. Fixing this is urgent from a security-operations perspective -- it actively misinforms operators about the safety of key rotation.

2. **Missing secrets produce silent failures, not errors.** `IP_HASH_SEED` and `CORALOGIX_SEND_KEY` are optional -- the worker runs fine without them but with degraded observability. A deployer following the README would deploy successfully but have no logs and no IP correlation. This is a "works but broken" state that is hard to diagnose.

3. **Staging environment is invisible without documentation.** The staging infrastructure exists (workflow, wrangler config, smoke tests) but a contributor has no path to discover it from the README or CONTRIBUTING.md. They might deploy directly to production, bypassing the staging validation gate.

4. **README and openapi.yaml are now diverged.** The OpenAPI spec is correct and complete; the README is stale. This creates a trust problem: if a consumer finds the README wrong about key versioning, they may distrust other README claims that are actually correct. Closing the gap restores confidence in all documentation.

5. **CONTRIBUTING.md `.dev.vars` incompleteness.** A contributor who sets up local dev with only `SIGNING_KEY` and `CAPTURE_API_KEY` will get test failures or confusing behavior when testing CORS or log-related code paths.

6. **Scope risk: over-expanding README.** Several of these items (response headers, health endpoint) add content. The README should stay scannable. Consider whether a separate "API Reference" section or a "Deployer Guide" section would better organize the growing reference material, or whether pointing to `openapi.yaml` for full details is sufficient for some items.

### Additional Agents Needed

**software-docs-minion**: Should review `openapi.yaml` for completeness against the codebase. My audit found no drift there, but a second pass by the API-reference specialist would confirm. Specifically: (a) verify the `CaptureSummary` schema matches the actual projection in `src/index.js:272-287`, (b) confirm the `VerificationResult.signing` nullable pattern matches the code's `result.capture || null` at line 489, and (c) check whether the `OPTIONS` preflight for CORS should have its own path entry in the spec.

No other additional agents are needed. The drift is entirely in user-facing prose documentation (README, CONTRIBUTING), which is squarely in the user-docs domain.
