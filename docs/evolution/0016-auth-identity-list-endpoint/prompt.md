# Phase 0016: Auth Identity Enrichment + List Captures Endpoint

## Source

GitHub issues #38 (R8) and #31 (R1), combined into a single nefario orchestration.

## Task Description

**Issue #38 (R8): Auth identity enrichment (internal refactor)**

The auth module returns tenant identity (`{ ok: true, tenantId }`) instead of
just a boolean, preparing the codebase for per-tenant keys without changing
external API behavior. The single static key maps to a "default" tenant. All
downstream code threads tenantId into logging and KV operations.

**Issue #31 (R1): List captures endpoint (GET /v1/captures)**

Users can browse and recover their captures by date, eliminating the "lost ID =
lost capture" anti-pattern that is currently documented as a known limitation in
the README and 202 response.

## Constraints

- R8 must ship before or alongside R1 to ensure KV keys include tenant scope
  from day one
- KV `list()` returns keys only; each page of 20 results costs 21 KV operations
- API contract (cursor + envelope) must be storage-backend-agnostic for future
  D1 migration
- No migration of existing KV keys (deferred to R12)
