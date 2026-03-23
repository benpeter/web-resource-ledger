MODE: META-PLAN

You are creating a meta-plan — a plan for who should help plan.

## Task

<github-issue>
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
</github-issue>

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/tender-painting-lollipop

## External Skill Discovery
Before analyzing the task, scan for project-local skills. If skills are
discovered, include an "External Skill Integration" section in your meta-plan.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills:
   a. Scan .claude/skills/ and .skills/ in the working directory for SKILL.md files
   b. Read frontmatter (name, description) for each discovered skill
   c. For skills whose description matches the task domain, classify as
      ORCHESTRATION or LEAF
   d. Check the project's CLAUDE.md for explicit skill preferences
   e. Include discovered skills in your meta-plan output
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING
   (not execution — planning). These are agents whose domain
   expertise is needed to create a good plan.
5. For each specialist, write a specific planning question that
   draws on their unique expertise.
6. Return the meta-plan in the structured format.
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-uIpl6r/self-serve-signup-oauth/phase1-metaplan.md
