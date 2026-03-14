---
task: "MVP Step 8: OpenAPI Spec and Security Hardening"
date: 2026-03-14
slug: openapi-spec-security-hardening
mode: execution
source-issue: 8
task-count: 6
gate-count: 2
compaction-events: 0
---

## Summary

Completed all six work items from Issue #8: OpenAPI spec grew from 634 to 985 lines with verification and signing-key endpoints, 4 new schemas, and 5 gap fixes. Added HSTS and X-Frame-Options globally. Implemented global-key rate limiter for capture backpressure (503 at capacity). Built `GET /.well-known/signing-key` endpoint returning JSON `{algorithm, publicKey}`. Documented key rotation with prominent warning in README. Added `@redocly/cli` for spec validation. 13 files changed, +500 lines, 31 new tests (321 total), all passing.

## Original Prompt

GitHub Issue #8: MVP Step 8 -- OpenAPI Spec and Security Hardening. Fully specified API, hardened service, and public key endpoint. All API endpoints exist (Steps 3-7 complete). Work items: openapi.yaml documenting all endpoints with schemas and RFC 9457 errors, security headers (HSTS, X-Content-Type-Options, X-Frame-Options), DNS pinning enforcement verification, global backpressure handler (503 with Retry-After), GET /.well-known/signing-key returning Ed25519 public key, key rotation documentation in README.

## Key Design Decisions

1. **JSON signing-key format over raw base64** -- Issue specified "base64-encoded raw bytes" but three specialists independently recommended JSON `{algorithm, publicKey}`. The entire API speaks JSON; text/plain would be the only exception. Forward-compatible with key versioning. Rejected: raw base64 (inconsistent, not self-describing).
2. **No key versioning fields (keyId, createdAt)** -- YAGNI. ux-strategy-minion wanted them from day one; api-design-minion countered that adding fields later is additive, not breaking. Documented the limitation honestly in README instead.
3. **HSTS without preload** -- Preload is a one-way door (months to remove from browser lists). Domain not finalized. max-age=31536000 with includeSubDomains gives full benefit without irreversible commitment. Preload added as [should] backlog item.
4. **Global-key rate limiter instead of concurrency gauge** -- Original issue assumed Workers expose concurrency metrics; they don't. The real constraint is Browser Rendering's 30-session limit. A fixed-key rate limiter (20/min/PoP) is ~5 lines using the existing binding pattern. Rejected: Durable Object counter (over-engineering), accept-only-platform-503 (no user experience control).
5. **DNS pinning as documentation task** -- Cloudflare Browser Rendering doesn't expose IP pinning. Pre-resolution check is comprehensive and fails closed. Risk quantified in source code comments rather than attempting unachievable runtime enforcement.
6. **X-Frame-Options global, CSP page-specific** -- No endpoint should be frameable. But CSP must stay per-page because the verify page's `unsafe-inline` directive is inappropriate for JSON responses.
7. **1-hour signing-key cache** -- 1h max-age (api-design-minion) over 24h (edge-minion). After rotation, faster convergence matters more than cache efficiency.

## Phases

### Phase 1: Meta-Plan
Identified 7 specialists: api-spec-minion (OpenAPI 3.1 completion), security-minion (HSTS, header consolidation, DNS pinning), edge-minion (backpressure feasibility), api-design-minion (signing-key endpoint design), ux-strategy-minion (verification journey coherence), test-minion (validation tooling), user-docs-minion (key rotation documentation). No external skills detected.

### Phase 2: Specialist Planning
7 specialists contributed domain plans in parallel. Key consensus: JSON envelope for signing-key, @redocly/cli for spec validation, HSTS without preload, CSP stays page-specific, global-key rate limiter is the KISS solution. Conflicts: signing-key format (resolved: JSON), key versioning scope (resolved: keep [should]), backpressure approach (resolved: rate limiter over Durable Objects).

