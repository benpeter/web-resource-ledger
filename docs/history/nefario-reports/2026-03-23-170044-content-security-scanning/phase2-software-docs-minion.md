## Domain Plan Contribution: software-docs-minion

### Recommendations

**1. OpenAPI spec changes are the highest-priority doc artifact.** The spec is the single source of truth for API behavior, and these changes are substantial -- a new status value, new error responses, new query filter option, and new fields on existing schemas. The spec drives generated documentation at docs.webresourceledger.com. Get the spec right and the downstream docs follow.

**2. Use 422 for pre-capture rejection, not a new status code.** The existing 422 response on `POST /v1/captures` already covers "URL is structurally valid but semantically rejected" (private IP, double-encoded). Adding a Safe Browsing rejection example under the same 422 is consistent and requires no new response code definition. The `detail` field distinguishes the reason. Same for batch captures -- the per-item error model already supports 422 with a ProblemDetail body.

**3. Use 451 (Unavailable For Legal Reasons) for quarantined artifact access.** This is the correct HTTP status for content that has been restricted. It needs to be added as a new response on `GET /v1/captures/{captureId}` and on each `GET /v1/captures/{captureId}/artifacts/*` endpoint. The 451 should use the existing ProblemDetail schema with a clear detail message.

**4. The "quarantined" status value is a schema-breaking change -- handle carefully.** Currently `CaptureStatus.status` and `CaptureSummary.status` are enum `[pending, complete, failed]`. Adding `quarantined` to these enums affects every client that pattern-matches on status. The spec change itself is mechanical (add the enum value), but the description text must explain: (a) what quarantined means, (b) that metadata is still accessible, (c) that artifact URLs return 451. This is the most important documentation paragraph in the whole feature.

**5. Add `safeBrowsing` field to CaptureRecord and CaptureSummary.** The spec says Safe Browsing API failures should produce `safeBrowsing: "unavailable"` in metadata. This field needs to appear on the capture response schemas with clear enum values: `"ok"` (checked, clean), `"flagged"` (threat detected), `"unavailable"` (API check failed, capture proceeded), and absent/null for captures created before this feature. Include `quarantineReason` as a string field present only when status is "quarantined".

**6. The status filter query parameter on GET /v1/captures already exists.** The list endpoint (line ~1701-1706 in openapi.yaml) has `status` as an enum filter with `[pending, complete, failed]`. Simply add `quarantined` to this enum. No new parameter needed.

**7. Public API documentation should explain quarantine transparently.** Tenants need to understand: (a) why a capture might be rejected (Safe Browsing flagged the URL), (b) why an existing capture might transition to quarantined (background re-scan), (c) what they can and cannot access on a quarantined capture, (d) that Safe Browsing degradation means captures proceed without screening (not that they are blocked). This belongs in the OpenAPI description text on the relevant endpoints and schemas, not in a separate document. The spec is the canonical API reference.

**8. Do NOT explain Safe Browsing implementation details in public docs.** The API docs should say "URLs are checked against threat intelligence databases" and "captures may be quarantined if the URL is later found on a threat list." Do not name Google Safe Browsing specifically in the OpenAPI spec or README -- this is an implementation detail that could change. The operations docs (internal) should name it.

**9. SAFE_BROWSING_API_KEY must be documented in three places.** Following the existing pattern exactly:
- README.md: new setup step (step 9a or similar) with generation instructions and `wrangler secret put`
- OPERATIONS.md: add to the Worker runtime secrets table
- CONTRIBUTING.md: add to the `.dev.vars` template with a comment explaining it is optional (graceful degradation)

**10. New Coralogix alert definition and runbook.** The existing `docs/operations/alerts.md` has four alerts. This feature adds a fifth: `[WRL] Quarantine Spike`. The audit-log-schema.md needs new events for the Safe Browsing subsystem.

### Proposed Tasks

**Task 1: OpenAPI spec -- new schemas and fields** (must complete first, other docs depend on it)
- Add `quarantined` to `CaptureStatus.status` enum and `CaptureSummary.status` enum
- Add `safeBrowsing` field to `CaptureRecord` schema (enum: `ok`, `flagged`, `unavailable`; nullable for backward compat)
- Add `safeBrowsing` field to `CaptureSummary` schema (same type)
- Add `quarantineReason` string field to `CaptureRecord` (present only when quarantined)
- Add `quarantineReason` string field to `CaptureSummary` (present only when quarantined)
- Add `quarantinedAt` datetime field to both schemas (present only when quarantined)
- Update description text on `CaptureRecord` and `CaptureSummary` to explain the quarantined state
- Bump API version (currently 0.7.0)

**Task 2: OpenAPI spec -- new error responses**
- Add Safe Browsing rejection example under existing 422 response on `POST /v1/captures` (e.g., `{type: about:blank, status: 422, title: Unprocessable Content, detail: "URL flagged as malicious (SOCIAL_ENGINEERING). Capture rejected."}`)
- Add same example under batch capture per-item 422 in `BatchCaptureItemError`
- Add 451 response to `GET /v1/captures/{captureId}` for quarantined captures
- Add 451 response to each artifact endpoint (`GET /v1/captures/{captureId}/artifacts/{type}`)
- Add 451 response to `GET /v1/captures/{captureId}/artifacts/wacz`
- Include real example 451 response body with ProblemDetail

**Task 3: OpenAPI spec -- status filter update**
- Add `quarantined` to the `status` query parameter enum on `GET /v1/captures`
- Update description to mention quarantined as a filterable state

**Task 4: README.md -- new setup step for SAFE_BROWSING_API_KEY**
- Add step 9a (or appropriate number) following the pattern of existing secret setup steps
- Include: purpose, how to obtain (Google Cloud Console), `wrangler secret put`, `.dev.vars` template
- Add note that the key is optional -- captures proceed without it but lack URL screening
- Reference the Content Moderation Policy (already linked in Legal section)

