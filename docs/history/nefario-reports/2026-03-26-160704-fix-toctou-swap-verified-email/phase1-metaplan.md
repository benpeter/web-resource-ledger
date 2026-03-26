## Meta-Plan

### Task Summary

Fix a TOCTOU race condition in `swapVerifiedEmail()` where the SQL WHERE clause
does not pin the expected `pending_email` value, allowing a concurrent request to
promote the wrong email. The fix is surgical: add `AND pending_email = ?` to the
WHERE clause, pass the expected email from the caller, and update the existing
test comment.

### Planning Consultations

This is a tightly scoped, low-risk bug fix touching 3 lines of SQL, 1 function
signature, 1 call site, and 1 test comment. The issue description already
specifies the exact fix. Extended specialist planning would add overhead
disproportionate to the task.

**No planning consultations recommended.** The fix is fully specified in the
issue, the code locations are identified, and the change is mechanical. Planning
consultations would produce obvious answers at the cost of time and tokens.

### Cross-Cutting Checklist

- **Testing** (test-minion): NOT NEEDED FOR PLANNING. The existing test at
  line 343 of `email-verify.test.js` already covers the stale-token scenario
  and asserts the correct behavior. The test currently passes because the
  application-level cross-check (`prefs.pendingEmail !== email`) catches the
  mismatch before `swapVerifiedEmail()` is called. After the fix, the test
  still passes via the same path -- the DB-level guard is defense-in-depth.
  The test comment (TOCTOU NOTE) should be updated to reflect the fix. This
  is straightforward enough to include in execution without planning input.

- **Security** (security-minion): NOT NEEDED FOR PLANNING. security-minion
  originally identified this TOCTOU gap during Phase 0084. The fix is exactly
  what they recommended. No new attack surface is introduced -- the change
  strictly narrows the WHERE clause.

- **Usability -- Strategy** (ux-strategy-minion): NOT APPLICABLE. This is a
  backend SQL fix with no user-facing behavioral change. The user experience
  is identical before and after -- the cross-check already rejects stale
  tokens. This fix adds defense-in-depth at the DB layer. Excluding
  ux-strategy from planning because there is no journey, flow, or cognitive
  load dimension to evaluate.

- **Usability -- Design** (ux-design-minion, accessibility-minion): NOT
  APPLICABLE. No UI changes.

- **Documentation** (software-docs-minion / user-docs-minion): NOT NEEDED FOR
  PLANNING. The only documentation change is updating the TOCTOU comment in
  the test file and the evolution log entry (which is a project process
  requirement, not a specialist concern). No API surface changes, no
  architectural changes.

- **Observability** (observability-minion): NOT APPLICABLE. No new runtime
  components, no logging changes needed. The existing `swap_failed` log
  event already covers the case where `changes === 0`.

### Notable Exclusions

- **ux-strategy-minion**: Pure backend SQL fix with no user-facing behavioral
  change; the cross-check already rejects stale tokens from the user's
  perspective.
- **data-minion**: The SQL change is a single WHERE clause addition to an
  existing UPDATE statement -- no schema changes, no query planning concerns.
- **test-minion**: Existing test already covers the scenario; only a comment
  update is needed, not new test design.

### Anticipated Approval Gates

**None.** This fix has:
- Low blast radius (one function, one caller)
- Easy reversibility (additive WHERE clause condition)
- Zero downstream dependents in the plan
- The exact fix is already specified in the issue

No gate is warranted.

### Rationale

This task is a textbook "just do it" fix: the problem is precisely diagnosed,
the solution is specified down to the SQL clause, the code locations are
identified, and an existing test validates the behavior. The change is:

1. Add `expectedEmail` parameter to `swapVerifiedEmail(db, tenantId, expectedEmail)`
2. Add `AND pending_email = ?` to the WHERE clause and bind `expectedEmail`
3. Pass `email` (from the decoded token) at the call site in `email-verify.js`
4. Update the TOCTOU comment in `email-verify.test.js`

Involving specialists in planning would produce the same conclusion at higher
cost. The execution plan should assign this to a single agent (security-minion
or a code-focused minion) with the full context.

### Scope

**In scope:**
- Fix `swapVerifiedEmail()` WHERE clause in `src/db.js`
- Update caller in `src/email-verify.js` to pass expected email
- Update/remove TOCTOU comment in `test/email-verify.test.js`
- JSDoc update for the new parameter
- Evolution log entry (project requirement)

**Out of scope:**
- New tests (existing test already covers the scenario)
- Schema changes
- API surface changes
- Any other email verification changes

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operational procedures (tenant mgmt, D1, secrets, deploys) | Not relevant -- this is a code fix, not an operational procedure |

#### Precedence Decisions

No conflicts. The ops-runbook skill covers operational procedures and has no
overlap with this code-level bug fix.
