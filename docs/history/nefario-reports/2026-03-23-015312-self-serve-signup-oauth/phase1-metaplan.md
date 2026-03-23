# Meta-Plan: Self-Serve Signup via GitHub OAuth

## Planning Consultations

### Consultation 1: OAuth Flow and Session Architecture

- **Agent**: oauth-minion
- **Planning question**: Design the GitHub OAuth 2.0 authorization code flow for a Cloudflare Worker: What is the correct sequence for authorization redirect, callback token exchange, and session cookie issuance? How should the session be stored (D1 row vs signed JWT vs encrypted cookie) given that the Worker is stateless and already has D1? What are the security requirements for the state parameter (CSRF), PKCE (if applicable to GitHub), cookie attributes, and token handling? How should the GitHub access token be stored or discarded after retrieving user identity?
- **Context to provide**: `wrangler.toml` (D1 binding, env vars, Worker setup), `src/auth.js` (current Bearer key auth), `src/db.js` (D1 data layer with tenants/api_keys tables), GitHub OAuth docs. The Worker runs on Cloudflare at `api.webresourceledger.com`. The UI is served from the same origin at `/ui`.
- **Why this agent**: OAuth flow correctness is the foundation. Session architecture (cookie-based vs JWT) and token lifecycle decisions cascade into every other task. Getting this wrong creates security holes or rework.

### Consultation 2: D1 Schema Design for OAuth Users and Sessions

- **Agent**: data-minion
- **Planning question**: What schema changes to D1 are needed to support GitHub OAuth users alongside existing operator-provisioned tenants? Specifically: (1) How should GitHub identity be stored -- new table or columns on `tenants`? (2) How should sessions be stored if we use server-side sessions? (3) How do we link a GitHub user who already has an operator-created tenant (the "don't duplicate" constraint)? (4) Where does ToS acceptance timestamp go? Consider that the existing `tenants` table has `id TEXT PRIMARY KEY` with format `[a-z0-9_-]{1,64}`, and GitHub user IDs are integers. The existing `api_keys` table uses `created_by TEXT` -- this should integrate with the new identity model.
- **Context to provide**: `migrations/0001_initial_schema.sql` (current schema), `src/db.js` (all DB functions), the constraint about linking pre-existing operator tenants.
- **Why this agent**: Schema design is a hard-to-reverse decision that every other component depends on. The tenant-linking logic (GitHub user to existing operator tenant) is a data modeling problem with multiple valid approaches.

### Consultation 3: API Design for Session-Authenticated Endpoints

