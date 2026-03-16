# Outcome: 0019 Hashed IP Logging

## What was built

Two features combined into a single PR, both touching logging in `src/capture.js`:

### Issue #36: HMAC-SHA256 hashed IP logging
- New `src/ip-hash.js` module with `computeCip()` function
- Two-step HMAC-SHA256 key derivation: daily key from seed, then hash IP with daily key
- Returns 16-char hex string (64 bits -- sufficient for correlation at current traffic)
- Module-scoped cache: one key import per isolate per day
- Graceful degradation: returns `undefined` when `IP_HASH_SEED` is absent
- `cip` field added to every `log()` call across `src/index.js` and `src/capture.js`
- `IP_HASH_SEED` secret wired through `wrangler.toml`, `deploy-staging.yml`, `vitest.config.js`

### Issue #52: categorizeError fix
- Three new error patterns in `categorizeError()`: session expired, protocol error, connection refused
- `errorName` and `errorMessage` fields added to `capture.stage.fail` log entries
- `errorMessage` field added to `capture.fail` catch-all log entries
- All error messages truncated to 256 characters

### Tests
- New `test/ip-hash.test.js` with 10 tests (determinism, uniqueness, graceful degradation, edge cases)
- 5 new error pattern tests in `test/capture.test.js`
- All ~30 existing `performCapture()` call signatures updated for new `cip` parameter
- 47 tests passing

## Files changed

| File | Action | Description |
|------|--------|-------------|
| `src/ip-hash.js` | created | HMAC-SHA256 hashed IP module |
| `src/index.js` | modified | Added `cip` computation and threading to all handlers |
| `src/capture.js` | modified | Added `cip` param, error fields, new error patterns |
| `src/log.js` | modified | Updated INVARIANT comment |
| `wrangler.toml` | modified | Added IP_HASH_SEED documentation |
| `.github/workflows/deploy-staging.yml` | modified | Added IP_HASH_SEED to secrets |
| `vitest.config.js` | modified | Added IP_HASH_SEED test binding |
| `test/ip-hash.test.js` | created | Unit tests for computeCip |
| `test/capture.test.js` | modified | New error pattern tests, updated signatures |

## What deviated from plan

1. **Protocol error test message** -- the test initially used `'Protocol error (Runtime.callFunctionOn): Target closed.'` but "Target closed" matched an earlier pattern in `categorizeError()`. Fixed to use a message without "Target closed".

2. **clientIp extraction** -- margo's code review flagged repeated `request.headers.get('CF-Connecting-IP') || 'unknown'` across handlers. Applied in a follow-up commit.

## Backlog changes

- **#36 (R6: Hashed IP logging)**: resolved by this PR
- **#52 (categorizeError fix)**: resolved by this PR
- **New backlog item**: IPv6 normalization -- if cross-PoP IPv6 representation differences cause correlation gaps in production, consider adding normalization. Currently deferred as YAGNI.
- **New backlog item**: Refactor `performCapture()` to accept options object instead of positional params if more parameters are added in the future.
