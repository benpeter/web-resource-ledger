# Phase 0093 — Decisions

## Architecture: vanilla JS SPA vs. framework

Chose vanilla JS with hash routing for the admin dashboard, consistent with
the existing UI approach (ui-shell, ui-detail, etc.). No React/Vue/framework
overhead for what is fundamentally a few data tables with a detail view.
Reuses existing design system tokens.

## Auth: sessionStorage Bearer token with throttle

Admin auth uses a simple Bearer token entry with a 3-strike throttle before
lockout. The admin dashboard is not user-facing — it's operator-only, so a
lightweight auth gate is sufficient. No OAuth flow needed.

## Rate limit: raised from 5 to 30 req/60s

The admin dashboard makes multiple API calls on load (overview + tenants).
The previous 5 req/60s admin rate limit was too aggressive for interactive
dashboard use. Raised to 30 req/60s which is still restrictive but allows
normal dashboard browsing.

## DAL: three focused query functions

Instead of a generic query builder, implemented three specific DAL functions:
- `listTenantsWithUsage` — aggregates captures, storage, API calls per tenant
- `getTenantDetail` — single tenant with full history
- `getOverviewStats` — platform-wide aggregates

Each returns exactly the shape the API needs. No ORM, no abstraction layers.

## MCP sync: admin endpoints excluded

The three new operationIds (adminListTenants, adminGetTenant, adminGetOverview)
were added to the MCP sync exclusion list rather than creating MCP tools.
Admin endpoints require ADMIN_KEY auth and are not appropriate for AI agent
use via MCP. This caused a CI failure that was caught and fixed by the
supervisor.
