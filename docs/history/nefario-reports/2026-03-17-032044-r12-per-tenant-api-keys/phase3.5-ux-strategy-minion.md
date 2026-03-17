# UX Strategy Review -- R12 Per-Tenant API Keys

**Verdict: APPROVE**

---

## Summary

The plan reflects sound operator-centered thinking throughout. The conflict resolutions that went my way (required `name`, 200 with confirmation body on DELETE) directly address the highest-risk operator failure modes. The one significant issue below is a genuine friction point in the admin API but does not warrant a BLOCK -- it is correctable in the task prompt without resynthesis.

---

## Journey Coherence: Operator Key Management Flow

The operator's journey for provisioning a tenant has three acts: provision ADMIN_KEY, create the first tenant key, hand the raw key to the caller. The flow is coherent.

**What works well:**

- The raw key is shown exactly once and never again appears in list or revoke responses. This is the correct pattern. Operators know to copy it immediately because the confirmation body makes the stakes clear.
- The 200 + confirmation body on DELETE removes the worst friction point in key revocation: the "did that actually work, and for which key?" question. A fat-finger on a 64-char hash with a silent 204 is undetectable without a follow-up list call. The confirmation body (`keyHash`, `name`, `revokedAt`) closes that loop immediately.
- Required `name` on creation is the single most important operator-safety decision in this plan. Without it, the list endpoint returns a wall of anonymous hashes. Revocation decisions under operational pressure (incident, compromised key) require confident identification. `name` provides that at near-zero cost.
- The 409 self-revocation guard and last-admin-key guard prevent the two most likely foot-guns in admin key management. Both surface as actionable 409 messages with enough specificity to understand the constraint without consulting documentation.
- The IDOR prevention pattern (404, not 403, when a tenant-scoped admin key tries to read another tenant's key) is correct UX for a multi-tenant system. A 403 leaks the existence of the key. A 404 treats the key as simply not found from this tenant's perspective.

**One friction point worth noting:**

The `tenantId` field on `POST /v1/admin/keys` is conditionally required: required for ADMIN_KEY callers, silently ignored and overridden for tenant-scoped admin key callers. The validation message "Field 'tenantId' is required" appears only for the ADMIN_KEY path. A tenant-scoped admin operator who includes `tenantId` (to be explicit about which tenant they're provisioning for) gets a 403 if they specify a different tenant, but receives no feedback that their field was silently overridden if they specify their own tenantId.

This is a minor mental model mismatch: the field is present in the schema but behaves differently depending on caller identity, and the API surface does not signal this difference. The OpenAPI spec (Task 5) should document this clearly in the `tenantId` field description: "Required for superadmin callers. For tenant-scoped callers, this field is ignored; the key is created for the caller's tenant." That documentation change is achievable within Task 5 and 6 without touching the implementation.

---

## Cognitive Load: API Surface Complexity

The admin API has three endpoints with a combined surface area that is well within working memory bounds:

- CREATE: two required fields for tenant-scoped callers (`name`, `scopes`), three for superadmin (`tenantId` additionally)
- LIST: zero body, one optional query param for superadmin
- DELETE: one URL path param (64-char hash)

The 64-char hash as the sole identifier for DELETE deserves brief examination. It is visually unwieldy and error-prone to type, but operators will not type it -- they will copy it from a list response or construct it programmatically. The decision to use the full hash (over a 16-char prefix) is correct for reasons documented in Conflict 3. The `name` field provides the human-readable identifier for confirmation; the hash provides the programmatic handle. These two pieces of information serve different cognitive jobs and do not conflict.

The scope system (`capture`, `read`, `admin`) with the `capture implies read` expansion rule is the most conceptually novel element. The rule is implemented in `verifyApiKey()` transparently to operators. However, the rule should be stated explicitly in error messages when scope violations occur. The current `requireScope()` message -- "This API key does not have the 'capture' scope required for this operation" -- is correct. A separate concern: if an operator creates a `capture`-only key and then calls `GET /v1/captures`, they should not get a 403 because the scope expansion in Task 1 adds `read` automatically. This is the right behavior, and the spec should document it (Task 5 already plans to: "Requires `read` scope (implied by `capture`)").

Rate limiting at 5/min on admin endpoints is appropriately conservative. It will not frustrate legitimate operators (who provision keys infrequently) and limits brute-force exposure.

---

## Error Message Clarity

The error messages are specific and actionable throughout. Standout examples:

- `"Field 'name' is required. Provide a name to identify this key."` -- explains both the constraint and the purpose
- `"Unknown scope 'foo'. Valid scopes: capture, read, admin"` -- surfaces the valid vocabulary immediately
- `"Cannot revoke the key used to authenticate this request"` -- self-explanatory, no documentation lookup required
- `"Cannot revoke the last admin key for this tenant"` -- explains the constraint without jargon

The misconfiguration guard (503 when KV, ADMIN_KEY, and CAPTURE_API_KEY are all absent) is a correct operational signal: this is not a caller error, it is a deployment error. Operators need to know immediately that the system is misconfigured, not that their credentials are wrong.

One small improvement: the 400 for `tenantId` format -- "Field 'tenantId' must be 1-64 lowercase alphanumeric characters, hyphens, or underscores" -- is accurate but long. It is correct and clear; I raise it only for completeness. No change required.

---

## Does Each Task Serve a Real Operator Need?

**Task 1 (auth rewrite)**: Yes. This is foundational -- without multi-path auth, none of the tenant isolation or admin API is possible.

**Task 2 (admin module)**: Yes. The three handlers map directly to the three jobs operators have: provision a key, audit what keys exist, revoke a compromised key. No handler is speculative.

**Task 3 (scope enforcement + observability enrichment)**: Yes. Without scope enforcement on existing handlers, the admin API produces keys that don't actually constrain access. The keyName enrichment on 19+ log events is a real operational capability: when an incident occurs, operators need to know which key was used, not just which tenant. This is legitimate.

**Task 4 (infrastructure)**: Yes. The ADMIN_RATE_LIMITER binding is a prerequisite for Task 2. No speculative work.

**Task 5 (OpenAPI spec)**: Yes. The admin API is server-to-server; the spec is the primary documentation surface for operator integration. Not optional.

**Task 6 (documentation)**: Yes. The migration runbook directly addresses the most operationally sensitive moment: the transition from CAPTURE_API_KEY to per-tenant keys. Operators need pre-deploy, post-deploy, verification, and rollback steps in one place.

---

## Minor Observations (No Action Required)

**performCapture parameter sprawl**: The plan acknowledges 8 positional parameters and defers a refactor. This is the correct call. The refactor cost now would be high relative to benefit, and R13 scope is unknown.

**lastUsedAt deferral**: Correct. A KV write on every authenticated request is a meaningful latency and cost addition for a field that is nice-to-have at the current scale. The deferral decision is sound.

**tenant-keys index race condition**: Documented as a known limitation. At 5 creates/minute rate limit, the practical risk is negligible. No operator-facing impact until the index is corrupted, and the primary record remains the source of truth.

---

## Verdict Rationale

The plan correctly prioritizes operator safety over API purity in every conflict. Required `name`, confirmation body on DELETE, actionable error messages, and self-revocation guards all reduce the failure modes that cause real operational pain. The API surface is minimal (three endpoints, simple schemas, clear scope vocabulary). The journey from zero to first provisioned tenant key is short and documented. The single friction point I identified (conditional `tenantId` behavior) is documentable within existing tasks, not a structural problem.

**APPROVE**
