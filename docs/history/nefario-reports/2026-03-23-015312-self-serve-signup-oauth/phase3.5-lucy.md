# Lucy Review -- Self-Serve Signup via GitHub OAuth

## Verdict: ADVISE

The plan is well-aligned with the original request and mostly compliant with CLAUDE.md conventions. Three issues need attention before execution; none require restructuring.

---

## Traceability Matrix

| Requirement (from prompt.md) | Plan Element | Status |
|-----|-----|-----|
| OAuth 2.0 authorization code flow with GitHub | Task 3 (oauth.js) | COVERED |
| First-time login auto-creates tenant in D1 | Task 1 (migration), Task 2 (db.js), Task 3 (callback handler) | COVERED |
| First API key displayed once, not retrievable | Task 3 (first-key KV + endpoint), Task 7 (welcome view) | COVERED |
| Session cookie (HttpOnly, Secure, SameSite=Lax) | Task 3 (session.js, `__Host-` prefix) | COVERED |
| Account settings: list active API keys | Task 4 (account.js GET), Task 7 (settings view) | COVERED |
| Account settings: create additional keys (configurable limit) | Task 4 (POST, maxKeys check), Task 7 (inline form) | COVERED |
| Account settings: revoke keys with confirmation | Task 4 (DELETE, last-key guard), Task 7 (inline confirm) | COVERED |
| ToS acceptance recorded with timestamp in D1 | Task 1 (tos columns), Task 2 (acceptTos fn), Task 4 (tos endpoint), Task 7 (tos view) | COVERED |
| Existing admin API continues to work | Task 5 (explicit "do not change" constraints), verification step 1 | COVERED |
| OAuth state parameter prevents CSRF | Task 3 (KV state, single-use delete) | COVERED |
| Logout clears session cookie | Task 3 (handleAuthLogout), Task 7 (sign out nav) | COVERED |
| Handle pre-existing operator tenant (link, don't duplicate) | Decisions section (deferred admin link endpoint, documented limitation) | PARTIAL -- see Finding 3 |

---

## Findings

### Finding 1 -- TRACE: Backend ToS enforcement is specified but not tasked

**WHAT**: The Decisions section (line 898) states: "The ToS gate in the UI is a soft block that the backend enforces via 403 on account endpoints when tosAcceptedAt is null." Verification step 5 (line 969) asserts: "New user without ToS acceptance cannot access account endpoints (403)."

**WHERE THE GAP IS**: Neither Task 4 (account.js handlers) nor Task 5 (router auth gate in index.js) instructs the implementing agent to check `tosAcceptedAt` and return 403. The router auth gate code block (lines 403-432) verifies the session and checks the CSRF header, but has no ToS check. Task 4's prompt says nothing about rejecting requests when ToS is unaccepted. The frontend ToS gate (Task 7) is implemented, but the backend enforcement that the plan itself claims exists is not assigned to any task.

**FIX**: Add a ToS check to the router auth gate in Task 5's prompt (after session verification, before attaching `env._session`): if `session.tosAcceptedAt` is null and the request is not to `POST /v1/account/tos`, return 403 with a problem response. This requires `verifySession()` to return `tosAcceptedAt` in its result object -- add this to Task 3's `verifySession()` spec. Alternatively, put the check in each Task 4 handler, but the router is cleaner.

**SEVERITY**: TRACE -- a requirement stated by the plan itself has no implementing task.

---

### Finding 2 -- SCOPE: `handleFirstKeyAck` endpoint adds unnecessary complexity

**WHAT**: The plan introduces a `POST /v1/account/first-key/ack` endpoint (lines 234-237) whose sole purpose is to delete the KV entry for the first key after the user acknowledges it. The plan also specifies that the KV entry has a 1-hour TTL (line 209) that handles cleanup automatically.

**WHY THIS IS SCOPE**: The explicit ack endpoint exists so the "Continue to Dashboard" button can signal the user has seen the key. But: (a) the KV entry expires in 1 hour regardless, (b) the welcome view already navigates away after clicking "Continue", (c) no other code path depends on the KV entry being absent vs. expired. The ack endpoint adds a route, a handler, a KV delete call, and a test surface for zero functional benefit over letting TTL handle it.

**FIX**: Remove `handleFirstKeyAck` from Task 3 and the `/v1/account/first-key/ack` route from Task 5. Change the "Continue to Dashboard" button in Task 7 to simply navigate to `#/captures` without an API call. If the user returns to `/ui?flow=welcome` within the TTL window, they see the key again -- which is actually better UX (they might need to re-copy). This reduces the route count by one and removes a handler, a test fixture, and a test.

**SEVERITY**: SCOPE -- additional endpoint not justified by stated requirements. Not blocking; harmless if kept.

---

### Finding 3 -- TRACE: Pre-existing operator tenant linking is deferred but the prompt requires it

**WHAT**: The original prompt (line 24) states: "Must handle the case where a GitHub user has previously been provisioned as an operator tenant (link, don't duplicate)." The plan's Decisions section (lines 905-908) defers the admin linking endpoint to the backlog and notes the limitation in Risks (line 922): "If a user signs up before the operator links them, they get a separate tenant."

**WHY THIS MATTERS**: The plan explicitly acknowledges this is a gap. The question is whether the deferral is acceptable given the prompt says "Must handle." The data model does support linking (a `github_users` row can point to any tenant_id), but the callback handler in Task 3 (line 209) unconditionally creates a new tenant with `gh-{githubId}` format -- there is no check for whether the GitHub user's email or username matches an existing operator tenant.

**ASSESSMENT**: The plan is honest about the deferral and provides a manual workaround (D1 SQL). The "must handle" in the prompt is ambiguous -- it could mean "the system must not break if this happens" (satisfied: no crash, just a duplicate) vs. "the system must merge them" (not satisfied). This is a product decision, not a plan defect. Flagging for human judgment.

**FIX**: If this is a hard requirement: add a lookup step in Task 3's callback handler that checks if an admin has pre-linked a GitHub ID to an existing tenant (i.e., a `github_users` row already exists with the correct tenant_id). The current `findGitHubUser` check already does this for returning users -- the gap is only for the case where an admin manually inserted the row. If the deferral is accepted, document it explicitly in the backlog and `outcome.md` as required by CLAUDE.md Evolution Log rules.

**SEVERITY**: TRACE -- stated requirement without clear plan coverage. Requires human decision.

---

## Convention Compliance

| Check | Result |
|-------|--------|
| Vanilla JS, no frameworks | PASS -- Task 7 explicitly requires vanilla JS, no build step |
| YAGNI | PASS -- landing page CTA deferred, profile editing excluded, cron cleanup excluded |
| KISS | PASS -- custom header CSRF over synchronizer tokens reduces complexity |
| Helix Manifesto (lean, fast) | PASS -- minimal tables, KV for ephemeral state, no new dependencies |
| Evolution log requirement | NOT CHECKED HERE -- applies during/after execution, not planning |
| Fail loudly | PASS -- error handling specified throughout; no silent catches |
| Test real boundaries | PASS -- verification steps include staging deploy and real GitHub OAuth flow |

## CLAUDE.md Compliance

| Directive | Result |
|-----------|--------|
| Precedence rule | PASS -- plan does not override CLAUDE.md directives |
| Engineering philosophy | PASS -- YAGNI applied to multiple deferral decisions |
| Evolution log structure | NOT YET APPLICABLE -- plan does not create evolution log entries (expected during execution) |
| Backlog updates | Plan defers items and references backlog -- CLAUDE.md requires updating `docs/backlog.md` after phase |

## Agent Assignment Review

| Task | Agent | Domain Match |
|------|-------|------|
| 1: D1 Migration | data-minion | CORRECT |
| 2: db.js functions | data-minion | CORRECT |
| 3: OAuth + Session | oauth-minion | CORRECT |
| 4: Account API | api-design-minion | CORRECT |
| 5: Router integration | api-design-minion | CORRECT |
| 6: Wrangler config | iac-minion | CORRECT |
| 7: Frontend | frontend-minion | CORRECT |
| 8: Test fixtures | test-minion | CORRECT |
| 9: Observability | observability-minion | CORRECT |

## Task Prompt Quality

All 9 task prompts are self-contained with explicit context file references, clear deliverables, "What NOT to do" sections, and success criteria. The prompts reference specific file paths and existing patterns. Gate rationales explain the decision with rejected alternatives.

One note: Task 9 (observability) depends on Tasks 3 and 4 being complete but its prompt says "Review and add log calls in src/oauth.js (if not already present from Task 3)." This is pragmatic -- the observability minion fills gaps rather than duplicating work. Acceptable.

## Scope Assessment

9 tasks for a feature that spans schema, data layer, OAuth protocol, session management, 4 API endpoints, router changes, config, 4 new UI views, 3 modified UI files, test fixtures, and observability. The task count is proportional to the requirement complexity. No task is extraneous.

---

## Summary

The plan is solid, well-structured, and closely aligned with the original request. Three items need attention:

1. **Backend ToS enforcement** (Finding 1) is described in the plan's own decisions and verification steps but not assigned to any task. This will cause verification step 5 to fail. **Must fix before execution.**
2. **First-key ack endpoint** (Finding 2) is minor scope creep with no functional benefit over KV TTL. Can proceed either way.
3. **Operator tenant linking** (Finding 3) is deferred against a "Must handle" in the prompt. Requires human decision on whether the deferral is acceptable.

Verdict is ADVISE because Finding 1 is a concrete gap that will cause a stated verification step to fail, but the fix is a small addition to two existing task prompts rather than a structural change.
