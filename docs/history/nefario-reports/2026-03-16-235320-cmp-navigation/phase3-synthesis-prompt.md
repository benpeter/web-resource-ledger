MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task

Fix cross-domain navigation block to allow CMP consent iframes in capture.js. The route handler blocks ALL cross-domain navigation requests using isNavigationRequest(), preventing CMP iframes from loading. Fix narrows blocking to main-frame only.

Success criteria:
- Cross-domain iframe navigations (CMP iframes) no longer blocked
- Cross-domain top-level navigations still blocked (TOCTOU preserved)
- Autoconsent detects CMPs on iframe-based consent sites
- All existing tests pass

Scope: context.route handler in capture.js (~lines 367-375), related tests and comments.
Constraint: Use route.request().frame() === page.mainFrame() (or Playwright equivalent).

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-security-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-test-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase2-debugger-minion.md

## Key consensus across specialists:

### security-minion
Phase: planning
Recommendation: Fix is safe. Main-frame-only check preserves TOCTOU. No same-registrable-domain allowlisting for BBC. Handle null/error from frame() as non-main-frame (allow).
Tasks: 1 -- Modify route handler; update security comments in capture.js
Risks: frame() returning null/throwing must be handled correctly
Conflicts: none

### test-minion
Phase: planning
Recommendation: No new automated tests. Routing requires real browser. Extract would violate YAGNI. Manual verification + backlog item for staging E2E.
Tasks: 1 -- Document manual verification procedure; add backlog item
Risks: page variable scoping (TDZ)
Conflicts: none

### debugger-minion
Phase: planning
Recommendation: Two bugs in naive approach: (1) const page TDZ crash (page declared after route registration), (2) frame() throws on pre-creation requests, never returns null. Playwright redirects NOT seen by route handler. Safe pattern: let page = null before route, assign after newPage(), null-check + try-catch in callback.
Tasks: 1 -- Use let page = null, try-catch around frame(), handle redirect edge case
Risks: frame() throws; page TDZ
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. No external skills to integrate

Important constraints from user:
- Skip all approval gates -- defer decisions to gru and lucy agents
- This is a focused, single-file bugfix. Keep the plan minimal.
- The project requires an evolution log entry (docs/evolution/NNNN-short-name/)

7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-E0Ctd0/cmp-navigation/phase3-synthesis.md
