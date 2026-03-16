## UX Strategy Review -- load-settle-strategy

**Verdict: APPROVE**

This is a backend timing change with no user-facing interface impact. UX strategy has no blocking concerns.

### Scope assessment

No screens, flows, or interaction patterns are affected. The only API-consumer-visible change is `waitUntilReached` returning `'load'` instead of `'networkidle'` for new captures. The enum is preserved for backward compatibility, so existing integrations continue to work without changes.

### What the plan gets right

**Reduces conceptual leakage.** The OpenAPI description updates replace `networkidle` (an internal Playwright abstraction) with `load` (a standard browser lifecycle concept). API consumers now see terminology they already understand from web development. This is a net simplification of the mental model.

**Serves the user job directly.** The job is "capture a web resource reliably." The change unblocks captures on ad-heavy sites that currently fail. No new concepts or decision points are introduced for API consumers.

**Lean scope.** The plan correctly excludes agent reviews where they add no value (API spec agent for narrative-only changes, security agent for a passive timer). The single-task structure means no partial-deliverable risk.

### No concerns within UX strategy domain.
