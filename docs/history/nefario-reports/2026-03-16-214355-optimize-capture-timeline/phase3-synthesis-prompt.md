MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle (#79).

Success criteria:
- Consent timeout reduced from 8s to 2s; all existing consent tests pass
- Autoconsent failures degrade to consentStatus:'failed'/'error' instead of crashing; capture completes
- Settle delay adapts to network activity with 3s cap; pages that settle faster proceed earlier
- Median capture time for CMP-absent pages drops by at least 5s
- adobe.com captures succeed (currently TypeError crashes renderer)

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase2-debugger-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase2-security-minion.md

## Key consensus across specialists:

debugger-minion: Adaptive settle via in-flight request counter using page.on('request'/'requestfinished'/'requestfailed') with 500ms quiescence + 3s hard cap. Ignore websocket/eventsource. ~40 lines, self-contained function. Returns telemetry (settledMs, pendingAtCap).
security-minion: Selective error propagation in try/catch around dismissCookieConsent -- re-throw browser death errors, only catch consent-specific. Introduce consent.status 'error' distinct from 'failed'. Log from performCapture() not renderer. No changes to consent.js catch block itself.

Both agree: no additional agents needed, task is well-scoped to 2 source files + tests.

## External Skills Context
No external skills detected.

## Instructions
1. Review both specialist contributions
2. Create a focused execution plan. This is a 2-file change (consent.js constant, capture.js settle+consent handling) plus tests
3. Group into minimal tasks -- this is small enough for 1-2 execution tasks
4. Ensure every task has a complete, self-contained prompt
5. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-H6iVro/optimize-capture-timeline/phase3-synthesis.md
