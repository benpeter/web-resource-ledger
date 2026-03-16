# Decisions: 0029-load-settle-strategy

## D1: NAV_TIMEOUT_MS stays at 20s (not 25s)

Issue #67 said "restored to 25s (or justified if kept at 20s)." Both planning
specialists (debugger-minion and test-minion) independently flagged budget
overrun risk with 25s.

**The math**: With `waitUntil: 'load'`, NAV_TIMEOUT_MS now covers only the
`load` event (DOM + sync subresources), not network idle. For healthy sites,
`load` fires in 1-5s. For pathological sites, 10-15s. A 20s timeout is
generous.

**Budget at 25s**: 25 (goto) + 3 (settle) + 8 (consent) + 2 (post) = 38s.
Exceeds the 30s `ctx.waitUntil` hard limit.

**Budget at 20s**: 20 (goto) + 3 (settle) + 8 (consent) + 2 (post) = 33s.
Still tight worst-case, but if `goto` takes 20s, `TimeoutError` fires and
the staged fallback runs (settle delay never executes). Realistic worst:
10 + 3 + 8 + 2 = 23s.

**Why 25s saves nothing**: Any site needing >20s to fire the `load` event is
broken. The `load` event is not `networkidle` -- it fires when the DOM and
images/CSS/iframes are loaded, before tracking scripts settle. 20s is already
generous for this narrower event.

**Alternatives rejected**:
- 25s with budget check before consent: adds complexity, fragile, YAGNI
- 25s with shorter settle: defeats the purpose of the settle delay

## D2: Plain timer (`setTimeout`) for settle delay

Three options were evaluated:
- **Option A: `page.waitForTimeout(3000)`** -- deterministic, no hang risk
- **Option B: `page.waitForLoadState('networkidle')` with 3s timeout** -- could
  succeed early on clean sites, but risks TimeoutError confusion with the staged
  fallback's catch block
- **Option C: Custom idle detection** -- monitors network activity, MutationObserver,
  returns early when "settled". Over-engineered for the problem.

Chose Option A (implemented via `setTimeout` since `@cloudflare/playwright` may
not expose `waitForTimeout`). Deterministic, zero risk, simple.

## D3: Post-settle limitExceeded re-check (security advisory)

security-minion flagged during Phase 3.5: the response listener continues
processing during the 3s settle window. A malicious page could stream large
responses during settle to bypass the 50MB size cap. Added a second
`if (limitExceeded) throw` after the settle delay. Two-line fix, closes the
gap completely.

## D4: categorizeError template literal refactor

Changed hardcoded `"Page did not finish loading within 20 seconds"` to
`` `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds` ``.
Since NAV_TIMEOUT_MS stays at 20000, the output is identical. This is a
single-point-of-truth improvement that prevents drift if the timeout ever
changes. All 4 error message assertions continue to pass unchanged.
