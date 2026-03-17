## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. The operator journey is "filter, then scan" -- the schema must optimize for both

The operator investigating abuse or generating a compliance report follows this journey:

**Phase 1 -- Scope (filter to the tenant + time range)**
The operator's first action is always a Coralogix query like `tenantId:"acme" AND timestamp:[now-24h TO now]`. This is the highest-stakes moment: if `tenantId` is missing from any event type, the query silently drops those events and the operator doesn't know they're missing. This is the "must-be" feature (Kano) -- its absence destroys trust in the entire audit trail.

**Phase 2 -- Scan (what did they do?)**
The operator reads a chronological list of events and needs to answer "what happened" from the event names alone, without expanding every payload. This means event names must be scannable as a narrative: `capture.queued`, `list.success`, `admin.key_create` tells a story. The operator should be able to reconstruct the sequence of actions from event names alone.

**Phase 3 -- Drill (why did this happen?)**
On a specific suspicious event, the operator expands the payload to see keyName, authMethod, cip, url, etc. These are secondary details -- important but only needed per-event, not for scanning.

**Phase 4 -- Pivot (was this the only tenant affected?)**
The operator pivots from tenant-scoped to field-scoped queries: `keyHashPrefix:"a1b2c3d4"` to see all tenants that used a specific key, or `cip:"hmac_xyz"` to see all tenants from a specific IP. This requires consistent field naming across event types.

