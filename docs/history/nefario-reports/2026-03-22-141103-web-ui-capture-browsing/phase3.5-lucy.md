# Lucy Review: Web UI Capture Submission & Browsing

## Verdict: ADVISE

The plan is well-aligned with the original request and project conventions. It stays within the stated scope (capture submission, list, detail, auth, mobile, vanilla JS), follows existing codebase patterns (template strings in Worker, design system tokens, verify-page.js as reference), and respects CLAUDE.md engineering philosophy. No framework dependencies, no speculative features, no scope creep beyond what was asked.

The following items are minor and should not block execution.

---

### Findings

- [SCOPE]: Root redirect is not in the original request.
  SCOPE: `src/index.js` -- proposed `GET /` -> 302 `/ui` redirect
  CHANGE: Task 1 adds a `['GET', /^\/$/, handleRootRedirect]` route that redirects `/` to `/ui`. The original request does not ask for this, and the existing Worker returns 404 for unmatched routes (which is deliberate -- it is an API Worker, not a website). Adding a root redirect changes the public behavior of the Worker for all clients, not just UI users.
  WHY: This is a small scope addition that changes externally-observable behavior. An API client hitting `/` today gets a 404 (correct for an API); after this change it gets a 302 to an HTML page. The redirect could also surprise monitoring or health-check tools. The plan already says "only if there is no existing root handler (check first)" which is good, but the decision to add it at all is outside the stated requirements.
  TASK: 1

- [CONVENTION]: The plan includes a conditional instruction to add a root redirect that is phrased as "do this, but check first." This makes the decision ambiguous for the implementation agent.
  SCOPE: Task 1 prompt -- root redirect instruction
  CHANGE: Either commit to the redirect (with rationale) or remove it. Do not leave it as a conditional instruction that the implementing agent has to evaluate at runtime. The implementing agent is frontend-minion, not an architect.
  WHY: Ambiguous conditionals in task prompts lead to inconsistent execution. The agent may or may not add it depending on how it reads the code, producing an unpredictable diff.
  TASK: 1

- [CONVENTION]: Task 4 tests only cover server-side HTML generation; the "test the real boundaries" principle deserves acknowledgment.
  SCOPE: `test/ui-dashboard.test.js` -- test scope
  CHANGE: No change required in the plan (E2E deferral is well-justified). However, Task 4's prompt should explicitly note that the deferred E2E tests are tracked as a backlog item, so the obligation is not lost.
  WHY: CLAUDE.md says "When adding a feature that depends on an external service, the test suite must include at least one assertion that the integration actually works end-to-end." The plan correctly defers E2E tests and explains why, but the evolution log and backlog must capture this deferral. The plan's "Cross-Cutting Coverage" section mentions deferral but does not say "add to backlog." The CLAUDE.md evolution log rules (rule 4) require backlog updates for deferred items.
  TASK: 4

- [COMPLIANCE]: Evolution log directory and files are not mentioned in any task prompt.
  SCOPE: `docs/evolution/` -- missing from task assignments
  CHANGE: The orchestrator must ensure that `docs/evolution/NNNN-web-ui/prompt.md`, `decisions.md`, and `outcome.md` are created per CLAUDE.md evolution log rules. This obligation exists regardless of whether the skill workflow includes it. Since none of the four task prompts mention evolution log creation, the calling session must handle it.
  WHY: CLAUDE.md Precedence section: "If a skill's wrap-up sequence doesn't include a step that this file mandates (e.g., evolution log entries), the calling session must add that step." This is a compliance requirement, not a nice-to-have.
  TASK: (orchestrator-level, not a specific task)

---

### Traceability

| Requirement (from prompt.md) | Plan coverage |
|------------------------------|---------------|
| Browser-based interface for submitting a URL | Task 2 (submit form) |
| Viewing capture status | Task 2 (polling), Task 3 (detail pending state) |
| Capture list view with status | Task 2 (list view) |
| Capture detail with verification, screenshot, metadata | Task 3 (detail view) |
| Auth flow for web (API key input) | Task 1 (auth gate) |
| Works on mobile browsers | Tasks 1-3 (375px, card layout, touch targets) |
| No JavaScript framework -- vanilla HTML/JS/CSS | All tasks (template strings, inline script, no deps) |
| Out: Admin dashboard | Not present -- correct |
| Out: User management UI | Not present -- correct |
| Out: Advanced search | Not present -- correct |
| Out: Offline support | Not present -- correct |

All stated requirements have plan coverage. All plan elements trace to stated requirements except the root redirect (flagged above).
