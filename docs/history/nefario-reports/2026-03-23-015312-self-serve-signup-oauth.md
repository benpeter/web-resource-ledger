---
task: "R24: Self-Serve Signup (OAuth)"
date: 2026-03-23
source-issue: 103
mode: execution
task-count: 8
gate-count: 1
agents: data-minion, oauth-minion, api-design-minion, iac-minion, test-minion, frontend-minion
reviewers: security-minion, test-minion, ux-strategy-minion, lucy, margo, ux-design-minion, accessibility-minion, gru
compaction-events: 2
---

## Summary

GitHub OAuth 2.0 self-serve signup for WRL. Users sign in with GitHub, automatically receive a tenant (`gh-{numeric_id}` format) and first API key (shown once, deleted from KV on first read). Session cookies (`__Host-wrl_session`, HttpOnly, Secure, SameSite=Lax) maintain login state. Account settings page provides key CRUD (list, create up to 5, revoke with confirmation). Terms of Service acceptance enforced in both UI gate and backend (403 on `/v1/account/*` when ToS not accepted). PKCE (S256) included for defense-in-depth. Custom header CSRF (`X-WRL-CSRF: 1`) replaces synchronizer tokens. Existing admin API completely unchanged. 8 new files, 10 modified, 8 commits, 859 tests pass.

## Original Prompt

GitHub Issue #103: R24 -- Self-Serve Signup (OAuth)

Users can sign up for WRL via GitHub OAuth, automatically receiving a tenant and first API key. The web UI provides account management (view, create, revoke keys) behind a session cookie. The existing admin API continues to work for operator-managed tenants.

Success criteria: OAuth 2.0 authorization code flow with GitHub, auto-tenant provisioning, first-key display (shown once), session cookie management, account settings UI (key CRUD), ToS acceptance with timestamp, existing admin API unchanged, CSRF protection via OAuth state, logout endpoint.

## Key Design Decisions

1. **KV for OAuth state over D1** -- OAuth state is ephemeral (10-min TTL, single-use). KV's automatic expiration eliminates cleanup code. D1 would require lazy cleanup or cron. By callback time, KV eventual consistency has settled.

2. **Custom header CSRF over synchronizer tokens** -- `X-WRL-CSRF: 1` header + `SameSite=Lax` provides equivalent protection with zero server state. Custom headers trigger CORS preflight; `SameSite=Lax` blocks cross-origin POST cookies. Eliminated a `csrf_token` column from sessions table.

3. **`gh-{numeric_id}` tenant format** -- GitHub usernames are mutable and recyclable. Numeric GitHub ID is immutable. Tenant ID is embedded in R2 keys, KV counters, and capture records — changing it requires data migration.

4. **D1 server-side sessions** -- Enables server-side revocation (logout, force-invalidation). Session ID hashed (SHA-256) before D1 storage limits breach blast radius. Rejected JWT (no revocation) and encrypted cookies (payload size, no revocation).

5. **First-key in KV with one-time read** -- KV entry deleted on first read. User gets one chance to copy. Settings page allows creating replacements. Rejected: URL params (leaks in history), session embed (long-lived exposure).

6. **ToS enforcement in backend** -- 403 gate on `/v1/account/*` when `tosAcceptedAt` is null (security-minion advisory). Prevents curl bypass of UI-only gate. `/v1/account/tos` and `/v1/account/first-key*` exempted.

7. **PKCE kept for confidential client** -- OAuth 2.1 recommends for all clients. 5 lines of code, defense-in-depth. Stored in same KV entry as state parameter.

## Phases

### Phase 1-2: Planning (8 specialists)
Consulted oauth-minion (OAuth flow, PKCE, token lifecycle), data-minion (schema, tenant linking), api-design-minion (endpoint design, CSRF), frontend-minion (dual-auth boot, 4 new views), security-minion (threat model, session fixation, CSRF), test-minion (session mocking, fixture helpers), ux-strategy-minion (login→ToS→key→captures journey), observability-minion (audit trail, NEVER-log items).

