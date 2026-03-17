# Meta-Plan: Eliminate Silent Catch Blocks

## Task Summary
Audit all catch blocks in src/, eliminate silent error swallowing, fix timestampStatus semantics ('absent' → 'skipped'), and surface three-way status in API/verification page.

## Specialists Selected

### observability-minion
**Rationale**: Error logging patterns in catch blocks, Coralogix log structure for degraded paths.
**Planning question**: What logging pattern should catch blocks use when they intentionally degrade? How should we distinguish "error swallowed" from "error handled with fallback" in Coralogix logs?

### test-minion
**Rationale**: Test coverage for timestamp status changes and catch block behavior.
**Planning question**: What tests need updating/adding for the timestampStatus semantic change ('absent' → 'skipped') and the new error logging in catch blocks?

## Cross-cutting Checklist
- [x] Security: No new attack surface (error handling changes only)
- [x] Performance: No impact (logging is fire-and-forget)
- [x] YAGNI: Scoped to existing catch blocks, no new features
- [x] CLAUDE.md compliance: Implements "Fail loudly, degrade intentionally" principle

## External Skills
No external skills detected.
