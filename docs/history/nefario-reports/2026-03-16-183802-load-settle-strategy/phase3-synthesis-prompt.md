MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Switch navigation wait strategy from networkidle to load + settle delay (GitHub issue #67).

Captures complete reliably for ad-heavy sites (tagesschau.de, adobe.com) that visually load in 2-3s but whose tracking scripts keep network connections alive indefinitely. Currently page.goto() uses waitUntil: 'networkidle' which burns 20s of the 30s ctx.waitUntil budget waiting for network silence that never comes.

### Success criteria
- tagesschau.de and adobe.com captures complete successfully
- Navigation phase completes in under 10s for typical sites
- Sufficient time budget remains for consent dismissal (8s), screenshots, WACZ building, and R2/KV writes
- All existing tests pass
- Staged fallback from #53 remains functional
- NAV_TIMEOUT_MS restored to 25s (or justified if kept at 20s)

### Constraints
- Use waitUntil: 'load' with a post-load settle delay (~3s)
- Must fit within 30s ctx.waitUntil hard limit

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase2-debugger-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase2-test-minion.md

## Key consensus across specialists:

### debugger-minion
- Recommends page.waitForTimeout(3000) for settle delay (deterministic, no hang risk)
- Place after goto succeeds and limitExceeded check, before screenshot
- CRITICAL: Budget overrun risk if NAV_TIMEOUT_MS=25s (25+3+8=36s > 30s)
- Argues for keeping NAV_TIMEOUT_MS at 20s or adding budget check before consent
- Staged fallback structurally unaffected

### test-minion
- Simple value updates: 'networkidle' -> 'load' in 3 fixtures + 2 inline references
- '20 seconds' -> '25 seconds' in 4 error assertions (if NAV_TIMEOUT_MS changes)
- openapi.yaml has references to networkidle and 20 seconds that need updating
- No new renderer variants needed (settle delay is internal detail)
- Same budget concern: worst case 38s > 30s

## External Skills Context
No external skills detected

## Instructions
1. Review all specialist contributions
2. Resolve the NAV_TIMEOUT_MS conflict: issue says 25s, both specialists warn about budget overrun
3. Create the final execution plan in structured format
4. Ensure every task has a complete, self-contained prompt
5. This is a narrow, focused change. Prefer a single execution task (or at most two if there's a natural boundary).
6. The project follows the Helix Manifesto: YAGNI, KISS, lean and mean.
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-SJRIzw/load-settle-strategy/phase3-synthesis.md
