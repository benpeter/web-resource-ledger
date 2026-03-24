# Outcome: 0075 — Simplify Capture Access Model

## What was produced

Simplified the WRL capture access model by removing tenant auth from individual
capture endpoints and eliminating the share token system entirely. The access
model went from three paths (tenant auth, share token, WACZ public) to two
(tenant auth for create/list, public for individual captures).

### Files changed

**Deleted:**
- `src/share-tokens.js` — entire 110-line module
- `test/share-token.test.js` — 373 lines, 38 tests

**Created:**
- `migrations/0013_drop_share_tokens.sql` — DROP TABLE + indexes

**Modified (worker):**
- `src/index.js` — auth gate rewrite, handler null safety, route/cron removal
- `test/capture-retrieval.test.js` — flip 401→200, remove cross-tenant/share tests
- `test/capture-integration.test.js` — 3 assertion updates
- `test/security-headers.test.js` — 1 assertion update
- `test/fixtures.js` — remove seedShareToken, cleanDb cleanup

**Modified (verify CLI):**
- `packages/verify/lib/key-resolver.js` — remove shareTokenFromUrl, simplify fetch
- `packages/verify/test/key-resolver.test.js` — remove share token tests
- `packages/verify/README.md` — rewrite sharing section

**Modified (documentation):**
- `SECURITY.md` — full access model rewrite
- `README.md` — remove share section, remove auth headers from curl examples
- `openapi.yaml` — remove share scheme/endpoint/params, bump 0.7.0→0.8.0
- `site/content/authentication.md` — update endpoint table
- `site/content/index.md` — update sharing note

### Test results

- Worker: 48 files, 1152 tests passed (net ~46 fewer tests — all tested removed behavior)
- Verify CLI: 139 tests passed
- Zero share token references in src/, test/, packages/verify/, docs

### Issues resolved

- Resolves #169 (this issue)
- Subsumes #162 (WACZ public access)
- Partially addresses #167 (verify page rendering — the auth gate that blocked it is removed)

## What deviated from plan

- Task 1 agent also completed most of Task 2's work (test updates), which was efficient but reduced Task 2 to a no-op.
- The artifact endpoint's existing rate limiting was preserved (reusing VERIFY_RATE_LIMITER), which margo noted as a minor scope deviation from "no rate limiting changes" — but it was existing behavior being maintained, not new functionality.

## Code review findings

- **NIT:** handleListCaptures destructures captureAuth without null guard (safe because auth gate precedes it, but inconsistent with other handlers)
- **ADVISE:** No test covers "bad credentials on public endpoint → 401" behavior. Good test gap to fill in a follow-up.
- **ADVISE:** Rate limiting not applied to metadata/status endpoints (deferred per YAGNI)

## Backlog changes

- ~~#169: Simplify capture access model~~ — DONE
- ~~#162: WACZ public access~~ — subsumed by this change
- Deferred: Rate limiting on public capture metadata/status endpoints (from security-minion review)
- Deferred: X-Robots-Tag: noindex on capture endpoints (from security-minion review)
- Deferred: Audit error field exposure in public capture responses (from security-minion review)
- Deferred: Test for bad-credentials-on-public-endpoint → 401 (from code review)
