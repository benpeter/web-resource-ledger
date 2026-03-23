---
task: Capture auth gate for multi-tenant (Issue #110)
date: 2026-03-23
slug: capture-auth-gate-multi-tenant
mode: execution
source-issue: 110
task-count: 3
gate-count: 1
compaction-events: 2
---

## Summary

Implemented tenant authentication on all capture retrieval endpoints and share tokens for delegated access. GET /v1/captures/{id}, /status, and /artifacts/* now require a valid tenant API key (or session). Cross-tenant access returns 404 (not 403) to prevent enumeration. Share tokens (wrl_share_ prefix, 256-bit entropy, SHA-256 hash storage) allow tenants to grant read-only access to specific captures via URL query parameter. The CLI verify tool propagates share tokens from input URLs to artifact downloads. SECURITY.md updated with access model, share token design, and threat analysis. 21 files changed, +1705/-256 lines, 1174 tests passing across 49 test files.

## Original Prompt

GitHub Issue #110: R33: Capture auth gate for multi-tenant. Capture retrieval endpoints require tenant authentication, enforcing that tenants can only access their own captures. The public verification endpoint remains unauthenticated by design. Share tokens allow tenants to grant access to specific captures without exposing their API key.

## Key Design Decisions

1. **Route-level auth gate in fetch()** -- follows existing admin/account gate patterns. Fail-closed by default; new capture retrieval routes get auth automatically. Over: per-handler auth checks (risk of omission on new handlers).
2. **Opaque random tokens over HMAC-signed** -- follows existing hash-before-store pattern (api_keys, sessions). Single token mechanism keeps security model simple. Over: HMAC-signed ephemeral tokens (adds signing secret complexity, dual-token confusion, non-revocable).
3. **wrl_share_ prefix** -- consistent with wrl_live_ API keys. Auth gate routes tokens to correct lookup table by prefix. Over: stk_ prefix (security-minion proposal, 2-to-1 consensus against).
4. **410 Gone for expired tokens** -- per issue spec. Information leak acceptable because tokens are intentionally shared. Helps legitimate users: "this link has expired." Over: 404 everywhere (api-design-minion, prevents information leakage but hurts UX).
5. **URL-based token propagation for CLI** -- simplest approach: paste share URL into npx @w-r-l/verify, token auto-forwarded to artifact download. Over: HMAC-signed ephemeral URLs (dual-token confusion), --token CLI flag (breaks zero-config experience).
6. **No revocation, no label, no per-capture limit** -- Phase 3.5 reviewers (lucy, margo) flagged all three as YAGNI. Revocation explicitly out of scope per issue. Label is write-only data without a listing view. Per-capture limit adds complexity for a problem that doesn't exist.
7. **Mutual exclusion of share token and API key** -- prevents confused-deputy attacks where expired token falls back to session auth.
8. **env._captureAuth without raw token** -- raw token not stored in auth context object (margo). Handlers extract from URL params directly when needed for artifact URL propagation.

## Phases

### Phase 1: Meta-Plan
Selected 7 specialists: security-minion (primary), data-minion (D1 schema), api-design-minion (API contract), devx-minion (CLI backward compat), test-minion, ux-strategy-minion, software-docs-minion. Excluded: oauth-minion (no OAuth changes), frontend-minion (no UI changes), edge-minion (no CDN changes).

### Phase 2: Specialist Planning
All 7 contributed in parallel. Key conflicts: CLI backward compat approach (3 options), token prefix (stk_ vs wrl_share_), expired token response (410 vs 404). Consensus: opaque tokens, route-level gate, hash-before-store, tenant isolation via 404.

### Phase 3: Synthesis
3-task plan with 1 approval gate (Task 1: security model). Resolved CLI approach (URL propagation), prefix (wrl_share_), expired response (410 per spec).

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + 1 discretionary). 3 APPROVE, 3 ADVISE, 0 BLOCK. Lucy and margo independently flagged 3 YAGNI violations (revocation endpoint, label field, per-capture limit). All removed before execution. Security-minion refined variable naming and raw token exposure.

### Phase 4: Execution
3 tasks across 2 execution batches:

| Task | Agent | Deliverable |
|------|-------|-------------|
| 1. Auth gate + share tokens + tests | security-minion | migration, share-tokens.js, auth gate in index.js, 7 test files |
| 2. CLI token propagation | devx-minion | key-resolver.js, README, version bump, tests |
| 3. Documentation | software-docs-minion | SECURITY.md, README, openapi.yaml, backlog, site content |

### Phase 5: Code Review
3 reviewers. 1 APPROVE, 2 ADVISE, 0 BLOCK. 2 substantive findings auto-fixed:
- Quarantined captures allowed share token creation (should return 404 like failed)
- Missing try/catch on createShareToken D1 write (inconsistent with all other D1 writes)

### Phase 6: Tests
49 test files, 1174 passed, 2 skipped. No regressions. Duration: 18.76s.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Phase 8a assessment: all items addressed by Task 3 during execution. 0 unaddressed items. Phase 8b not needed.

## Verification

Verification: 2 code review findings auto-fixed, all tests pass, docs complete.

## Agent Contributions

<details>
<summary>Planning agents (Phase 2)</summary>

| Agent | Contribution |
|-------|-------------|
| security-minion | Auth gate placement, token format (opaque, 256-bit, SHA-256 hash), mutual exclusion design, threat model |
| data-minion | D1 schema: share_tokens table, 3 indexes including partial index on expires_at, per-capture limit (later removed) |
| api-design-minion | POST /share contract, wrl_share_ prefix, 410 for expired, allow share on pending captures |
| devx-minion | 3 CLI approaches evaluated, URL propagation recommended, version bump strategy |
| test-minion | Full test matrix: auth paths, tenant isolation, share token lifecycle, CLI compat |
| ux-strategy-minion | User journey analysis: "ID as secret" → "private with sharing" transition, zero-friction share UX |
| software-docs-minion | SECURITY.md restructuring scope, documentation audit |

</details>

<details>
<summary>Review agents (Phase 3.5)</summary>

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | Variable naming (isCaptureGetRoute), raw token in auth context |
| api-design-minion | ADVISE | Error response consistency, share token scoping |
| test-minion | APPROVE | — |
| ux-strategy-minion | APPROVE | — |
| lucy | ADVISE | Revocation and label out of scope, file ownership (src/index.js comments → Task 1) |
| margo | ADVISE | 3 YAGNI: per-capture limit, label field, revocation endpoint |

</details>

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — primary orchestration

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-23-183150-capture-auth-gate-multi-tenant/`

Files:
- prompt.md — original user prompt
- phase1-metaplan-prompt.md, phase1-metaplan.md — meta-plan
- phase2-*-prompt.md, phase2-*.md — 7 specialist planning contributions
- phase3-synthesis-prompt.md, phase3-synthesis.md — delegation plan
- phase3.5-*.md — 6 reviewer verdicts
- phase4-*-prompt.md — 3 execution agent prompts
- phase8-checklist.md — documentation assessment

</details>

Compaction events: 2. Report reconstructed from scratch files and session context.
