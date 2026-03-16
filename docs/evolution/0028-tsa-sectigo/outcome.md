# Outcome: 0028 — Switch TSA from DigiCert to Sectigo

## TL;DR

Switched the RFC 3161 TSA endpoint from DigiCert to Sectigo across all environments (production, staging, test). Three lines changed in two config files. All 497 tests pass. The change fixes silent timestamp failures caused by DigiCert's HTTPS port being unreachable from Cloudflare Workers.

## What Changed

| File | Change | Lines |
|------|--------|-------|
| `wrangler.toml` | Production `TSA_URL`: `https://timestamp.digicert.com` → `https://timestamp.sectigo.com` | 1 |
| `wrangler.toml` | Staging `TSA_URL`: same replacement | 1 |
| `vitest.config.js` | Test binding `TSA_URL`: same replacement | 1 |

## What Did NOT Change

- `src/rfc3161.js` — TSA-agnostic, uses `env.TSA_URL` dynamically
- Historical evolution logs (0025-rfc3161-timestamps) — preserved as-is
- Historical nefario reports — preserved as-is
- No new dependencies, no new code, no behavioral changes

## Verification

- All 23 test files pass (497 tests)
- RFC 3161 tests (`test/rfc3161.test.js`, 17 tests) pass — these use `fetchMock` and the `TSA_URL` from `vitest.config.js`

## Backlog Changes

No backlog changes. This was a targeted bug fix with no scope expansion or deferred items.
