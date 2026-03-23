Users can sign up for WRL via GitHub OAuth, automatically receiving a tenant and first API key. The web UI provides account management (view, create, revoke keys) behind a session cookie. The existing admin API continues to work for operator-managed tenants.

Success criteria:
- OAuth 2.0 authorization code flow with GitHub as the identity provider
- First-time login auto-creates a tenant record in D1 with the user's GitHub ID and username
- After first login, a generated API key is displayed once (not retrievable after dismissal) with copy-to-clipboard
- Session cookie (HttpOnly, Secure, SameSite=Lax) maintains login state for the web UI
- Account settings page lists active API keys (masked, showing last 4 chars and creation date)
- Account settings allows creating additional API keys (up to a configurable limit per tenant)
- Account settings allows revoking API keys with confirmation
- Terms of service acceptance is recorded with timestamp in D1 before tenant creation
- Existing admin API (POST/GET/DELETE /v1/admin/keys) continues to work for operator-managed tenants
- OAuth state parameter prevents CSRF
- Logout endpoint clears the session cookie

Scope:
- In: GitHub OAuth flow, auto-tenant provisioning, first-key display, session management, account settings UI (key CRUD), terms acceptance, logout
- Out: Additional OAuth providers (Google, email/password), team/org features, role-based access within a tenant, password reset, email verification

Constraints:
- Depends on R17 (Web UI) for the frontend shell and R21 (per-tenant rate limits) for new tenant defaults
- D1 (R30) must be available for tenant and session storage
- GitHub OAuth app credentials stored as Worker secrets
- Must handle the case where a GitHub user has previously been provisioned as an operator tenant (link, don't duplicate)
