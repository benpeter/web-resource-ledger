## Outcome

Captures complete reliably for ad-heavy sites (tagesschau.de, adobe.com) that visually load in 2-3s but whose tracking scripts keep network connections alive indefinitely. Currently `page.goto()` uses `waitUntil: 'networkidle'` which burns 20s of the 30s `ctx.waitUntil` budget waiting for network silence that never comes, leaving the partial capture fallback too little time to succeed (tall page screenshots exceed the 2s deadline, cold browser sessions push total time past 30s).

## Success criteria

- tagesschau.de and adobe.com captures complete successfully (not timeout/pending)
- Navigation phase completes in under 10s for typical sites (currently 20s+)
- Sufficient time budget remains for consent dismissal (8s), screenshots, WACZ building, and R2/KV writes
- All existing tests pass
- Staged fallback from #53 remains functional as safety net for pages that don't reach the load event
- NAV_TIMEOUT_MS restored to 25s (or justified if kept at 20s)

## Scope

**In:** `page.goto()` wait strategy in `defaultRenderer()`, settle delay after load event, NAV_TIMEOUT_MS value, related test assertions

**Out:** Consent dismissal logic, WACZ/signing pipeline, partial capture fallback rewrite, general capture parameterization

## Constraints

- Use `waitUntil: 'load'` with a post-load settle delay (~3s) to allow late-rendering JS to complete
- Must fit within the 30s `ctx.waitUntil` hard limit including all downstream work

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- pick the next available evolution sequence number (check docs/evolution/ for existing entries) and use the slug provided below. Evolution slug: load-settle-strategy.
