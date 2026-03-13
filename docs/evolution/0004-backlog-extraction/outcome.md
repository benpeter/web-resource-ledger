# 0004: Backlog Extraction Outcome

## What Was Produced

- `docs/backlog.md` -- 50 items across 8 domains, extracted from 3 evolution phases and their companion nefario reports

## Key Numbers

- 50 items total
- 8 domains: Auth, API, Signing/Legal, Capture Fidelity, Security, Storage, Operations, Product
- 9 must-have items (explicitly committed or "before production")
- 14 should-have items (specialist consensus, no hard commitment)
- 27 consider items (mentioned possibilities)

## Sources Mined

- `docs/MVP.md` -- "What's Out" table (14 items), gray zone decisions, constraints
- `docs/evolution/0001-kickoff/` -- decisions, outcome, process
- `docs/evolution/0002-scaffold/` -- decisions, outcome
- `docs/evolution/0003-url-validation/` -- decisions, outcome, process
- `docs/history/nefario-reports/2026-03-13-105026-*/` -- phase2 specialist reports (gru, security-minion, api-design-minion, margo, iac-minion), phase3 synthesis, phase3.5 reviews
- `docs/history/nefario-reports/2026-03-13-155336-*/` -- phase3 synthesis, phase3.5 reviews

## Observations

- The "must-have" tier is small (9 items) and clusters around auth/access control and operations. These are the items that gate multi-user deployment.
- The "consider" tier is large (27 items) because the kickoff phase was thorough about documenting what was excluded and why. Most of these are product features that depend on validated demand.
- Security items are disproportionately in "should-have" (7 of 14). The security-minion was systematic about flagging "before production" items during kickoff.
- Some items appear in multiple specialist reports (e.g., RFC 3161, list endpoint, CORS). Cross-references were deduplicated into a single backlog entry with the strongest source cited.

## CLAUDE.md Convention Added (revised)

Initial recommendation was "no convention, wait for evidence." The evidence
was immediate: 50 items after 3 phases. Added backlog review as Evolution
Log rule #4, triggered at the outcome.md checkpoint. Each outcome.md now
includes a "Backlog changes" section. See `decisions.md` for the
revised rationale.

## Backlog Changes

This phase created the backlog. All 50 items are new. No prior backlog
existed to update.

## Next

The backlog is a reference document, not a roadmap. Items graduate to GitHub
issues when they enter active planning for a specific phase. The next
implementation phase (Step 3: Capture Endpoint) may resolve some items
(redirect chain re-validation) and surface new ones.