**Implication**: `tenantId` must be present on every audit event, including admin events. Currently `admin.key_list` has `tenantFilter` but not `tenantId` (the admin operator isn't a tenant). `security.auth_fail` and `security.rate_limit` often lack `tenantId` because auth failed before tenant identification. This is correct -- but the absence should be an explicit `null`, not a missing field, so Coralogix queries can distinguish "pre-auth failure" from "field was omitted by mistake."

#### 2. Event naming convention: the current `subsystem.action` pattern is good but has one gap

The existing pattern `{subsystem}.{action}` supports both exact match (`event:"capture.queued"`) and prefix/wildcard exploration (`event:capture.*`). This is the right convention. It maps to how operators think: "show me everything capture-related" or "show me exactly the queued events."

**One gap**: The `list` subsystem is an odd name. An operator thinking "what API actions did tenant X perform?" would mentally categorize listing captures as a capture-related action, not a separate subsystem. The mental model is: *capture* is the domain, and within it you can queue, list, get status, get artifacts. A future operator who hasn't read the codebase would search `event:capture.*` and miss `list.success`.

**Recommendation**: Rename `list.success` to `capture.list` and `list.error` to `capture.list_fail`. This aligns with the operator's domain mental model (captures are the domain, list is an action within it) and ensures `event:capture.*` catches all capture-related activity. The `subsystem` parameter to `log()` would remain `capture` for these events, which is already the correct Coralogix subsystem.

This is a breaking change for existing Coralogix queries that filter on `event:"list.success"`. Given that this project is early (per-tenant keys just shipped), the migration cost is low. If preserving backward compatibility matters, emit both old and new event names during a transition period -- but I'd recommend the clean break.

#### 3. Field naming consistency: create a mandatory audit field set

The operator's pivot queries (Phase 4) break if the same concept has different field names across events. Current inconsistencies:

| Concept | capture events | admin events | security events |
|---------|---------------|--------------|-----------------|
| Tenant | `tenantId` | `tenantId` | (often missing) |
| Key identity | `keyName` | `keyHashPrefix` + `name` | `keyHashPrefix` |
| Auth method | `authMethod` | (missing) | (missing) |
| Client IP hash | `cip` | (missing) | `cip` |
| Outcome | implicit in event name | implicit in event name | `reason` |

**Recommendation -- mandatory audit fields on every authenticated request event**:

```
tenantId       -- always present; null if auth failed before tenant resolution
keyName        -- human label; null for legacy auth or pre-auth failures
keyHashPrefix  -- first 8 chars of SHA-256; null for pre-auth failures
authMethod     -- "kv", "legacy", "admin_key"; null for pre-auth failures
cip            -- always present on request-handling events
```

The key insight: `keyName` and `keyHashPrefix` serve different operator needs. `keyName` is for scanning ("which key did this?"), `keyHashPrefix` is for correlation ("find all activity from this specific key across tenants"). Both should be present on all authenticated request events. Currently, capture events have `keyName` but not `keyHashPrefix`, and admin events have `keyHashPrefix` but not `keyName` (though `name` appears in `admin.key_create`).

Admin events should also include `authMethod` (currently always `"admin_key"`, but documenting it explicitly means the schema doesn't break when admin auth evolves to per-tenant keys per the TODO in `admin.js`).

#### 4. `admin.key_list` is the outlier -- normalize it

`admin.key_list` is currently a trace/debug event (severity 6) with `count` and `tenantFilter`. For audit purposes, it matters: an operator reviewing admin activity should see that someone listed all keys for a tenant. But the current payload lacks `authMethod` and `cip`. Without `cip`, the operator can't answer "was this admin action from the same IP as the suspicious capture?"

**Recommendation**: Add `authMethod` and `cip` to `admin.key_list`. Consider elevating severity from 6 (trace) to 3 (info) to match other audit events. Trace-level events may be filtered out by Coralogix alerting/retention rules, creating a silent gap in the audit trail.

#### 5. Security event naming: `security.auth_fail` conflates different failure modes

An operator investigating abuse sees `security.auth_fail` and their immediate question is "was this an attack or a misconfiguration?" Currently, the `reason` field distinguishes them (`key_not_found`, `key_revoked`, `scope_insufficient`, `missing_header`, `invalid_scheme`, `service_not_configured`). This is functional but forces the operator to expand every auth_fail event to understand its nature.

**Recommendation**: Keep `security.auth_fail` as the single event name (don't fragment into `security.auth_fail.revoked`, etc.). The reason field is the right level of detail. However, consider adding a `severity_hint` field or adjusting severity: `key_not_found` (routine probe, severity 4/warn) vs `key_revoked` (active misuse of revoked credentials, severity 5/error) vs `service_not_configured` (operator error, severity 5/error). Currently all auth failures are severity 5, which means Coralogix alerts can't distinguish noise from signal.

Actually, looking at the code more carefully: auth failures on admin routes (index.js:93) are severity 5, and auth failures on tenant routes (index.js:167, 264) are also severity 5. This is correct for a compliance audit trail -- all auth failures should be visible. The differentiation can happen via the `reason` field in queries rather than severity. I retract the severity suggestion. Keep all auth failures at severity 5; the `reason` field is sufficient for filtering.

#### 6. The "compliance report" journey has one structural problem

An operator generating a compliance report for tenant X needs to answer: "list every resource this tenant accessed or created in the reporting period." The current event structure supports this for captures (`capture.queued` has `url` and `captureId`) and for lists (`list.success` has `resultCount`). But key management events (`admin.key_create`, `admin.key_revoke`) are actions *on* a tenant, not *by* a tenant. The operator needs both directions:

- "What did tenant X do?" (tenant-as-actor): `capture.queued`, `list.success`
- "What was done to tenant X?" (tenant-as-subject): `admin.key_create`, `admin.key_revoke`

The current schema handles both because `tenantId` appears in both types. The operator query `tenantId:"acme"` will catch both directions. This is correct and requires no change. Just calling it out because the documentation should make this distinction explicit -- an operator needs to understand they'll see both "acme captured a page" and "admin provisioned a key for acme" in the same query result.

#### 7. Don't add a new `audit` subsystem -- enrich existing events

The metaplan correctly identified that this task is about completeness, not new infrastructure. I want to reinforce this from a UX perspective: creating a separate `audit` subsystem or parallel set of audit events would force operators to query two places for the same information. The existing subsystem structure (capture, security, admin) maps to operator mental models. Enriching these events with consistent fields is better than duplicating them.

### Proposed Tasks

1. **Normalize field presence across all authenticated request events** -- Add `keyHashPrefix` to capture events that currently only have `keyName`. Add `keyName`, `authMethod`, and `cip` to admin events. Add explicit `tenantId: null` to security events where auth failed before tenant identification.

2. **Rename `list.*` events to `capture.list*`** -- Change `list.success` to `capture.list` and `list.error` to `capture.list_fail`. Update the subsystem parameter from `'list'` to `'capture'` in these log calls.

3. **Elevate `admin.key_list` severity from 6 to 3** -- Ensures it's included in the same audit trail as other admin events and isn't filtered by retention rules.

4. **Document the operator query patterns** -- The schema documentation should include copy-pasteable Coralogix queries for the three primary operator jobs:
   - "All actions by tenant X in the last 24h": `tenantId:"acme" AND _timestamp:[NOW-24HOURS TO NOW]`
   - "All activity for a specific key": `keyHashPrefix:"a1b2c3d4"`
   - "All admin operations in the last 7 days": `event:admin.*`
   - "All auth failures from a specific IP": `event:"security.auth_fail" AND cip:"hmac_..."`

5. **Validate the field set with a completeness matrix** -- Create a table (event name x field name) showing which fields are present on each event type. This is both a design artifact and documentation.

### Risks and Concerns

1. **Silent gaps are worse than missing features** -- If `tenantId` is absent from even one event type, operator queries silently drop those events. The operator has no way to know their results are incomplete. This is a "must-be" feature per Kano -- its absence destroys satisfaction. The implementation must guarantee `tenantId` is present (even as `null`) on every audit-relevant event. A test asserting this invariant is warranted.

2. **The `list` subsystem rename is a (small) breaking change** -- Any existing Coralogix saved queries or alerts that filter on `event:"list.success"` will stop matching. Given the project's early stage, this is low risk. But the operator (Ben) should confirm no saved queries depend on the old name. If they do, a transition period (emitting both names) adds complexity for marginal benefit -- I'd recommend the clean break.

3. **Severity 6 (trace) events may be invisible** -- If Coralogix has retention or alerting rules that skip severity 6, `admin.key_list` events disappear from the audit trail. This is a configuration dependency outside the codebase. The recommendation to elevate to severity 3 eliminates this dependency.

4. **Admin auth evolution** -- The TODO in `admin.js` notes that admin auth may move from a single `ADMIN_KEY` to KV-stored per-tenant admin keys. When that happens, admin events will need the same `tenantId`/`keyName`/`keyHashPrefix` fields that tenant events have today. Adding `authMethod: "admin_key"` now means the schema is ready for that transition without breaking queries. Not adding it means a second schema migration later.

5. **Over-logging risk is low but worth naming** -- Every log call is a fire-and-forget `fetch` to Coralogix. Adding 2-3 fields per event increases payload size marginally. Adding new log calls to endpoints that currently don't log (none identified -- all authenticated endpoints already log) would add new fetch calls. The performance impact is negligible for this scope.

### Additional Agents Needed

None beyond those already planned (observability-minion, security-minion, test-minion, software-docs-minion). The recommendations here are strategy-level and don't require additional specialist input. The observability-minion should validate the `list` -> `capture.list` rename from a Coralogix query perspective, and the security-minion should confirm that adding `keyHashPrefix` to capture events doesn't create new information disclosure.
