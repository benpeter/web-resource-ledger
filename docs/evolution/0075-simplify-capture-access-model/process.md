# Process: 0075 — Simplify Capture Access Model

## TL;DR

Six specialists planned the removal of WRL's share token system and auth
simplification in parallel. Synthesis produced a 4-task plan (auth rewrite,
tests, CLI verify, docs). Architecture review by 5 mandatory reviewers
returned 0 BLOCKs and 4 ADVISEs (all deferred per YAGNI). Execution
completed in 3 commits deleting ~500 lines of code and tests while adding
a D1 migration. All 1152 worker tests and 139 verify CLI tests pass. Total
delta: net negative lines of code — a pure simplification.

## Team Composition

**Phase 2 specialists** (6 agents, all parallel):
- **security-minion** — assessed the 128-bit capability token model, residual
  enumeration risk, and whether the ID space provides sufficient entropy
- **test-minion** — designed the test migration strategy (flip 401→200, remove
  cross-tenant and share token test blocks)
- **api-spec-minion** — planned the OpenAPI spec changes (remove share scheme,
  bump version, update security requirements)
- **devx-minion** — planned CLI verify package changes (remove shareTokenFromUrl,
  simplify fetch, rewrite error messages)
- **software-docs-minion** — identified all documentation surfaces needing updates
  (SECURITY.md, README, site content, OpenAPI)
- **ux-strategy-minion** — evaluated the user journey impact of removing share
  tokens and simplifying the sharing model

**Phase 3.5 reviewers** (5 mandatory):
- **security-minion** — ADVISE: recommended rate limiting on public endpoints,
  X-Robots-Tag, error field audit, ID generation upgrade. All deferred.
- **test-minion** — APPROVE
- **ux-strategy-minion** — APPROVE
- **lucy** — ADVISE: evolution log completeness, convention adherence
- **margo** — APPROVE with note on artifact rate limiter scope preservation

## What Each Specialist Argued

### Security-minion

The central tension: security-minion acknowledged that 128-bit UUIDs provide
sufficient entropy against enumeration (2^122 bits from UUID v4) but raised
four defensive recommendations:

1. Rate limit public metadata/status endpoints (not just artifacts)
2. Add X-Robots-Tag: noindex to prevent search engine indexing
3. Audit error field exposure for information leakage
4. Consider upgrading from UUID v4 to CSPRNG-generated IDs

All four were deferred in synthesis. The rationale: this phase is about
*removing* code, not adding new defensive layers. Each recommendation is a
separate concern with its own trade-offs. The artifact endpoint already had
rate limiting (VERIFY_RATE_LIMITER) which was preserved.

### Test-minion

Straightforward contribution: identified which test files needed changes,
proposed the test deletion strategy (remove share token tests entirely, flip
auth expectations on retrieval tests). The key insight was that cross-tenant
isolation tests for individual captures become irrelevant when there's no
auth context — so they should be deleted, not just modified.

### Margo

Margo's review was the most nuanced. Approved the overall plan but flagged
that extending VERIFY_RATE_LIMITER to all artifact types (previously
WACZ-only) was a minor scope expansion. The synthesis accepted this as
"maintaining existing behavior" rather than adding new functionality — the
rate limiter was already there, just applied more consistently.

## How Conflicts Were Resolved

No hard conflicts emerged. The only tension was between security-minion's
defensive recommendations and the phase's explicit goal of simplification.
Synthesis resolved this by categorizing all security recommendations as
"separate concerns" and deferring them to the parking lot with concrete
activation triggers.

The decision framework was consistent: if it requires adding code, it doesn't
belong in a phase whose purpose is removing code. This aligns with YAGNI and
the Helix Manifesto's "lean and mean" principle.

## Execution

### Task 1 (auth rewrite + tests) — the heavy lift

The security-minion execution agent did the bulk of the work:
- Rewrote the auth gate in src/index.js (optional auth on individual captures)
- Deleted src/share-tokens.js (110 lines) and test/share-token.test.js (373 lines)
- Created migrations/0013_drop_share_tokens.sql
- Updated all test files (capture-retrieval, capture-integration, security-headers, fixtures)

This agent also completed most of Task 2's work (test updates), making Task 2
effectively a no-op — an efficiency gain that the plan didn't anticipate.

### Task 3 (verify CLI) — clean removal

Removed shareTokenFromUrl from packages/verify/lib/key-resolver.js, simplified
the fetch pipeline, rewrote the 401 error message from "share token needed" to
"individual captures are publicly accessible — a 401 is unexpected."

### Task 4 (documentation) — comprehensive update

Updated 6 files: SECURITY.md (full access model rewrite), README.md (removed
auth headers from curl examples), openapi.yaml (removed share scheme/endpoint,
bumped 0.7.0→0.8.0), site/content/authentication.md and index.md.

## Human Interventions

This was an autonomous orchestration (no human at gates). Lucy agent made all
gate decisions. Notable Lucy decisions:

- **Team approval**: Approved all 6 specialists without adjustment
- **Reviewer approval**: Approved 5 mandatory reviewers, no discretionary
- **Execution plan**: Approved the 4-task plan as-is
- **Post-execution**: Selected "Run all" (code review, tests, docs)

No human overrides were needed. The task was a clean removal with broad
consensus — exactly the kind of change that benefits from autonomous execution.

## Key Decisions Made During Execution

1. **D1: Public access pattern** — If `env._captureAuth` is unset, serve
   capture publicly; if set, enforce tenant isolation. No synthetic auth objects.
2. **D2: Migration timing** — Deploy code + DROP TABLE migration together.
   Old share token URLs continue working because the endpoint is now public.
3. **D3: Deferred security items** — All security-minion recommendations
   parked as separate concerns.
4. **D4: Share token cleanup** — Remove all dead code including
   shareTokenFromUrl. Recoverable from git history if ever needed.
5. **D5: Cache-Control** — Changed `private, no-store` to `no-store` on
   newly-public endpoints. `private` is misleading for public responses.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/2026-03-24-122534-simplify-capture-access-model/`
- Security model documentation: `SECURITY.md`
- Decision rationale: `docs/evolution/0075-simplify-capture-access-model/decisions.md`
- What was produced: `docs/evolution/0075-simplify-capture-access-model/outcome.md`
