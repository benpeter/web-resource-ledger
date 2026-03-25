# Meta-Plan: Backend Fixes Batch

## Task Summary

Two small backend improvements to the WRL capture worker:

1. **Skip approaching_limit dispatch when already sent (#187)**: Captures 161-200 for free-tier tenants currently call `dispatchNotification()` on every capture, which internally runs 2 D1 queries (load prefs + check dedup) before discovering the notification was already sent this period. Short-circuit at the call site to avoid these wasted round-trips.

2. **Descriptive Content-Disposition filenames (#181)**: Artifact download responses currently use generic filenames (`screenshot.png`, `bundle.wacz`, etc.). Include the captured domain and date in the filename (e.g., `capture-example.com-2026-03-24.wacz`).

## Planning Consultations

### Consultation 1: Notification short-circuit approach

- **Agent**: api-design-minion
- **Planning question**: For issue #187, the current `dispatchNotification()` is called inside a `ctx.waitUntil()` block in the queue consumer (src/index.js ~lines 306-328). The dedup already happens inside `dispatchNotification()` via `checkNotificationSent()` in email-dispatch.js. Two options: (a) check dedup at the call site before calling `dispatchNotification()`, or (b) add an early-return cache/flag that avoids the D1 round-trips inside `dispatchNotification()`. Which approach keeps the API surface cleaner -- duplicating the dedup check at the call site, or adding a lightweight pre-check that `dispatchNotification()` callers can optionally use? Also: for #181, the capture record has `url` and `createdAt` fields available in the artifact download handler. Should the filename use the full domain or strip `www.`? What about special characters in domains (IDN, ports)?
- **Context to provide**: src/index.js lines 305-328 (call site), src/email-dispatch.js lines 149-301 (dispatchNotification), src/index.js lines 1721-1810 (artifact download handler), src/db.js rowToCapture (capture record shape)
- **Why this agent**: API design expertise for Content-Disposition header conventions and for evaluating whether the short-circuit belongs at the caller or the dispatch layer

### Cross-Cutting Checklist

- **Testing**: Include test-minion for planning -- both fixes need test coverage. The notification short-circuit needs a test proving D1 queries are avoided. The filename fix needs tests for edge cases (IDN domains, long URLs, special characters). Existing tests in `test/notification-triggers.test.js`, `test/email-dispatch.test.js`, and `test/capture-retrieval.test.js` set the pattern.
- **Security**: Exclude -- neither fix introduces attack surface. The Content-Disposition filename is already inside an `attachment` disposition (no XSS risk), and the notification change only skips work, it doesn't add a new code path. The existing `text/plain` Content-Type for HTML artifacts (line 1786) already handles the XSS case.
- **Usability -- Strategy**: Exclude from planning. These are invisible backend optimizations (reduced D1 load) and a minor download UX improvement. No user journey change.
- **Usability -- Design**: Exclude -- no UI changes.
- **Documentation**: Exclude from planning. Changes are minor and internal. OpenAPI spec may need a note about the new filename format in the artifact download response, but that's an execution detail, not a planning question.
- **Observability**: Exclude -- no new runtime components. The existing suppression logging in `dispatchNotification()` already covers the dedup case; the short-circuit will just avoid reaching that code path.

### Notable Exclusions

- **ux-strategy-minion**: Both fixes are backend-only with no user journey impact. The filename improvement is cosmetic and follows obvious conventions.
- **security-minion**: Content-Disposition with `attachment` disposition is already safe. Notification short-circuit removes code paths, doesn't add them.
- **data-minion**: D1 query optimization is straightforward (skip 2 queries); no schema changes needed.

### Anticipated Approval Gates

None. Both fixes are low blast radius (0-1 dependents), easy to reverse (additive code changes), and follow clear best practices. No gates warranted.

### Rationale

This is a small, well-scoped batch of backend fixes. The only planning question worth consulting a specialist on is the architectural choice of where to place the short-circuit logic (call site vs. dispatch layer) and the filename format conventions for Content-Disposition. A single consultation with api-design-minion covers both. The codebase context is clear enough that synthesis can produce complete task prompts from one specialist's input plus the cross-cutting checklist.

### Scope

**In scope**:
- Short-circuit `dispatchNotification('approaching_limit', ...)` call when the notification has already been sent this billing period (avoiding ~2 D1 round-trips per capture for free-tier tenants at 161-200 captures)
- Add descriptive filenames to Content-Disposition headers in artifact download responses, using captured domain + date
- Test coverage for both changes
- Certificate download endpoint filename (already uses `certificate-{captureId}.pdf`, may also benefit from domain+date)

**Out of scope**:
- Changes to the `dispatchNotification()` function itself (the dedup logic there is correct and serves other callers)
- Changes to notification preferences, email templates, or the email queue
- UI changes
- OpenAPI spec updates (deferred to Phase 8 if warranted)

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | .claude/skills/ops-runbook/SKILL.md | LEAF | WRL operational procedures | Not relevant -- this is for admin/ops tasks, not code changes |

#### Precedence Decisions

No conflicts. The ops-runbook skill is orthogonal to this task.
