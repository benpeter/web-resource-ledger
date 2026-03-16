---
task: "feat: hashed IP logging + categorizeError fix"
date: 2026-03-16
source-issues: [36, 52]
slug: hashed-ip-logging
task-count: 3
gate-count: 0
mode: execution
---

## Summary

Combined two GitHub issues (#36, #52) into a single PR. Added HMAC-SHA256 hashed client IP (`cip`) to all Coralogix log entries for abuse correlation without storing raw IPs. Fixed `categorizeError()` to surface raw Playwright error messages alongside categorized messages. Three specialists planned, six reviewers approved, execution produced 9 files with 47 passing tests.

## Original Prompt

Combined task from GitHub issues #36 and #52. Both touch logging in capture.js. #36 adds HMAC-SHA256 hashed IP for abuse correlation; #52 fixes categorizeError swallowing Playwright error messages.

## Key Design Decisions

1. **Two-step HMAC derivation** over single-step: dailyKey = HMAC(seed, date), then cip = HMAC(dailyKey, ip). Follows HKDF pattern, enables key caching.
2. **`cip` field name** over `ipHash`: shorter, CDN convention, better query ergonomics in Coralogix.
3. **16 hex chars** (64 bits): sufficient for correlation at current traffic volume.
4. **Flat `errorName`/`errorMessage` fields**: consistent with existing `errorClass`/`errorCategory` schema.
5. **Separate `IP_HASH_SEED` secret**: different purpose and rotation lifecycle from `SIGNING_KEY`.
6. **No IPv6 normalization**: YAGNI for single-tenant deployment; Cloudflare normalizes per-request.

## Phases

### Phase 1: Meta-Plan
Identified 3 specialists: security-minion (HMAC design, GDPR), observability-minion (log schema), iac-minion (Workers crypto, secrets).

### Phase 2: Specialist Planning
All 3 ran in parallel. Key consensus: Web Crypto API, hash all events, compute once per request, new secret. Key conflict: field naming resolved to `cip` (observability wins on query ergonomics).

### Phase 3: Synthesis
3-task sequential plan: IP hash module + integration, categorizeError fix, tests.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + observability-minion): 4 APPROVE, 2 ADVISE, 0 BLOCK. ADVISE notes were informational (error pattern naming, log field assertion gaps).

### Phase 4: Execution
Direct execution by orchestrator (no subagent spawning -- plan was detailed enough). Two commits: main implementation + clientIp refactor from code review.

### Phase 5: Code Review
3 reviewers: 0 APPROVE, 3 ADVISE, 0 BLOCK. Applied margo's clientIp extraction. Lucy flagged evolution log requirement (addressed in wrap-up).

### Phase 6: Tests
47 tests pass (10 ip-hash + 37 capture). Pre-existing failures in verify-html.test.js and verify-integration.test.js are unrelated.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Skipped (internal logging change, no user-facing docs needed).

## Agent Contributions

### Planning (Phase 2)

| Agent | Recommendation |
|-------|---------------|
| security-minion | Two-step HMAC derivation, separate IP_HASH_SEED secret, hash all log events, hashed IP is pseudonymized under GDPR Art 4(5) |
| observability-minion | Flat fields (cip, errorName, errorMessage), compute hash once per request, keep log() unchanged |
| iac-minion | Web Crypto API confirmed, cache key import per day, sub-0.1ms latency, add IP_HASH_SEED to staging deploy |

### Review (Phase 3.5)

| Agent | Verdict |
|-------|---------|
| security-minion | APPROVE |
| lucy | ADVISE (informational) |
| margo | APPROVE |
| test-minion | ADVISE (log field assertions) |
| ux-strategy-minion | APPROVE |
| observability-minion | APPROVE |

## Verification

Verification: code review passed (3 ADVISE, 0 BLOCK), tests passed (47/47). Skipped: docs (internal change).

## Test Plan

- [x] `computeCip()` returns deterministic 16-char hex for same inputs
- [x] `computeCip()` returns `undefined` when `IP_HASH_SEED` is absent
- [x] Different IPs produce different hashes
- [x] Edge cases: empty string, "unknown", IPv6
- [x] New error patterns: session expired, protocol error, connection refused, ECONNREFUSED
- [x] All existing tests pass with updated `performCapture()` signatures

## Execution

### Files Changed

| File | Action | Lines |
|------|--------|-------|
| src/ip-hash.js | created | +56 |
| src/index.js | modified | +25/-10 |
| src/capture.js | modified | +20/-5 |
| src/log.js | modified | +4/-2 |
| wrangler.toml | modified | +2/-1 |
| .github/workflows/deploy-staging.yml | modified | +2 |
| vitest.config.js | modified | +1 |
| test/ip-hash.test.js | created | +67 |
| test/capture.test.js | modified | +65/-20 |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-16-121937-hashed-ip-logging/`

Files:
- prompt.md
- phase1-metaplan-prompt.md, phase1-metaplan.md
- phase2-security-minion.md, phase2-observability-minion.md, phase2-iac-minion.md
- phase3-synthesis.md
- phase3.5-security-minion.md, phase3.5-lucy.md, phase3.5-margo.md, phase3.5-test-minion.md, phase3.5-ux-strategy-minion.md, phase3.5-observability-minion.md
- phase5-code-review-minion.md, phase5-lucy.md, phase5-margo.md

</details>
