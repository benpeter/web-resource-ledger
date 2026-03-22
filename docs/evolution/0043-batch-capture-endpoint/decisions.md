# Phase 0043: Batch Capture Endpoint — Decisions

## D1: Request body shape

**Chosen**: `{ urls: [{ url: "..." }] }` — array of objects with a `url` field
**Over**: Flat string array `{ urls: ["..."] }` (ux-strategy-minion), `{ items: CaptureRequest[] }` (api-spec-minion)
**Why**: Matches single-capture `{ url: "..." }` shape for SDK reuse. Leaves room for per-URL options (viewport, waitUntil) without a breaking change. Flat strings would require a new field or polymorphic array to add options later.

## D2: Per-item status representation

**Chosen**: HTTP integer status codes (202, 400, 422, 429, 500, 503)
**Over**: String enums (`accepted`, `validation_error`, `rate_limited`) per ux-strategy-minion
**Why**: RFC 4918 (207 Multi-Status) convention uses per-item HTTP status codes. Consistent with `problemResponse()` throughout the codebase. The `summary` object provides the binary signal CI pipelines need without parsing individual items.

## D3: Rate limit strategy

**Chosen**: Sequential consumption with pre-check
**Over**: All-or-nothing pre-check (security-minion)
**Why**: CF rate limiters have no `.remaining()` or `.peek()` API — each `.limit()` call is destructive. All-or-nothing is impossible without consuming N tokens speculatively. Sequential is the only approach that works with the CF rate limiter API and gives honest per-item outcomes.

## D4: Duplicate URL handling

**Chosen**: Allow duplicates — each gets its own capture ID
**Over**: Reject batch if duplicates found (security-minion)
**Why**: Legitimate use cases exist (time-series monitoring, comparison captures). Deduplication would make response array shorter than input, violating order-preservation contract. Each duplicate consumes a rate limit token, which is self-limiting.

## D5: Hard cap and default batch size

**Chosen**: Hard cap 100 (code constant), default 20 (env var `MAX_BATCH_SIZE`)
**Why**: Hard cap provides defense in depth against misconfiguration. Default of 20 balances utility (covers most batch use cases) with resource protection (20 concurrent browser sessions is manageable). Both values are adjustable without code changes.

## D6: No dedicated batch rate limiter

**Chosen**: Share `CAPTURE_RATE_LIMITER` (10/min per IP) and `GLOBAL_CAPTURE_LIMITER` (200/min global)
**Over**: New `BATCH_RATE_LIMITER` binding (3/min per IP) per security-minion
**Why**: Shared limiter already prevents amplification with 20-URL default cap. Adding a new binding is infrastructure complexity for a theoretical gap. Revisit if batch abuse is observed in production.

## D7: No CORS for batch endpoint

**Chosen**: No CORS preflight or response headers on `/v1/captures/batch`
**Why**: Batch endpoint is server-to-server only (legal teams, monitoring services, CI pipelines). Browser-based capture uses the single-capture endpoint which already has CORS support.
