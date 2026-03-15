# Lucy Review: mvo-coralogix-observability

## Verdict: ADVISE

The plan is well-aligned with the user's original request. Scope is tightly
contained, engineering philosophy compliance is strong (YAGNI applied
explicitly in multiple conflict resolutions), and the plan correctly defers
what should be deferred. Two issues require correction before execution; one
is a factual error that will produce incorrect infrastructure, the other is
a CLAUDE.md compliance gap.

---

## Requirements Traceability

| Requirement (from prompt.md) | Plan element | Status |
|---|---|---|
| Every pipeline stage failure emits structured log | Task 4: 4 failure paths (render, header, WACZ, catch-all + KV fail) | COVERED |
| Every success emits structured log with captureId, duration, WACZ status, bundle size | Task 4 Path 4: capture.success event | COVERED |
| Auth failures, SSRF blocks, rate limit hits emit security event logs | Task 5: 6 security events | COVERED |
| Logs shipped to Coralogix via REST, non-blocking fetch in waitUntil | Task 1 (log helper), Task 5 (ctx.waitUntil pattern) | COVERED |
| CORALOGIX_SEND_KEY as Worker secret | Pre-work (already done), Task 3 comment documenting it | COVERED |
| CORALOGIX_ENDPOINT as `[vars]` in wrangler.toml | Task 3 | COVERED (but wrong region -- see finding 1) |
| Log helper is single function under 30 lines, no external deps | Task 1: spec is ~15 lines | COVERED |
| All existing tests pass | Task 7 | COVERED |
| No new npm dependencies | Task 1 constraints, verification step 8 | COVERED |
| Backlog items updated | Task 6 | COVERED |

No orphaned tasks. No unaddressed requirements.

---

## Findings

### Finding 1: Coralogix region mismatch (BLOCK-worthy factual error)

- **SCOPE**: Task 3 -- `CORALOGIX_ENDPOINT` value in wrangler.toml
- **ISSUE**: The prompt specifies `https://ingress.eu2.coralogix.com/logs/v1/singles` (EU2/Stockholm region) and explicitly states the pre-work was done against EU2 ("Coralogix account created (EU2/Stockholm region, dashboard: wrl.app.eu2.coralogix.com)"). Task 3 uses `https://ingress.eu1.coralogix.com/logs/v1/singles` (EU1 -- Ireland). This is a different Coralogix cluster entirely. Logs sent to EU1 will not appear in the EU2 dashboard.
- **RISK**: All logs silently dropped in production. The fire-and-forget design means this will produce zero errors -- complete silent data loss.
- **SUGGESTION**: Change Task 3's endpoint value from `eu1` to `eu2`: `https://ingress.eu2.coralogix.com/logs/v1/singles`. Also update Conflict Resolution 4's mention of "Legacy Coralogix endpoint deprecation" (Risk 4) which references "the new regional format (`ingress.eu1.coralogix.com`)" -- this should say `eu2`.

### Finding 2: Evolution log not in task list (COMPLIANCE)

- **SCOPE**: Plan task list (Tasks 1-7)
- **CHANGE**: The plan has no task for creating the `docs/evolution/0015-coralogix-observability/` directory with `prompt.md`, `decisions.md`, and `outcome.md`.
- **WHY**: CLAUDE.md "Evolution Log" section, Rules 1-6 are non-negotiable: "Before starting a phase: create the directory and write `prompt.md`." The plan also does not include updating `docs/evolution/README.md` (Rule 5). Additionally, CLAUDE.md "Process Documentation" requires a `process.md` after every nefario orchestration that produces a PR. These are project-level requirements that survive skill workflow omissions per the Precedence section.
- **TASK**: The nefario orchestration framework may handle this outside the delegation plan (in its wrap-up phase). If so, no change needed to the plan itself -- but the calling session must ensure these artifacts are produced. Flag for nefario to confirm. If nefario's wrap-up does not cover evolution log creation, add a Task 8 (blocked by Tasks 6, 7) for creating the evolution log directory and all four files (prompt.md, decisions.md, outcome.md, process.md) plus updating the README index.

### Finding 3: Capture stage coverage vs. prompt (TRACE)

- **SCOPE**: Task 4 vs. prompt success criteria
- **CHANGE**: The prompt lists "R2 write" and "signing" as pipeline stage failures that should emit logs. Task 4 does not instrument these as distinct stages -- R2 failures fall into the catch-all (Path 5) and signing failures are subsumed by the WACZ bundling catch (Path 3).
- **WHY**: Conflict Resolution 5 explicitly decided against a dedicated R2 try/catch (YAGNI), and WACZ bundling includes signing. The catch-all with `errorClass` provides some discrimination. This is a deliberate design choice, not an omission, and aligns with the engineering philosophy. No action required -- documenting for traceability.

### Finding 4: `handleGetSigningKey` rate limiter label (minor, DRIFT)

- **SCOPE**: Task 5 Event 6
- **CHANGE**: The code at line 314-318 uses `VERIFY_RATE_LIMITER` (shared with the verify endpoint), but the plan logs it as `limiter: 'signing_key'`. This is semantically correct for dashboarding (it IS the signing key endpoint being rate-limited), but operators reading the log may search for a `SIGNING_KEY_RATE_LIMITER` binding that does not exist.
- **WHY**: Minor confusion risk. The `limiter` field value should match what an operator would grep for in wrangler.toml when investigating.
- **SUGGESTION**: Either change the logged value to `limiter: 'verify'` (matching the binding name, consistent with Task 5 Event 5 which already uses `limiter: 'verify'` for the same rate limiter), or add a comment in the code clarifying that the verify rate limiter is shared across both endpoints. The former is simpler.

---

## CLAUDE.md Compliance Summary

| Directive | Status |
|---|---|
| Engineering philosophy (YAGNI, KISS, Lean) | PASS -- applied in 5 conflict resolutions |
| No new dependencies | PASS -- explicit constraint |
| Vanilla JS, no frameworks | PASS -- plain fetch + JSON.stringify |
| Evolution log creation | ADVISE -- not in task list (Finding 2) |
| Backlog update | PASS -- Task 6 |
| Evolution README update | ADVISE -- not in task list (Finding 2) |
| process.md creation | ADVISE -- not in task list (Finding 2) |
| Coralogix as preferred platform (CLAUDE.local.md) | PASS |
| JS over TS (CLAUDE.local.md) | PASS |
| `// tva` in significant code files | PASS -- Task 1 includes it |

---

## Summary

Finding 1 (EU1 vs EU2 region) must be fixed before execution -- it will cause complete silent log loss in production. Finding 2 (evolution log) needs confirmation that the orchestration framework handles it; if not, add a task. Finding 4 is a minor label consistency issue that can be addressed during execution.
