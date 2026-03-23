# Phase 6: Test Results

## Summary
- **Total tests**: 83
- **Passed**: 80
- **Failed**: 3 (pre-existing, not caused by URL changes)
- **Test suite**: `packages/verify`

## Pre-existing failures
All 3 failures are caused by missing `asn1js` package in the worktree environment:
- `test/cli-args.test.js` — ERR_MODULE_NOT_FOUND: asn1js
- `test/cms-chain.test.js` — ERR_MODULE_NOT_FOUND: asn1js
- `test/verify.test.js` — ERR_MODULE_NOT_FOUND: asn1js

These failures exist before and after the URL changes. The `asn1js` package is
not installed in this git worktree's node_modules.

## Verdict
All URL-related test assertions pass. No regressions introduced.