**Task 5: CONTRIBUTING.md -- update .dev.vars template**
- Add `SAFE_BROWSING_API_KEY` to the `.dev.vars` template with a comment: `# Optional -- URL threat screening; omit for graceful degradation (captures proceed unscreened)`

**Task 6: OPERATIONS.md -- update secret surfaces table**
- Add `SAFE_BROWSING_API_KEY` to the Worker runtime secrets table with: Purpose = "Google Safe Browsing API key for URL screening", Required? = "No -- captures proceed without screening"

**Task 7: Audit log schema -- new events**
- Add new events to `docs/audit-log-schema.md`:
  - `security.safebrowsing_reject` (severity 5, error) -- URL rejected pre-capture
  - `security.safebrowsing_quarantine` (severity 4, warn) -- existing capture quarantined by re-scan
  - `security.safebrowsing_fail` (severity 4, warn) -- Safe Browsing API call failed, capture proceeded
  - `security.safebrowsing_scan` (severity 6, verbose) -- background re-scan batch completed
- Add new audit fields: `threatType` (string), `safeBrowsingStatus` (string)
- Add example Coralogix queries for quarantine investigation

**Task 8: Coralogix alerts -- new alert definition**
- Add `[WRL] Quarantine Spike` alert to `docs/operations/alerts.md`:
  - Query: `event:"security.safebrowsing_quarantine"` (app: wrl, subsystem: security)
  - Threshold: > 5 events in 24 hours (per the spec)
  - Priority: P2 (Medium) -- requires investigation but not immediately actionable
  - Rationale: multiple quarantines in a day could indicate: a tenant submitting known-bad URLs (abuse), a Safe Browsing list update flagging legitimate URLs (false positives), or the re-scan job working correctly on a backlog
- Update `scripts/provision-alerts.sh` to include the new alert definition

**Task 9: New runbook -- quarantine investigation**
- Create `docs/operations/runbooks/quarantine-spike.md` following the exact structure of existing runbooks
- Sections: What fires this, Check (Coralogix query), Likely causes, Fix, False positive?
- Likely causes: tenant abuse (submitting known-malicious URLs), Safe Browsing false positive (legitimate URL added to threat list), re-scan catching old captures
- Fix steps: query affected captures, check if URLs are actually malicious (manual verification), contact tenant if abuse, consider unquarantine if false positive
- Include Coralogix queries for correlating quarantine events with tenant and URL

**Task 10: CONTENT-POLICY.md -- reference Safe Browsing screening**
- Add a brief section explaining that WRL performs automated URL screening against threat intelligence databases
- Note that captures of URLs on threat lists are quarantined (not deleted)
- Note that artifact access is restricted for quarantined captures
- Keep it general (no Google Safe Browsing name) since this is a public-facing policy doc

### Risks and Concerns

**Risk 1: Status enum change is a breaking contract change.** Adding `quarantined` to the status enum means any client that does `if status === 'complete'` or switches on the three known values will encounter an unexpected value. The OpenAPI spec change should be accompanied by a clear migration note. Consider whether this warrants a minor version bump (0.7.0 -> 0.8.0) or a major change. Recommendation: minor bump with changelog note, since "quarantined" is a new terminal state and clients should already handle unknown values gracefully per RFC 9457.

**Risk 2: 451 status code has legal connotations.** HTTP 451 is defined as "Unavailable For Legal Reasons" (RFC 7725). Using it for Safe Browsing quarantine is defensible -- the content is restricted because it appears on a threat list, which is a legal/safety reason. But the spec description should be precise: "Content restricted due to URL appearing on a threat intelligence list" not "legally unavailable." A `Link` header pointing to the CONTENT-POLICY.md (as RFC 7725 recommends for identifying the blocking authority) would be a nice touch.

**Risk 3: "safeBrowsing: unavailable" in metadata exposes degradation to tenants.** This is intentional per the spec (graceful degradation should not be silent), but the API docs need to explain clearly what "unavailable" means: "the URL was not screened because the threat intelligence service was unreachable. The capture proceeded. This does not indicate the URL is safe or unsafe." Without this explanation, tenants may interpret "unavailable" as "broken."

**Risk 4: Operations docs need to be ready before feature ships.** The runbook and alert definition must exist before the Coralogix alert is provisioned. If the alert fires before the runbook exists, the operator has no investigation playbook. Sequence: docs first, then implementation, then alert provisioning.

**Risk 5: Naming consistency.** The spec uses `safeBrowsing` as a field name. If we later switch away from Google Safe Browsing (e.g., to a different threat intelligence provider), this field name becomes misleading. Consider using `threatCheck` or `urlScreening` as the field name instead of `safeBrowsing`. The internal implementation can reference Google Safe Browsing; the API surface should be provider-agnostic. **Strong recommendation: use `threatCheck` in the API, `safeBrowsing` only in operations/internal docs.**

### Additional Agents Needed

- **backend-cloudflare-minion**: Implements the actual Safe Browsing client, pre-capture check, quarantine logic, D1 migrations for the quarantined status and related fields, Cron Trigger re-scan job, and 451 response handling. The OpenAPI spec changes I define here are the contract they implement against.
- **api-design-minion**: Should review the status enum extension, the 451 response semantics, and the `threatCheck`/`safeBrowsing` naming decision before the spec is finalized. The naming question (Risk 5) is an API design decision, not a documentation decision.
- **testing-minion**: Needs to write tests for: 422 rejection of flagged URLs, 451 on quarantined artifact access, status filter with quarantined value, graceful degradation when Safe Browsing API is down.
