#72 -- fix(wacz): log TSA errors instead of silently swallowing

## Summary
- Replace empty `catch {}` block in TSA timestamp request with error logging to Coralogix
- Enables diagnosing why Sectigo TSA fails in production (Cloudflare Workers) despite working from curl/Node.js

## Context
After merging #68 (TSA switch to Sectigo), production captures show `timestampStatus: absent` -- the TSA call fails silently. This adds observability so we can see the actual error.

## Test plan
- [x] `test/wacz.test.js` passes (15 tests)
- [ ] After deploy: trigger capture, check Coralogix for `capture.tsa_fail` event

Resolves the silent failure described in CLAUDE.md "Fail loudly, degrade intentionally" principle.

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug provided below. Evolution slug: tsa-error-logging.
