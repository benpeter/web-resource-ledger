# Phase 1: Meta-Plan -- Switch RFC 3161 TSA from DigiCert to Sectigo (#66)

## Task Assessment

This is a **3-line configuration change** across 2 files:

1. `wrangler.toml` line 44: production `TSA_URL` -- `digicert` to `sectigo`
2. `wrangler.toml` line 89: staging `TSA_URL` -- `digicert` to `sectigo`
3. `vitest.config.js` line 28: test binding `TSA_URL` -- `digicert` to `sectigo`

The source code (`src/rfc3161.js`) is already TSA-agnostic -- it takes `tsaUrl`
as a parameter from the environment. No code changes are needed. Historical
evolution logs and nefario reports reference DigiCert but are explicitly out of
scope (they document what happened, not what to do).

**Blast radius**: Low. The change affects which external TSA endpoint is called.
No new code, no new dependencies, no schema changes, no API surface changes.

**Reversibility**: Trivial. Change the URL back.

## Meta-Plan

### Planning Consultations

This task does not benefit from specialist planning consultations. Here is why:

The entire task is "replace string A with string B in 3 known locations." There
are no design decisions, no architectural choices, no API contracts, no security
models, and no UX implications. The Sectigo endpoint has already been selected
and validated by the task author. The scope is explicitly bounded (no multi-TSA
failover, no implementation changes).

Consulting specialists for planning would produce one of two outcomes:
1. They confirm the obvious (change the URL in 3 places) -- no value added
2. They suggest scope expansion (add failover, add health checks, validate cert
   chains) -- explicitly out of scope per the task definition

Neither outcome improves the plan.

### Cross-Cutting Checklist

- **Testing**: NOT needed for planning. Existing tests use `env.TSA_URL` from
  `vitest.config.js`, which is one of the 3 lines being changed. Tests will
  automatically use the new URL. Phase 6 (post-execution test run) will verify
  all tests pass. No new test strategy needed.

- **Security**: NOT needed for planning. Sectigo is a trusted root CA in all
  major stores. The protocol (HTTPS) is unchanged. The TSA response validation
  logic (nonce check, messageImprint check) is unchanged. The security model is
  identical -- only the hostname changes. The original RFC 3161 phase already
  had security-minion review the TSA selection approach.

- **Usability -- Strategy**: NOT needed for planning. No user-facing behavior
  changes. The verification page already shows the TSA URL dynamically from the
  stored capture metadata. New captures will show `timestamp.sectigo.com`
  instead of `timestamp.digicert.com`. Existing captures retain their original
  TSA URL. No user journey changes.

- **Usability -- Design**: NOT needed. No UI changes.

- **Documentation**: NOT needed for planning. Historical docs are explicitly out
  of scope. The `decisions.md` for the new evolution phase (0028) should record
  the TSA switch rationale, but that is part of the evolution log requirement
  (CLAUDE.md mandate), not a documentation planning question.

- **Observability**: NOT needed. No new runtime components. Existing Coralogix
  logging already captures TSA URL in request metadata.

### Anticipated Approval Gates

**Zero gates.** This task has:
- Low blast radius (0-1 dependents on the URL value)
- Trivially reversible (change the string back)
- No judgment calls (the TSA is already selected, the locations are known)
- No downstream tasks that depend on a gate decision

Per gate classification rules: easy to reverse + low blast radius = NO GATE.

### Rationale

No specialists are recommended for planning because this is a bounded
configuration change with no design decisions. The task pre-analysis has already
identified all 3 files, all 3 lines, and the exact replacement strings. The
source code is TSA-agnostic. The test infrastructure inherits the URL from
config.

The execution plan should be a single task: one agent makes 3 string
replacements. The post-execution phases (test run, code review) provide
sufficient quality assurance for a change of this scope.

### Scope

**In scope:**
- Replace `https://timestamp.digicert.com` with `https://timestamp.sectigo.com`
  in `wrangler.toml` (2 locations) and `vitest.config.js` (1 location)
- Evolution log entries for phase 0028 (`decisions.md`, `outcome.md`)

**Out of scope:**
- RFC 3161 implementation changes
- Multi-TSA failover
- TSA selection UI
- Historical doc updates (evolution 0025, nefario reports)
- Backlog changes (the TSA switch is not a backlog item -- it is a bug fix for
  the existing R11 implementation)

### External Skill Integration

No external skills detected in project.

## Recommendation

**Skip specialist planning (Phase 2) and proceed directly to a minimal
execution plan.** This task is a textbook case where the planning overhead
exceeds the task complexity. A single execution task with post-execution
test validation (Phase 6) is sufficient.

If the orchestrator requires a synthesis phase, the "specialist contributions"
are: "change the URL in 3 places." That is the complete technical plan.
