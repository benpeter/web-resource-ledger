## Security Review Verdict

ADVISE

---

- [security-minion]: The 8-hex-char SHA-256 prefix (32 bits) is too short for a fingerprint used as the sole keyId when the key space is unbounded; birthday collision probability at scale is non-trivial, and the truncated hash gives no second-preimage resistance worth relying on for attribution -- but for a single-key pre-R12 world it is acceptable as a static label, not a security primitive.
  SCOPE: `src/auth.js` Task 1 -- `keyId` derivation
  CHANGE: The task prompt must state explicitly that `keyId` is NOT a security primitive and MUST NOT be used for any access-control decision, only for logging attribution. The JSDoc added in Task 1 should include this constraint: "keyId is a logging label only -- do not use for access control."
  WHY: If future callers mistake the fingerprint for a verifiable identity (e.g., "this request must have come from key X because keyId matches"), a collision or pre-R12 static value would allow impersonation in audit reasoning. Documenting the non-security semantics now prevents that misuse before R12 introduces real per-tenant keys.
  TASK: Task 1

- [security-minion]: The `scopes` field in the planned `audit.key.create` event schema (Task 4 decisions.md) is typed as `string[]`, but `JSON.stringify` on the log payload will serialize it as an array. The existing `log()` helper serializes the entire `data` object with `JSON.stringify` into the `text` field. Coralogix `text` field is treated as a string blob; array values nested inside it cannot be queried field-by-field. This is a query-contract mismatch, not a security issue per se, but if `scopes` ever contains attacker-influenced values (e.g., a tenant supplies a scope name during key creation) and is logged without sanitization, it is an INVARIANT violation.
  SCOPE: `docs/evolution/0038-audit-logging/decisions.md` -- `audit.key.create` schema (Task 4), and future R12 admin key endpoint implementation
  CHANGE: The `decisions.md` schema note for `audit.key.create` should specify that `scopes` values are validated against a closed allowlist before logging (e.g., `['capture', 'read', 'admin']`) and that no caller-supplied string may flow directly into the scopes array without allowlist validation. Add this as an explicit constraint in the schema table note: "scopes values must be from the server-defined allowlist; never log raw caller-supplied scope strings."
  WHY: INVARIANT in `src/log.js` prohibits attacker-controlled input in log data. If R12 key creation accepts scopes from the request body and logs them verbatim, the INVARIANT is silently violated. Documenting the constraint now in the schema definition closes the gap before R12 implementation.
  TASK: Task 4

- [security-minion]: The SSRF block audit fields in Task 2 include `reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail`. The fallback `result.detail` is attacker-influenced: `validateUrl()` constructs `result.detail` from the input URL or hostname. If the fallback branch is reached, attacker-controlled content flows directly into a log field, violating the INVARIANT.
  SCOPE: `src/index.js` -- `security.ssrf_block` log call (Task 2 step 4)
  CHANGE: Replace the fallback with a closed enum. Do not use `result.detail` directly. Map to one of a fixed set of reason codes -- for example: `url_scheme_not_allowed`, `private_ip_blocked`, `ssrf_blocked_other`. The mapping should be exhaustive with a safe default: `reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail.includes('private') ? 'private_ip_blocked' : 'ssrf_blocked_other'`. Alternatively, have `validateUrl()` return a typed reason code rather than a free-form string.
  WHY: The INVARIANT in `src/log.js` requires that log fields contain only static values or predetermined strings. `result.detail` is derived from the attacker-supplied URL (hostname, scheme, etc.) and is attacker-controlled. Logging it verbatim in the `reason` field is an INVARIANT violation that can leak URL structure into Coralogix and, in the worst case, allow log injection if Coralogix parses the JSON text field for structured extraction.
  TASK: Task 2

- [security-minion]: Task 3 is scoped to comment-only changes in `src/log.js`, and the INVARIANT update correctly acknowledges the URL exception and adds the audit subsystem constraint. However, the INVARIANT text should also explicitly call out that `keyId` (a server-computed SHA-256 prefix) and `captureId` (a server-generated UUID) are the only non-static identifiers permitted in audit fields -- making the permitted set enumerable rather than open-ended. An open-ended "server-generated identifiers" category could be misread as permission to log any server-computed value, including values derived from attacker input.
  SCOPE: `src/log.js` -- INVARIANT comment (Task 3)
  CHANGE: Tighten the INVARIANT language from "server-generated identifiers (captureId, keyId)" to "server-generated identifiers whose construction does not incorporate attacker-controlled input: captureId (UUID v4, random), keyId (SHA-256 prefix of operator-managed secret)."
  WHY: Clear enumeration of what qualifies as a safe "server-generated identifier" prevents future implementers from treating e.g. a captureId derived from a URL hash or a slug derived from a tenant-supplied name as safe for logging without additional scrutiny.
  TASK: Task 3

---

None of these are blocking. The SSRF `result.detail` leakage (third advisory) is the highest-priority item -- it is an INVARIANT violation that introduces attacker-controlled content into structured logs. The others are documentation hygiene and forward-compatibility constraints for R12.