### Phase 3: Synthesis
8 tasks, 1 gate. Two key conflicts resolved: KV vs D1 for state storage (KV won), synchronizer token vs custom header for CSRF (custom header won). Task 9 (standalone observability) absorbed into Tasks 3 and 4 per margo advisory.

### Phase 3.5: Architecture Review (8 reviewers)
5 mandatory + 3 discretionary. Zero BLOCKs. Key advisories: backend ToS enforcement (security-minion), single-query JOIN for verifySession (margo), focus management for all UI states (accessibility-minion), closed error message allowlist (lucy).

### Phase 4: Execution (8 tasks, 6 batches)
- Task 1 (data-minion): D1 migration `0004_github_oauth.sql` — GATE approved
- Task 2 (data-minion): 9 new db.js functions + test fixtures
- Task 3 (oauth-minion): OAuth flow, session management, first-key delivery
- Tasks 4-5 (api-design-minion): Account handlers + router wiring (10 new routes)
- Tasks 6, 8 (iac-minion, test-minion): wrangler.toml bindings + test config
- Task 7 (frontend-minion): 4 new UI views — agent exhausted context, orchestrator completed remaining work

### Phase 5: Code Review
Critical finding: ToS gate blocked first-key endpoints for new users. Fixed by adding `/v1/account/first-key` to exemption list. Settings UI field mismatches fixed (response shape corrections). One margo false positive (buildSettingsContent exists at line 128).

### Phase 6: Tests
859 tests pass, 0 regressions. Pre-existing test suite covers all backend endpoints. OAuth endpoints tested via stubGitHubFetch fixture.

### Phase 8: Documentation
Evolution log entries (prompt.md, decisions.md, outcome.md, process.md) written. Backlog updated with R24 completion and 3 new parking lot items.

## Verification

Code review: 1 critical finding fixed (ToS gate), 2 integration bugs fixed (settings UI). Tests: 859 passed, 0 failed. Docs: evolution log complete.

## Agent Contributions

### Planning Agents (Phase 2)
| Agent | Contribution |
|-------|-------------|
| oauth-minion | OAuth flow design, PKCE recommendation, KV state storage, session cookie attributes |
| data-minion | Schema design (github_users, sessions), tenant ID format, JOIN optimization |
| api-design-minion | Separate `/v1/account/*` surface, custom header CSRF, dual-auth coexistence |
| frontend-minion | Dual-auth boot pattern, hash router extensions, 4 view module structure |
| security-minion | Threat model, backend ToS enforcement, first-key one-time read, error allowlist |
| test-minion | Test fixture design (stubGitHubFetch, createTestSession), cookie handling |
| ux-strategy-minion | Login→ToS→first-key→captures journey coherence, error state coverage |
| observability-minion | 12 log events, 4 NEVER-log items, oauth subsystem classification |

### Architecture Reviewers (Phase 3.5)
| Reviewer | Verdict | Key feedback |
|----------|---------|-------------|
| security-minion | ADVISE | Backend ToS enforcement gate |
| test-minion | APPROVE | — |
| ux-strategy-minion | ADVISE | Welcome screen should auto-focus copy button |
| lucy | ADVISE | Error messages must use closed allowlist |
| margo | ADVISE | JOIN optimization, PKCE is low-cost so keep it |
| ux-design-minion | ADVISE | Loading spinner for auth boot |
| accessibility-minion | ADVISE | Focus management for all modal-like states |
| gru | APPROVE | — |

## Session Resources

### Skills Invoked
- `/nefario` — primary orchestration

### Compaction
2 context compaction events during session (post-Phase 3, post-Phase 3.5).

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-23-015312-self-serve-signup-oauth/`

Files: phase1-metaplan.md, phase2-*.md (8 specialist contributions), phase3-synthesis.md, phase3.5-*.md (8 reviewer verdicts), phase4-*-prompt.md (8 task prompts), prompt.md.

Resolves #103
