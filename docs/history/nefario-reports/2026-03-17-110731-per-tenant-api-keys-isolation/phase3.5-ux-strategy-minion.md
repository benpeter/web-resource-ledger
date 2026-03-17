# UX Strategy Review -- Per-Tenant API Keys (Phase 0037)

## Verdict: APPROVE

The plan is sound. My prior concerns were addressed in synthesis and the operator journey is well-designed. No blockers or advisories remain.

---

## Rationale

### Journey coherence

The three-phase migration runbook (deploy -> enable -> retire) matches the operator's actual decision sequence and correctly frames each phase around the operator's question ("Can I deploy this without breaking anything?", "How do I start using the new system?", "When is it safe to remove the legacy key?"). This is the right mental model. The phases are additive and irreversible in the right direction -- each phase increases confidence before committing to the next.

The operator job-to-be-done is: "Add a second tenant without disrupting the first." The plan serves this directly. The dual-mode fallback means the operator can deploy the code and do nothing else -- the default tenant continues working via the legacy key. That is the right default behavior.

### Cognitive load

Error messages name the required scope (`"This operation requires 'capture' scope."`), the 403 body is actionable, and the `warning` field on POST is included. These are the moments of highest operator confusion risk and the plan handles them correctly.

The `?include=revoked` default is correct. Operators checking active keys should not need to filter. Operators auditing history opt in. This matches the satisficing pattern -- the default view answers the most common question.

Idempotent DELETE is correct. Revoking an already-revoked key returning 200 rather than 409 removes a class of "did it work?" confusion in scripts.

### Conflict resolutions that directly addressed my prior flags

- **Name uniqueness**: resolved in my favor (no enforcement). Names are human labels; `keyHash` is the identifier. No friction during key rotation. YAGNI.
- **Warning field**: included. Security-critical one-time display moment. Low implementation cost, high incident-prevention value.
- **`wrl_test_` prefix**: deferred to backlog. Correct call at current scope.

### One observation (no action required)

The Coralogix query in Phase 3 of the runbook (`authMethod:"legacy" AND event:"capture.start"`) assumes operators know their Coralogix query syntax. This is fine -- OPERATIONS.md is operator-facing, not end-user-facing, and the query is copy-pasteable as written. No change needed.
