# Phase 0055: Self-Serve Signup (OAuth) — Process

## TL;DR

Eight specialist agents planned and built GitHub OAuth self-serve signup for
WRL across 3 context windows. The planning phases (1–3.5) ran cleanly with
zero BLOCKs from architecture review. Execution produced 8 new source files
and modified 10 existing files across 8 commits. Code review caught a
critical bug (ToS gate blocking first-key endpoints for new users) that was
fixed before merge. All 859 tests pass with no regressions.

## Planning: Who Was Consulted and Why

**Phase 1 (Meta-Plan)** selected 8 planning specialists:

| Agent | Why consulted |
|-------|---------------|
| oauth-minion | OAuth flow correctness — session architecture, PKCE, token lifecycle |
| data-minion | D1 schema design — github_users + sessions tables, tenant linking model |
| api-design-minion | API surface — session-auth vs API-key-auth coexistence, CSRF approach |
| frontend-minion | Vanilla JS UI — dual-auth boot, hash router extensions, 4 new views |
| security-minion | Threat model — CSRF, session fixation, token confusion, first-key exposure |
| test-minion | Test strategy — session mocking, fixture helpers, cookie handling in vitest |
| ux-strategy-minion | Journey coherence — login → ToS → first-key → captures flow |
| observability-minion | Log events — OAuth-specific audit trail, what to log and what to NEVER log |

**Phase 2 (Specialist Planning)** ran all 8 in parallel. Key disagreements
that surfaced:

1. **OAuth state storage**: oauth-minion recommended KV with TTL. data-minion
   proposed a D1 `oauth_states` table for transactional consistency. Synthesis
   chose KV — state is ephemeral (10-minute TTL, single-use, high-churn),
   and KV's automatic expiration eliminates cleanup code. By callback time
   (seconds after redirect), KV eventual consistency has settled.

2. **CSRF approach**: security-minion advocated a per-session synchronizer
   token stored in D1. api-design-minion proposed a custom header check
   (`X-WRL-CSRF: 1`) with `SameSite=Lax`. Synthesis chose the custom header —
   it provides equivalent cross-origin protection with zero server state and
   zero D1 reads. The `__Host-` cookie prefix mitigates subdomain attacks.
   This eliminated a `csrf_token` column from the sessions table.

3. **Observability as separate task**: observability-minion proposed a
   standalone Task 9. Margo flagged this as redundant — Tasks 3 and 4
   already specified every log event inline. Synthesis absorbed Task 9
   into the handler tasks. The log.js JSDoc update was a two-line change.

## Architecture Review (Phase 3.5)

Eight reviewers ran in parallel: security-minion, test-minion, ux-strategy-minion,
lucy, margo (mandatory) plus ux-design-minion, accessibility-minion, gru
(discretionary).

**Result: 0 BLOCKs, multiple ADVISEs incorporated.**

Notable advisories:
- **security-minion**: Backend ToS enforcement (403 gate) — don't rely on
  UI-only gate. Adopted as D6 in decisions.md.
- **margo**: `verifySession()` should JOIN github_users in one query instead
  of two separate D1 hits. Adopted as D8.
- **margo**: PKCE on a confidential client is technically YAGNI but low-cost.
  Kept (D10) — 5 lines of code, defense-in-depth, OAuth 2.1 recommendation.
- **lucy**: Error message display must use a closed allowlist, never raw query
  params. Adopted as D11.
- **accessibility-minion**: Focus management for all modal-like UI states
  (ToS checkbox, revoke confirmation, first-key copy button). Incorporated
  into Task 7 prompt.

## Execution (Phase 4)

Nine tasks in 6 batches with 1 approval gate (Task 1, schema):

| Batch | Tasks | Agent | What |
|-------|-------|-------|------|
| 1 | Task 1 | data-minion | D1 migration (GATE) |
| 2 | Task 2 | data-minion | DB functions + test fixtures |
| 3 | Task 3 | oauth-minion | OAuth flow, session mgmt, first-key delivery |
| 4 | Tasks 4, 5 | api-design-minion | Account handlers + router wiring |
| 5 | Tasks 6, 8 | iac-minion, test-minion | wrangler.toml bindings + test config |
| 6 | Task 7 | frontend-minion | UI views (login, welcome, ToS, settings) |

**Task 7 required manual intervention.** The frontend agent ran out of context
after creating 3 of 4 view files (ui-login.js, ui-welcome.js, ui-tos.js). The
orchestrator completed the remaining work directly: wrote ui-settings.js,
rewrote ui-auth.js for dual-auth boot, modified ui-shell.js with new routes,
and added all CSS additions to ui-css.js. This was the largest single task —
~600 lines of vanilla JS with DOM-only rendering, no framework.

## Code Review Findings

Three reviewers ran in parallel (code-review-minion, lucy, margo):

**Critical finding (code-review-minion)**: The ToS enforcement gate at
`src/index.js:371` blocked ALL `/v1/account/*` endpoints when
`tosAcceptedAt` is null, with only `/v1/account/tos` exempted. This means
new users who haven't accepted ToS (the exact state after first OAuth login)
would get 403 when the welcome screen calls `GET /v1/account/first-key`.
Fixed by adding `/v1/account/first-key` to the exemption list.

**Settings UI field mismatches** (discovered during fix): The settings view
used `keysData.keys` but the backend returns `{ data: [...] }`. Also tried
to fetch `/v1/account` which has no route — fixed to use `_wrlUser` from
the session boot. These were integration bugs between the frontend agent
(which wrote settings before the backend was finalized) and the actual API
response shapes.

**Margo false positive**: Flagged `buildSettingsContent` as called-but-
never-defined. It IS defined at line 128 of ui-settings.js. The function
was added by the background agent that completed the file.

## Human Interventions

1. **Task 7 completion**: Wrote ui-settings.js, ui-auth.js, ui-shell.js
   modifications, and ui-css.js additions directly after the frontend agent
   exhausted context. Deliberate choice to complete inline rather than
   re-spawn — the remaining work was integration-heavy and required reading
   backend response shapes.

2. **ToS gate fix**: Applied the critical fix identified by code review.
   Changed one condition in index.js to also exempt first-key endpoints.

3. **Settings field name corrections**: Fixed 3 field name mismatches that
   arose from the frontend being written before backend API shapes were
   finalized.

## What Was Deliberately Left Alone

- **Operator tenant linking**: Deferred to backlog (D9). The data model
  supports it, but YAGNI for launch. Tenant ID formats are disjoint
  (`gh-*` vs operator IDs) so no collision risk.
- **`toBase64url` duplication across 4 files**: Margo flagged this as
  MEDIUM. Left as-is — the function is 2 lines and extracting a shared
  module creates import dependencies between unrelated modules.
- **E2E browser tests for OAuth flow**: Added to parking lot. Vitest
  can't simulate a full OAuth redirect chain with GitHub.

## Where to Read More

- Specialist discussions: `docs/history/nefario-reports/` (companion files)
- Synthesis (delegation plan): scratch files in companion directory
- All 11 decisions with rationale: `docs/evolution/0055-self-serve-signup-oauth/decisions.md`
- What was produced: `docs/evolution/0055-self-serve-signup-oauth/outcome.md`
