## UX Strategy Review: audit-logging-authenticated-requests

**Verdict: ADVISE**

---

- [ux-strategy]: `keyId` carries two distinct meanings across the event schema, creating operator confusion during cross-event investigations
  SCOPE: `docs/evolution/0038-audit-logging/decisions.md` — audit.key.revoke schema (Task 4)
  CHANGE: In `audit.key.revoke`, rename the "who performed the revocation" field from `keyId` to `actorKeyId` (or `adminKeyId`), reserving `keyId` exclusively for "the key this event is about." In `audit.key.create`, `keyId` already correctly means "the new key's fingerprint," so no change there. Add a field glossary note to decisions.md: "`keyId` always refers to the subject key (the key being used or acted upon). The performing actor's key is `actorKeyId` on admin operations."
  WHY: In capture events, `keyId` means "the tenant key that made this request." In the `audit.key.revoke` schema as written, `keyId` means "the admin key that performed the revocation" — a different semantic. An operator querying `keyId:"abc12345"` across all audit events to trace a key's history will get a mix of "requests made with this key" and "admin operations performed by this key," which are different investigations. The field overloading forces the operator to hold two mental models simultaneously, violating Nielsen's consistency heuristic and increasing cognitive load at exactly the moment it matters (abuse investigation under time pressure). Since the key.revoke schema is forward-spec for R12, fixing the naming now costs nothing and prevents a schema migration later.
  TASK: Task 4

- [ux-strategy]: SSRF-blocked requests with authenticated tenants are invisible to `subsystemName:"audit"` queries, creating an incomplete tenant activity picture
  SCOPE: `src/index.js` — SSRF block log call (Task 2); operator query journey
  CHANGE: Either (a) emit a *second* lean audit event for authenticated SSRF blocks in the `audit` subsystem alongside the existing `security.ssrf_block` event — preserving the security signal in `security` while giving the audit trail completeness — or (b) document the two-subsystem query pattern explicitly in decisions.md so operators know to use `subsystemName:"audit" OR (subsystemName:"security" AND event:"security.ssrf_block" AND tenantId:*)` for a complete tenant activity view. Option (a) is a 5-line addition; option (b) is documentation-only but requires operators to discover and remember the pattern.
  WHY: The plan correctly places SSRF blocks in `security` because they are security signals. But SSRF blocks on authenticated requests have tenant identity — they represent "tenant X attempted to capture a disallowed URL." An operator investigating tenant X's activity will find only successful captures and list operations in `subsystemName:"audit"`, missing a potentially significant abuse indicator. The JTBD for this audit feature is "abuse investigation and compliance reporting" (per prompt.md). An audit trail that silently omits authenticated-but-blocked attempts is incomplete for that job. This matters most during an active abuse investigation when the operator has no reason to know they need to check a second subsystem.
  TASK: Task 2, Task 4

---

**Non-issues (noted for clarity)**

- **Three-value outcome enum** (`success` / `denied` / `error`): Clean and unambiguous. Each value maps to a distinct operator mental model (it worked / system rejected it / something broke). No concern.
- **Flat field structure**: Correct choice. Deeply nested objects in Coralogix require dot-notation queries that operators routinely get wrong under pressure. Flat is faster and less error-prone.
- **Dedicated `audit` subsystem over flag approach**: Sound from a user journey perspective. `subsystemName:"audit"` is a single-token query; `text.audit:true` requires knowing field structure before you can start. The dedicated subsystem lowers the query entry cost.
- **Lean audit events + separate operational events**: Appropriate separation. The operator investigating "who did what" and the operator debugging "what went wrong" have different jobs and different query patterns. Mixing the data serves neither well.
- **No request-start events, completion events only**: Correct. Start events with no corresponding completion double the noise and create ambiguity about whether an action succeeded. Operators satisfice — they'll look at the first matching event, not verify the pair.
