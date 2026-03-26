# Phase 0099: Unified Navigation Header and Footer

## Task

Issue #224: Unify navigation header and footer across all WRL subdomains.

## Briefing

All three WRL subdomains (www, docs, api) share a single consistent header
and footer, so users experience one cohesive product rather than disconnected
properties. Navigation between subdomains is seamless from any page.

### Success criteria

- Header and footer render identically across webresourceledger.com,
  docs.webresourceledger.com, and api.webresourceledger.com/ui
- Header/footer markup comes from a single source of truth (not copy-pasted
  per subdomain)
- Sign-in button visible on www and docs; sign-out + account menu on api
- Docs link subtly highlighted when on docs subdomain
- API subdomain nav includes (right-to-left): username/account submenu
  (billing, settings, notifications), docs, schedules, captures
- Footer matches current www footer on all subdomains
- No visual regression on existing www landing page

### Scope

- In: Shared header component, shared footer component, integration into
  www (Pages), docs (Pages), and api/ui (Worker), account submenu on api
- Out: Auth flow changes, new functionality behind menu items, docs content
  changes, API logic changes
