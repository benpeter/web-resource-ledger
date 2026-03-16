# TSA Error Logging

**Issue**: #72 -- fix(wacz): log TSA errors instead of silently swallowing

## Summary
- Replace empty `catch {}` block in TSA timestamp request with error logging to Coralogix
- Enables diagnosing why Sectigo TSA fails in production (Cloudflare Workers) despite working from curl/Node.js

## Context
After merging #68 (TSA switch to Sectigo), production captures show `timestampStatus: absent` -- the TSA call fails silently. This adds observability so we can see the actual error.

## Test plan
- [x] `test/wacz.test.js` passes (18 tests, 3 new)
- [ ] After deploy: trigger capture, check Coralogix for `capture.tsa_fail` event

Resolves the silent failure described in CLAUDE.md "Fail loudly, degrade intentionally" principle.
