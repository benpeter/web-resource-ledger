# Process: Optimize Capture Pipeline (#79)

## TL;DR

Two planning specialists (debugger-minion, security-minion) designed the three
optimizations in parallel. Six architecture reviewers validated the plan — all
approved or advised, zero blocks. One specialist disagreement (security vs margo
on consent error status) resolved in favor of simplicity. Single execution agent
implemented all changes in one pass. 504 tests pass, zero regressions. Total
orchestration: 2 planning agents, 1 synthesis, 6 reviewers, 1 executor.

## What happened

### Phase 1: Meta-Plan

Nefario analyzed the well-scoped issue and selected a lean planning team: just
debugger-minion (adaptive settle design) and security-minion (consent error
handling). The task was narrow enough that the full 27-agent roster wasn't needed
for planning — the mandatory Phase 3.5 reviewers would catch anything the
planners missed.

The human requested all approval gates be skipped, with decisions deferred to
gru and lucy. This was a deliberate choice: the issue (#79) was thoroughly
specified with success criteria, scope boundaries, and evidence from staging
analysis (#75). The human judged that the decision space was constrained enough
to not warrant interactive gates.

### Phase 2: Specialist Planning

**debugger-minion** designed the adaptive settle mechanism. Key contribution:
an in-flight request counter using `page.on('request'/'requestfinished'/'requestfailed')`
with 500ms quiescence and 3s hard cap. They addressed why this works where
`networkidle` didn't — counting HTTP request/response pairs rather than TCP
connections, and explicitly ignoring websocket/eventsource resource types.

They also made a compelling case for why the previous rejection of this approach
(in 0029-load-settle-strategy, labeled "Option C") didn't apply: that decision
was made when the priority was replacing `networkidle` with something stable. Now
that `load + fixed settle` was proven, the optimization was incremental, not
speculative.

**security-minion** analyzed the consent error handling chain. Two key findings:
1. Browser death errors (Target closed, Session expired, etc.) must re-throw —
   swallowing them delays inevitable failure
2. A new `'error'` consent status distinct from `'failed'` would improve evidence
   chain integrity in the WACZ bundle

The specialists agreed on everything else. No additional agents recommended.

### Phase 3: Synthesis

Nefario synthesized into a single-task, zero-gate execution plan. All three
changes were cohesive enough for one agent. The new timing budget was calculated:
worst case 27s (down from 33s), fast path ~9.5s.

### Phase 3.5: Architecture Review

Six reviewers (5 mandatory + observability-minion as discretionary):

| Reviewer | Verdict | Key Finding |
|----------|---------|-------------|
| security-minion | APPROVE | Non-Error throw values need `String()` coercion. Evidence chain intact. |
| test-minion | ADVISE | Verify render passthrough for settle telemetry; don't touch partial fixtures. |
| ux-strategy-minion | APPROVE | No user-facing changes. `error` vs `failed` distinction noted as well-communicated. |
| lucy | ADVISE | Note error/failed refinement in PR description. Plan matches intent, no scope drift. |
| margo | ADVISE | **New `'error'` consent status is YAGNI.** Collapse to `'failed'`, keep log event. |
| observability-minion | ADVISE | Add settleMs/settleReason to capture.success log. Add errorClass to consent_error. |

**The disagreement: security-minion vs margo on consent status**

security-minion argued for a new `'error'` status to distinguish "autoconsent
library crashed" from "CMP rejected the opt-out attempt" in the WACZ evidence
chain. This would propagate through captureSettings, OpenAPI, test fixtures, and
the ternary mapping.

margo argued YAGNI: the user's success criteria explicitly say "degrade to
consentStatus: 'failed'". The `capture.consent_error` log event (with errorClass
and errorMessage) provides all the operator distinguishability needed without
expanding the API surface.

**Resolution**: margo's position adopted. The Helix Manifesto's KISS principle
and the user's own specification tipped the decision. The log event provides the
same signal at the observability layer without adding a fourth enum value to the
public API. If evidence chain distinguishability becomes a real need (e.g., a
user reports they can't tell crash from rejection), a new status can be added
then — it's a backwards-compatible change.

### Phase 4: Execution

Single debugger-minion agent (sonnet) implemented all changes in one pass:
- `src/consent.js`: Timeout constant 8000 → 2000
- `src/capture.js`: `waitForSettle()` function, consent try/catch with selective
  error propagation, settle telemetry in success log, consent_error log event
- `test/capture.test.js`: 4 new tests, updated enrichedStubRenderer fixture
- `openapi.yaml`: settleMs/settleReason in RenderInfo schema

All observability advisories incorporated: settleMs/settleReason in
`capture.success`, errorClass/errorMessage in `capture.consent_error`.

504 tests pass across 23 test files, zero regressions.

### Human Interventions

**What was changed by the human**: Nothing. The plan was approved without
modification. All approval gates were skipped per the human's directive at
invocation.

**What was deliberately left alone**: The consent.js internal try/catch (line 68)
was not modified — the existing bare catch returning `{status:'failed'}` is
comprehensive. The outer catch in capture.js is defense-in-depth for errors that
escape consent.js (e.g., Playwright methods throwing after context issues).

**Rationale for skipping gates**: The issue was thoroughly specified with clear
success criteria, quantitative constraints (2s timeout based on staging data),
and explicit scope boundaries. The decision space was narrow enough that
specialist recommendations + architecture review provided sufficient governance
without interactive human checkpoints.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/` (companion directory
  for this run's report)
- Stage-level timing evidence: `docs/evolution/0031-stage-level-timings/`
- Load + settle strategy (predecessor): `docs/evolution/0029-load-settle-strategy/`
- Consent implementation: `docs/evolution/0027-dual-screenshot-consent/`