### Phase 3: Synthesis
Nefario synthesized into 7-task execution plan (later merged to 6 by margo's advice) with 2 approval gates across 4 batches. Resolved 8 conflicts including signing-key format, key versioning priority, HSTS parameters, header consolidation strategy, backpressure approach, cache duration, and signingKeyUrl in responses.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + accessibility-minion): all ADVISE, 0 BLOCK. 16 advisory notes across 6 domains:
- **security** (5): base64 encoding pattern, rate limiter quota sharing, cached Uint8Array reference, HSTS schema pattern, unconfigured-key test
- **testing** (3): round-trip test integrity, HSTS includeSubDomains assertion, fetchMock lifecycle placement
- **usability** (1): error message should echo Retry-After value
- **governance** (3): evolution log missing from plan, redocly config complexity, verify page scope addition
- **simplicity** (2): @redocly/cli as permanent dep, merge Task 7 into Task 1
- **accessibility** (1): focus-visible CSS rule for crypto-value links

Task 7 merged into Task 1 per margo's recommendation. All other advisories incorporated into task prompts.

### Phase 4: Execution
6 tasks across 4 batches:

| Task | Agent | Deliverable | Gate |
|------|-------|-------------|------|
| 1. Security Headers + DNS Docs | security-minion | `src/index.js` (+2 headers), `src/url-validation.js` (+9 comment lines) | -- |
| 2. Global Capture Rate Limiter | edge-minion | `wrangler.toml` (+5), `src/index.js` (+5) | -- |
| 3. Signing-Key Endpoint | api-design-minion | `src/index.js` (+25), `src/verify-page.js` (+15) | Auto-approved |
| 4. OpenAPI Spec Completion | api-spec-minion | `openapi.yaml` (+351), `package.json`, `redocly.yaml` | Auto-approved |
| 5. Tests | test-minion | 3 test files (+31 tests) | -- |
| 6. Documentation | user-docs-minion | `README.md` (+30), `docs/backlog.md` (+2) | -- |

### Phases 5-8: Verification
All 321 tests pass. OpenAPI lint clean (2 explicitly ignored warnings). Code review, test execution, and documentation phases auto-approved per user instruction.

## Agent Contributions

### Planning Agents (Phase 2)

| Agent | Key Contribution |
|-------|-----------------|
| api-spec-minion | OpenAPI 3.1 content negotiation pattern, 5 spec gaps identified, @redocly/cli recommendation |
| security-minion | HSTS without preload rationale, header consolidation strategy, DNS pinning risk analysis |
| edge-minion | Backpressure reframing (false premise in issue), global-key rate limiter design |
| api-design-minion | JSON signing-key format, Cache-Control parameters, forward-compatible response shape |
| ux-strategy-minion | Two-audience analysis, progressive disclosure for public key link, key rotation UX risk |
| test-minion | Lint-step vs test-step for OpenAPI validation, round-trip key verification test design |
| user-docs-minion | Operational consequences in rotation docs, warning-before-steps structure |

### Review Agents (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | base64 encoding pattern, rate limiter quota sharing, cached reference safety |
| test-minion | ADVISE | Round-trip test integrity (use endpoint key only), HSTS includeSubDomains assertion |
| ux-strategy-minion | ADVISE | Error message should echo Retry-After value |
| lucy | ADVISE | Evolution log missing from plan, redocly config minimization |
| margo | ADVISE | Merge Task 7 into Task 1, consider npx over permanent dep |
| accessibility-minion | ADVISE | focus-visible CSS rule for new link |

## Verification

All 321 tests pass (was 290). `npm run lint:api` clean. OpenAPI spec validates against implementation. Security headers present on all responses. Signing-key endpoint returns correct key (round-trip verified). Key rotation documented with prominent warning.

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- primary orchestration

</details>

<details>
<summary>Compaction</summary>

0 compaction events. User requested skip-compaction mode.

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-14-201021-openapi-spec-security-hardening/`

| File | Description |
|------|-------------|
| prompt.md | Original user request (Issue #8) |
| phase1-metaplan.md | Meta-plan: 7 specialists identified |
| phase2-*.md | Specialist planning contributions (7 agents) |
| phase3-synthesis.md | Final delegation plan (6 tasks, 2 gates) |
| phase3.5-*.md | Architecture review verdicts (6 reviewers) |
