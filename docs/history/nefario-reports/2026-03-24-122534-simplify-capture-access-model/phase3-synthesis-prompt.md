MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Simplify capture access model: remove share tokens, auth-gate list only (GitHub issue #169).

Phase 0062 added tenant auth to all capture GET endpoints, which broke the public verify page, CLI verifier, and the "anyone can verify" value proposition. Changes needed:

1. Auth gate only on `GET /v1/captures` (list endpoint)
2. Remove auth from individual capture access — `GET /v1/captures/{id}`, `/status`, `/artifacts/*` become public again
3. Remove share token system — `POST /v1/captures/{id}/share` endpoint, share-tokens.js, related tests
4. Remove share token cleanup from cron handler
5. Update SECURITY.md with the simplified access model
6. Update OpenAPI spec — remove share endpoint and token auth docs
7. Fix verify-page.spec.js E2E test — currently failing because of this

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-api-spec-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-devx-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-ux-strategy-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase2-software-docs-minion.md

## Key consensus across specialists:

### security-minion
- Proposal sound. 128-bit IDs sufficient as capability tokens.
- Recommends X-Robots-Tag: noindex, rate limiting public endpoints, auditing error field exposure.
- D1 migration for DROP share_tokens is clean (FKs point outward).

### api-spec-minion
- Remove shareToken security scheme, /share endpoint, token query params, 401/410 responses.
- Update Cache-Control from private,no-store to no-store on public endpoints.
- Bump spec version to 0.8.0.

### devx-minion
- Remove shareTokenFromUrl from key-resolver.js, rewrite 401 error message, update README.
- Five additional locations in verify package need updating.
- Bump to 0.3.0.

### test-minion
- Update capture-retrieval.test.js in-place: flip ~6 tests, delete ~8 cross-tenant tests, delete share token block.
- Delete share-token.test.js entirely (374 lines, 38 tests).
- verify-page.spec.js already fixed in prior commits — no changes needed.
- Clean fixtures.js seedShareToken.

### ux-strategy-minion
- Clear UX win. Verify page goes from broken to complete.
- "Knowing URL = access" matches existing mental models.
- Share tokens were indifferent feature with zero known users.

### software-docs-minion
- SECURITY.md needs full Access Model rewrite and Share Token Design removal.
- README sharing section needs removal/rewrite.
- Seven documentation surfaces affected.
- Decision record belongs in evolution log.

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-jZS5XC/simplify-capture-access-model/phase3-synthesis.md`

IMPORTANT CONSTRAINTS:
- This project follows YAGNI/KISS principles. Do NOT add features not in the issue (no rate limiting changes, no X-Robots-Tag, no error field auditing — those are separate concerns).
- The issue is about REMOVING code and simplifying, not adding new features.
- Keep the task count minimal. Group related changes into single tasks where they affect the same files.
- Use sonnet model for execution tasks.
- Use bypassPermissions mode for execution agents.
- ONE approval gate maximum (security model is already validated by security-minion).
- The verify-page.spec.js E2E test was already fixed per test-minion — do NOT create a task for it.
