# Outcome: 0021 Documentation Drift Audit

## What was built

Systematic audit and fix of all documentation drift accumulated during Act 1 (PRs #51-#57). Five files updated:

1. **openapi.yaml** (+357/-56 lines): Fixed 13 spec-vs-code discrepancies — added OPTIONS operation, missing error responses (503/500/422), Link header on all ~25 response definitions, CORS headers on POST error responses, Retry-After on Problem503, failed/pending list capture examples, health legal required, reconciled example detail strings, X-RateLimit-Limit description and examples. Code review caught 3 additional issues (missingUrl detail string, rate limit example value, missing 503 on signing-keys) — all fixed.

2. **README.md** (+128/-9 lines): Rewrote Key Rotation section (removed dangerously false warning about rotation breaking verification), added keyId to Public Key Endpoint, documented new Key Archive Endpoint, added 3 missing secrets (IP_HASH_SEED, CORALOGIX_SEND_KEY, CORS_ORIGINS), added staging environment section, documented health endpoint, documented response headers (Link, HSTS, X-RateLimit-Limit), updated roadmap to "complete".

3. **CONTRIBUTING.md** (+51 lines): Expanded .dev.vars template to 5 variables with required/optional markers, added Staging & Deployment section with CI pipeline and smoke test instructions.

4. **PRODUCT.md** (+4 lines): Added status header blockquote directing readers to README/backlog.

5. **docs/MVP.md** (+4 lines): Added status header blockquote marking it as a historical artifact.

## What deviated from the plan

- Pre-PR#54 edge case note was removed per user feedback (no such captures exist)
- Tasks 3 and 4 ran in parallel (margo's advisory removed the artificial dependency)
- Code review found 3 additional spec inaccuracies not caught in planning — fixed in a separate commit
- margo's ADVISE about OpenAPI CORS header duplication was accepted as-is (extract shared components when a second CORS endpoint is added, not before)

## Verification

- `npm run lint:api`: passes (1 expected warning — OPTIONS has no 4XX)
- `npm test`: 449/449 tests pass
- Code review: 3 findings auto-fixed (missingUrl detail string, X-RateLimit-Limit example, missing 503 on signing-keys)
- No secrets or internal details leaked in documentation

## Backlog changes

- No items added to backlog (Prism contract test suggestion from risk analysis is a nice-to-have, not deferred scope)
- No items removed from backlog
- No tier changes
