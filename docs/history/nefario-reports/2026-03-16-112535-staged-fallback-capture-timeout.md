---
task: "Staged fallback for capture timeout"
date: 2026-03-16
mode: advisory
status: complete
task-count: 0
gate-count: 0
agents-consulted: [iac-minion, security-minion, api-design-minion, ux-strategy-minion]
compaction-events: 0
---

## Summary

Advisory on whether WRL should implement a staged fallback strategy for pages
that timeout during capture. All four specialists recommend YES with HIGH
confidence. Pages that currently fail entirely (tagesschau.de, heavy JS sites)
would instead produce usable partial captures with disclosed limitations.

## Original Prompt

Investigate the 25s NAV_TIMEOUT_MS constraint in capture.js and evaluate a
staged fallback strategy for heavy pages that timeout. Current situation:
page.goto uses waitUntil:'networkidle' with a 25s timeout inside a 30s
ctx.waitUntil budget. Heavy sites like tagesschau.de never reach networkidle
within 25s and fail entirely -- losing the capture. Proposed: capture whatever
rendered before the timeout and mark as partial.

## Key Design Decisions

1. **Keep status:'complete', add renderQuality:'full'|'partial'** -- lifecycle
   and fidelity are orthogonal dimensions. New status value would break consumers.
2. **Skip WACZ on timeout path** -- time budget too tight (~1.5-4.5s headroom).
3. **DOMContentLoaded is the minimum threshold** -- below that, still fail.
4. **Sign captureQuality into WACZ datapackage.json** -- tamper-evident evidence.
5. **No retryable on partial captures** -- they are successes, not failures.
6. **Factual language** -- "Page did not reach network idle" not "degraded."

## Team Recommendation

**Implement the staged fallback.** It is a strict improvement: timeout failures
move from "no evidence" to "documented partial evidence." The Playwright page
survives TimeoutError (screenshot/content still work). The 30s ctx.waitUntil
limit is hard and not configurable. Queues (R16) remain the medium-term answer
but the fallback is valuable even post-Queues.

### Consensus
- Partial evidence beats no evidence (all 4 specialists)
- Keep status:'complete' with renderQuality dimension (all 4)
- 30s ctx.waitUntil is hard, not extendable (iac-minion, confirmed)
- Playwright page survives TimeoutError (iac-minion, needs @cloudflare/playwright validation)
- Skip WACZ on timeout path (iac-minion, security-minion agree)
- Verification page stays green (ux-strategy, security agree)

### Dissent
- retryable on partial captures: api-design-minion YES, ux-strategy NO → resolved NO
- renderQuality enum values: api-design 'full'|'partial', ux-strategy cause-specific → resolved 'full'|'partial'

### Risks
1. Tight time budget after timeout (~1.5-4.5s) -- needs explicit deadline tracking
2. @cloudflare/playwright page survival unvalidated -- needs test Worker first
3. Consent dialog captures -- honest but may not serve user intent
4. No WACZ on partial captures -- evidence chain limitation until Queues

### Next Steps (if adopted)
1. Validate page survival on @cloudflare/playwright with test Worker
2. Implement fallback in capture.js (catch TimeoutError, check readyState, capture with short timeouts)
3. Add renderQuality + render metadata to KV records and API surface
4. Embed captureQuality in WACZ datapackage.json for full captures
5. Update OpenAPI spec (v0.3.0), verification page, observability
6. Update R16 backlog with activation trigger (timeout rate >5%)

## Agent Contributions

### Planning (Phase 2)

| Agent | Key Contribution |
|-------|-----------------|
| iac-minion | 30s limit is hard; page survives TimeoutError; time budget analysis; Queues as medium-term |
| security-minion | Evidence integrity: sign quality into WACZ; attacker-controlled timeout is low risk; four-tier hierarchy |
| api-design-minion | renderQuality field on complete records; render metadata object; backward compatible; v0.3.0 |
| ux-strategy-minion | Partial > none above DOMContentLoaded; factual language; verification stays green; reduced retry is good |

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario --advisory` — staged fallback evaluation

</details>

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-16-112535-staged-fallback-capture-timeout/`
