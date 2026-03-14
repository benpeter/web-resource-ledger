# MVP Step 7: Static Verification Page

Source: GitHub Issue #7

## Goal

Browser-accessible verification page for non-technical users.

## Context

The verification endpoint (`GET /v1/verify/{id}`) exists and returns JSON.
Non-technical users -- journalists, lawyers, compliance officers -- cannot
interpret a raw JSON response. This step adds a human-readable HTML page
that shows the verification result, capture URL, and screenshot artifact.

## Work Items

- `GET /v1/verify/{id}` with `Accept: text/html` returns an HTML page
- Content negotiation on the existing route: Accept header check at end of
  `handleVerifyCapture`, not a separate URL
- JSON is the default for `*/*`, absent header, and all non-`text/html` types
- HTML is a static shell with inlined JS that fetches from the verify and
  retrieval endpoints (client-side fetch -- NOT server-side rendered)
- Two client-side fetches:
  1. `GET /v1/verify/{id}` with `Accept: application/json` for verification result
  2. `GET /v1/captures/{id}` for URL and screenshot artifact URL
- Screenshot rendered via `<img>` tag pointing to
  `/v1/captures/{id}/artifacts/screenshot` (same-origin)
- CSP: `'unsafe-inline'` for script and style (static template strings, no
  dynamic data interpolated into them)
- Error paths (404, 429, 503) remain `application/problem+json`
- `<noscript>` fallback: capture ID + JSON API link only

## Acceptance Criteria

- `GET /v1/verify/{id}` with `Accept: text/html` returns HTML page
- `GET /v1/verify/{id}` without Accept header still returns JSON (no regression)
- HTML page displays: verified status, capture URL, screenshot, timestamp
- Integration test covers both content-negotiated responses from the same route

## Orchestration

Executed via `/nefario #7`. This is a nefario orchestration with multiple
specialist agents.