- **Agent**: api-design-minion
- **Planning question**: How should the new session-authenticated endpoints be designed? The current API uses Bearer token auth for all `/v1/*` routes. The new OAuth flow needs: (1) OAuth endpoints (GET /auth/github, GET /auth/github/callback, POST /auth/logout), (2) account settings endpoints (list my keys, create key, revoke key -- similar to admin API but scoped to the authenticated user's tenant). Should the account API reuse `/v1/admin/keys` with a different auth mechanism, or should it be a separate surface (e.g., `/v1/account/keys`)? How do we distinguish session-auth vs API-key-auth on the same routes? What about CSRF protection for session-authenticated POST/DELETE endpoints?
- **Context to provide**: `src/index.js` (route table), `src/admin.js` (existing admin key CRUD), `src/auth.js` (Bearer token verification). The admin API uses ADMIN_KEY (infrastructure secret). The new account API should use session cookies.
- **Why this agent**: API surface design determines the contract the frontend builds against. The relationship between admin API and self-serve API is a design decision with implications for backward compatibility and security boundaries.

### Consultation 4: Frontend Architecture for OAuth Login and Account Settings

- **Agent**: frontend-minion
- **Planning question**: How should the existing vanilla JS UI at `/ui` be extended to support: (1) A "Sign in with GitHub" button that initiates the OAuth redirect, (2) Post-login first-key display with copy-to-clipboard and "shown once" semantics, (3) An account settings view for key management (list masked keys, create new, revoke with confirmation), (4) ToS acceptance gate before first tenant creation, (5) A logout button that calls the logout endpoint? The current UI uses a hash router, sessionStorage for the API key, and DOM-only rendering (no framework). How does the auth model change from "paste your API key" to "session cookie + OAuth"? Should both auth paths coexist?
- **Context to provide**: `src/ui/ui-shell.js` (app shell with hash router), `src/ui/ui-auth.js` (current API key gate), `src/ui/ui-css.js` (design system CSS), `src/design-system.css`. The project philosophy mandates vanilla JS -- no React, no framework.
- **Why this agent**: The UI is the largest surface area change. The transition from sessionStorage-based API key auth to cookie-based session auth is a fundamental UX shift that needs careful planning to avoid breaking the existing capture workflow.

### Consultation 5: Security Threat Model for OAuth Integration

- **Agent**: security-minion
- **Planning question**: What are the primary threats introduced by adding GitHub OAuth and session cookies to a Cloudflare Worker that currently only uses Bearer token auth? Specifically: (1) CSRF on session-authenticated POST/DELETE endpoints -- what mitigation (SameSite=Lax sufficient? need a CSRF token?), (2) Session fixation and hijacking risks with cookie-based sessions, (3) Secure handling of GitHub OAuth client_secret in Worker secrets, (4) Token confusion between session cookies and API key Bearer tokens on the same origin, (5) Rate limiting on OAuth endpoints to prevent abuse, (6) The "first key shown once" pattern -- is it safe to return a raw API key in the OAuth callback response? (7) GitHub access token lifecycle -- store or discard after identity extraction?
- **Context to provide**: `src/auth.js` (current auth), `src/index.js` (CORS config, rate limiters), `wrangler.toml` (rate limiter bindings), the SECURITY.md if it exists. The Worker is at `api.webresourceledger.com` with no CORS origins currently configured.
- **Why this agent**: OAuth adds a fundamentally new attack surface (browser-based sessions, cross-site concerns, token confusion). Security review of the plan is cheaper than security review of the code.

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning. The OAuth flow involves multiple HTTP redirects, cookie handling, D1 state mutations, and GitHub API calls -- test strategy needs to address how to test these without a real GitHub OAuth app. Mock strategy for GitHub token exchange, integration test boundaries, and the interaction between session auth and existing API key auth all need planning input.
- **Security**: INCLUDED above as Consultation 5. OAuth is fundamentally a security feature.
- **Usability -- Strategy**: ALWAYS include. Planning question for ux-strategy-minion: What is the user journey for a first-time user discovering WRL, signing up, getting their first API key, and making their first capture? How does the "first key shown once" pattern work -- what happens if they close the tab before copying? What is the cognitive load of the ToS acceptance step? How does the transition from the current "paste your API key" model to "Sign in with GitHub" affect existing users who already have operator-provisioned keys?
- **Usability -- Design**: Include ux-design-minion for planning. The account settings page, first-key reveal, ToS acceptance gate, and Sign-in button are all new UI surfaces that need interaction design input. The existing UI has an established design system (`design-system.css`) that the new views must match.
- **Documentation**: ALWAYS include. Planning question for software-docs-minion: What documentation changes are needed? The OpenAPI spec needs new endpoints, the README and docs site need self-serve signup documentation, and the OPERATIONS.md needs GitHub OAuth app setup instructions. user-docs-minion: How should the self-serve onboarding flow be documented? Is in-app guidance sufficient or do we need a "Getting Started" guide update?
- **Observability**: Include observability-minion for planning. OAuth flows are a new category of security-sensitive events: login success/failure, session creation/expiry, key creation via self-serve, ToS acceptance. These need structured logging to Coralogix. How do these new events integrate with the existing log schema and alert rules?

### Notable Exclusions

- **mcp-minion**: The MCP server (`src/mcp.js`) uses API key auth and is not affected by OAuth changes. No MCP protocol involvement.
- **edge-minion**: No CDN, caching, or edge routing changes. The OAuth flow runs on the existing Cloudflare Worker. Session cookies use standard HTTP semantics.
- **iac-minion**: No infrastructure provisioning needed beyond Worker secrets (`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`). D1 migrations are handled by wrangler. The existing CI/CD pipeline handles deployment.

### Anticipated Approval Gates

1. **D1 Schema Design** (MUST gate): The migration adding OAuth identity, sessions, and ToS tables. Hard to reverse, high blast radius -- every other task depends on the schema. Multiple valid approaches exist (new table vs columns on tenants, session storage strategy).

2. **API Surface Design** (MUST gate): The new endpoint paths and the relationship between admin API and self-serve account API. Defines the contract between frontend and backend. Hard to reverse once the frontend is built against it.

3. **OAuth Flow + Session Architecture** (MUST gate): How the authorization code flow works, where secrets are stored, how sessions are issued and validated. Security-critical and hard to reverse. Directly feeds the security review.

### Rationale

This task spans five primary domains that need planning input:

1. **OAuth protocol** (oauth-minion) -- the authorization code flow, token exchange, and session lifecycle are protocol-specific and require specialist knowledge to get right on Cloudflare Workers.

2. **Data modeling** (data-minion) -- the schema changes are the foundation. The tenant-linking problem (GitHub user with pre-existing operator tenant) is non-trivial and has multiple valid solutions.

3. **API design** (api-design-minion) -- the new endpoints must coexist cleanly with the existing admin API without breaking backward compatibility.

4. **Frontend** (frontend-minion) -- the UI changes are the largest surface area. The auth model shift from API key to session cookie affects the entire app shell.

5. **Security** (security-minion) -- OAuth introduces session-based auth to what was previously a stateless API-key-only system. The threat model changes fundamentally.

Cross-cutting agents (test, UX strategy, UX design, docs, observability) round out the planning to ensure nothing is dropped.

### Scope

**In scope**:
- GitHub OAuth 2.0 authorization code flow (GET /auth/github, GET /auth/github/callback)
- D1 schema: GitHub identity linking, sessions, ToS acceptance
- Auto-tenant provisioning on first login (with GitHub user ID and username)
- First API key generation and one-time display
- Session cookie management (HttpOnly, Secure, SameSite=Lax)
- Account settings UI: list keys (masked), create key, revoke key with confirmation
- ToS acceptance recording with timestamp
- Logout endpoint (POST /auth/logout)
- CSRF protection for session-authenticated mutations
- OAuth state parameter for CSRF prevention on the OAuth flow itself
- Backward compatibility: existing admin API (POST/GET/DELETE /v1/admin/keys) continues unchanged
- Linking GitHub users to pre-existing operator tenants (no duplication)

**Out of scope**:
- Additional OAuth providers (Google, email/password)
- Team/org features, RBAC within a tenant
- Password reset, email verification
- GitHub API calls beyond user identity (no repo access, no org membership)
- Changes to the landing page or docs site (documentation updates are Phase 8)
- Migration of existing operator tenants to OAuth (operator tenants remain admin-managed)

### External Skill Integration

No external skills detected in project.
