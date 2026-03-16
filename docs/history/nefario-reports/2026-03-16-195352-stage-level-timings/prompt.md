## Outcome

Each phase of `defaultRenderer()` reports its own duration so that slow stages (session acquisition, navigation, consent, screenshots) can be identified from Coralogix logs and the capture API, replacing the current opaque single `durationMs` number that hides where the 30s `ctx.waitUntil` budget is actually spent. This is motivated by tagesschau.de taking 19.4s and adobe.com failing entirely for pages that load sub-second in a local browser.

## Success criteria

- `render` metadata returned from `defaultRenderer()` includes per-stage durations (sessionAcquireMs, contextSetupMs, navigationMs, settleMs, consentMs, screenshotMs, contentMs)
- Stage timings flow into the KV record and are visible via `GET /v1/captures/:id`
- A structured log event with individual stage durations is emitted to Coralogix on every capture (full and partial)
- All existing tests pass unchanged
- No change to capture behavior or timing (instrumentation only)

## Scope

**In:** `defaultRenderer()` stage timing, `render` metadata shape, structured log event, OpenAPI spec for render object

**Out:** Alerting rules, Coralogix dashboard setup, performance optimization, behavior changes to navigation or consent logic

---
Additional context: skip all approval gates -- defer decisions to gru and lucy instead of halting for human input. skip compaction checkpoints. auto-create the PR at wrap-up without halting. IMPORTANT: write process.md in the evolution log directory -- this is a project requirement. IMPORTANT: other worktrees may be running in parallel -- check the evolution log sequence numbers on upstream main before PR creation and adjust.
