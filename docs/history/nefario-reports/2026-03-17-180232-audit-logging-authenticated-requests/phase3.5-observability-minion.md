## Observability Review: Audit Logging for Authenticated Requests

**Verdict: ADVISE**

---

- [observability]: The Coralogix query pattern `json.tenantId:"acme"` used in the plan's verification step and evolution log assumes Coralogix has a Parse JSON Field rule applied to the `text` field. The existing `log()` function stores the event payload as `JSON.stringify(data)` in the `text` field — a JSON string, not a parsed object. Without a Coralogix parsing rule that extracts `text` into `json.*` subfields, the proposed field-level queries will not work; only full-text search against the raw string would.
  SCOPE: `src/log.js`, Coralogix account configuration, `docs/evolution/0038-audit-logging/decisions.md`
  CHANGE: Either (a) confirm that a Parse JSON Field rule is already active in the Coralogix account for these subsystems and document that dependency in decisions.md, or (b) change the query examples in decisions.md to use Lucene full-text syntax (`text:"acme"`) and add a note that field-level queries require the JSON parsing rule to be enabled. The verification step in the plan ("query Coralogix for `subsystemName:"audit"`") should explicitly include testing a `json.tenantId` field query to confirm the parsing rule is active before marking the feature done.
  WHY: If the parsing rule is absent, operators running the documented queries will get zero results despite events being ingested correctly. This is a silent failure mode — the audit trail is technically present but not queryable by the intended syntax. Every existing event (capture.success, security.auth_fail, etc.) has this same dependency, so either it is already resolved or it is a systemic gap.
  TASK: Task 4 (decisions.md content), Verification step 8

---

- [observability]: The `capture.kv_create_fail` error path (index.js lines 187-196) is an authenticated request that fails after auth succeeds, but no audit event is emitted. The plan explicitly states this is correct ("If KV write fails, the error path returns early and no audit.capture.create is emitted — which is correct"), but this means `outcome: 'error'` is never emitted for capture create failures in the audit subsystem. An operator investigating a tenant's activity would see a gap: the tenant's key was valid, a create was attempted, but no record appears in either success or error audit events. The `capture.kv_create_fail` event in the `capture` subsystem covers the operational side, but the audit trail has a hole for this failure class.
  SCOPE: `src/index.js` — `handleCreateCapture()` KV failure branch
  CHANGE: Emit an `audit.capture.create` event with `outcome: 'error'` in the KV failure catch block, using the `tenantId` and `keyId` already available in scope at that point, and `resourceId: null` since captureId exists but the record was not created. This closes the audit trail gap for the one authenticated failure mode that currently produces no audit event.
  WHY: The three-value outcome enum (`success`, `denied`, `error`) is only useful if `error` is actually emitted when errors occur post-authentication. An audit trail that only records successes and denied attempts, but silently omits post-auth errors, will mislead operators doing activity investigations. The KV failure path is rare but not impossible.
  TASK: Task 2

---

- [observability]: The `list.success` event (index.js line 299) uses severity 6 (debug/verbose), not severity 3 (info). The plan proposes audit events at severity 3. This is consistent and correct — audit events should be info-level. No change needed to the proposed severity. However, the subsystem registry Task 3 is adding to `src/log.js` should document the severity convention alongside the subsystem names, since existing subsystems use 3, 4, 5, and 6, and the docstring currently only lists `3=info, 4=warn, 5=error` — severity 6 is used in production but undocumented.
  SCOPE: `src/log.js` — JSDoc `@param` for `severity`
  CHANGE: While Task 3 is updating the INVARIANT comment, extend the severity docstring to acknowledge severity 6 (used by `list.success`). The current docstring `3=info, 4=warn, 5=error` implies 6 is not used, but it is. This is a documentation accuracy issue, not a functional one.
  WHY: The subsystem registry Task 3 adds is intended to be the authoritative reference for `log()` callers. An incomplete severity table in the same comment block will cause confusion when someone adds a new event and wonders whether severity 6 is intentional or a mistake.
  TASK: Task 3
