# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. The Quarantine Frame: "Content Restricted" Not "You Did Something Wrong"

The central UX challenge is tone. The tenant submitted a URL in good faith. At capture time, the URL was clean. Days or weeks later, the URL gets flagged by Google Safe Browsing -- meaning the *site they captured* turned malicious after the fact, or Google's classification changed. The tenant did nothing wrong.

**The messaging must communicate three things, in this priority order:**

1. Your capture record (metadata) is safe and still accessible
2. Artifact downloads are temporarily restricted due to a content safety flag
3. This is automated, not a judgment of your behavior

**Avoid:**
- "Violation" / "policy violation" -- implies the tenant broke rules
- "Blocked" / "banned" -- implies punishment
- "Dangerous" / "malicious" -- alarming; the *capture* isn't malicious, the *URL's reputation* changed
- "Quarantined" as a user-facing term -- too clinical/scary; fine for internal API fields

**Preferred vocabulary:**
- "Content restricted" -- neutral, factual
- "Artifact access restricted" -- precise about what changed
- "Flagged by automated safety check" -- attributes correctly
- "URL safety concern" -- names the issue without dramatizing

### 2. API Consumer Experience (JSON Responses)

API consumers are developers building integrations. They need machine-readable status codes and structured data to handle quarantine programmatically. Clarity and consistency with existing patterns matter more than friendliness.

**Capture metadata endpoint (GET /v1/captures/{id}):**

The spec calls for `status: "quarantined"` -- this is fine for the API since developers switch on `status`. But it introduces a fourth status value into a field that currently has three (`pending`, `complete`, `failed`). This is a breaking change for any client that exhaustively matches on status.

**Recommendation:** Keep `status: "complete"` (the capture *did* complete successfully) and add a separate `contentRestriction` object. This is less disruptive and more semantically accurate -- the capture's lifecycle status didn't change, its access was restricted post-hoc.

```
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "contentRestriction": {
    "restricted": true,
    "reason": "url_flagged_safe_browsing",
    "threatTypes": ["MALWARE"],
    "restrictedAt": "2026-03-23T12:00:00Z",
    "detail": "This capture's URL was flagged by an automated safety check. Artifact downloads are restricted. Capture metadata remains accessible."
  },
  "artifacts": { ... }   // URLs still present, but return 451 when fetched
}
```

However -- the spec explicitly says `status: "quarantined"`. If the team strongly prefers that, it can work, but every API client that does `if (status === 'complete')` to decide whether to show artifacts will break silently. The `contentRestriction` approach is additive and backward-compatible.

**Artifact download endpoint (GET /v1/captures/{id}/artifacts/{name}):**

HTTP 451 (Unavailable For Legal Reasons) is the right status code. The response body should follow the existing `application/problem+json` pattern:

```
{
  "type": "about:blank",
  "status": 451,
  "title": "Unavailable For Legal Reasons",
  "detail": "This artifact's URL was flagged by an automated safety check. Download is restricted. Capture metadata is still accessible at GET /v1/captures/{captureId}."
}
```

Key points:
- Use the existing `problemResponse()` helper -- just add `451` to the titles map
- The `detail` field tells the developer what they *can* still do (get metadata)
- Don't expose the specific threat type in the 451 body (it's in the metadata endpoint)

**Pre-capture rejection (POST /v1/captures):**

HTTP 422 with threat type in the detail message, as the spec says. This is different from quarantine -- here the tenant is being warned *before* capture, so more directness is appropriate:

```
{
  "type": "about:blank",
  "status": 422,
  "title": "Unprocessable Content",
  "detail": "URL is flagged as unsafe (MALWARE). Capture not started. See https://safebrowsing.google.com/ for details."
}
```

### 3. Web UI Experience

The UI has three touchpoints: the capture list, the capture detail view, and pre-capture rejection on the submit form.

#### 3a. Capture List View

Currently, captures show badges: "Complete" (green), "Failed" (red), or a pending spinner. A quarantined/restricted capture needs a fourth visual state.

**Recommendation:** Use the existing `--warning` color tokens (amber/yellow). This is the correct semantic signal -- it's not an error (red) and it's not success (green). It's an informational alert that requires awareness but not panic.

- Badge text: "Restricted" (short, fits the badge pattern)
- Badge class: `badge--warning` (new, using `--color-warning` / `--color-warning-bg`)
- In the list, this is enough. The detail view explains why.

#### 3b. Capture Detail View -- Quarantined Capture

This is the most important UX surface. The tenant navigates here after seeing "Restricted" in the list and needs to understand what happened.

**Layout recommendation (follows existing patterns):**

1. **Back link** (existing pattern)
2. **Status banner** -- new `detail-status-banner--restricted` variant using warning colors (`--color-warning-bg`, left border `--color-warning`). Label text: "Status: Content Restricted"
3. **Info alert section** -- an `alert--warning` block (existing design system component) with this text:

   > **Artifact access restricted**
   >
   > This capture's URL was flagged by an automated safety check after the capture was completed. Your capture record and metadata are preserved. Artifact downloads (screenshot, HTML, WACZ) are temporarily unavailable.
   >
   > This flag is based on the URL's reputation, not the content of your capture. If you believe this is incorrect, contact support.

4. **Metadata section** (existing `buildMetadataSection` pattern) -- show all the same fields as a complete capture. Add a "Restricted Since" row showing `contentRestriction.restrictedAt`.
5. **Artifacts section** -- show the artifact list but with each link *disabled* (grayed out, not clickable). This communicates "these exist but you can't download them right now." Don't hide them entirely -- hiding creates confusion ("where did my artifacts go?").
6. **No screenshot preview** -- don't render the `<img>` for a restricted capture. The image fetch would 451 anyway and show a broken image. Showing a placeholder or nothing is better.

**What NOT to show tenants:**
- Specific Google Safe Browsing threat types (MALWARE, SOCIAL_ENGINEERING, UNWANTED_SOFTWARE, etc.) -- these are technical classifications that don't help the tenant and may alarm them unnecessarily. Reserve for admin/internal.
- The fact that it's Google Safe Browsing specifically -- say "automated safety check." Naming the provider invites arguments about false positives that the tenant can't resolve anyway.

#### 3c. Pre-Capture Rejection in Submit Form

When a tenant submits a URL that is currently flagged, the API returns 422. The submit form already handles error responses and displays them in an alert.

**Recommendation:** The existing error display pattern works. The form should show:

> URL cannot be captured -- it was flagged by an automated safety check. If you believe this is incorrect, try again later or contact support.

Don't show the threat type. Don't link to Safe Browsing (the tenant can't do anything there).

### 4. Threat Type Visibility: Tenant vs. Admin

**Tenants should NOT see threat types.** Rationale:

- **Cognitive load:** "MALWARE" and "SOCIAL_ENGINEERING" are technical labels that require domain knowledge to interpret. They don't change what the tenant can do about it (nothing).
- **Alarm:** Seeing "MALWARE" associated with your capture triggers anxiety disproportionate to the situation.
- **False positive anxiety:** If the tenant disagrees with the classification, showing the label gives them something specific to argue about but no path to resolve it.
- **Consistency with scope:** The spec explicitly puts "tenant appeal/unquarantine workflow" out of scope. Without a self-service path, showing details they can't act on creates frustration.

**Admins should see threat types.** In the admin tools (Coralogix logs, internal dashboards), the full `threatTypes` array, scan timestamps, and Safe Browsing response details should be available. This is operational data for investigating alerts and managing false positives.

### 5. Self-Service Path: Not Now, But Design for It

The spec puts appeal/unquarantine out of scope, which is correct for an initial implementation. But the UX should be designed so a self-service path can be added later without restructuring.

**Current recommendation:** Include a "contact support" link in all quarantine-related messages. Use `mailto:bp@ben-peter.com` with a pre-filled subject line: `subject=Content restriction inquiry: {captureId}`. This gives the tenant a path forward and gives the operator structured context.

**Future-ready hooks:**
- The `contentRestriction` object in the API response can later include an `appealUrl` field
- The UI info alert can later swap the "contact support" text for an "Appeal this restriction" button
- No architecture needs to change to support this evolution

### 6. Webhook Consumers

If the re-scan cron quarantines a previously-completed capture, this is a state change that webhook consumers need to know about. The existing webhook pattern dispatches on `capture.complete` and `capture.failed`.

**Recommendation:** Add a `capture.restricted` webhook event that fires when a capture is quarantined by the re-scan. The payload should include the capture metadata and the `contentRestriction` object. This lets API consumers update their own UI/records without polling.

### 7. Graceful Degradation UX

When Safe Browsing API is unavailable, captures proceed with `safeBrowsing: "unavailable"` in metadata. This is correct. The tenant should see NO indication of this -- it's an internal operational detail. The capture completed, artifacts are accessible, everything works normally. The "unavailable" marker is for the operator to monitor via Coralogix, not for tenant consumption.

**Do not:** Show a "safety check skipped" warning in the UI. This would alarm tenants, imply their capture is less trustworthy, and create questions the operator doesn't want to answer.

## Proposed Tasks

1. **Add 451 to `responses.js` titles map** -- single line addition to support `problemResponse(451, ...)`. Extend existing pattern.

2. **Design `contentRestriction` API schema** -- define the object shape in `openapi.yaml`. Add it as optional field on `CaptureDetail` and `CaptureSummary`. Document when it's present (only on restricted captures).

3. **Add `detail-status-banner--restricted` CSS** -- new variant using `--color-warning` tokens. Follows the exact pattern of `--complete`, `--failed`, `--pending`.

4. **Add `badge--warning` to design system** -- new badge variant using `--color-warning` / `--color-warning-bg`. Follows existing `badge--pass` / `badge--fail` pattern.

5. **Build `renderDetailRestricted()` in `ui-detail.js`** -- new render path for quarantined captures. Shows warning banner, info alert, metadata, disabled artifact links, no screenshot preview. Follows existing `renderDetailComplete`/`renderDetailFailed` patterns.

6. **Update `buildCaptureItem()` in `ui-submit.js`** -- handle the restricted state in the list view badge rendering. Show "Restricted" in warning badge.

7. **Update `fetchAndRenderDetail()` routing** -- detect `contentRestriction.restricted` in the response and route to the restricted render path instead of the complete render path.

8. **Handle 422 in submit form** -- the existing error path likely handles this already, but verify the error message text is appropriate for the URL-flagged case.

9. **Update `handleGetCaptureArtifact()` in `index.js`** -- check quarantine status before serving artifacts. Return 451 via `problemResponse()`.

10. **Define `capture.restricted` webhook event** -- for re-scan quarantine notifications to webhook consumers.

## Risks and Concerns

### Risk: Status Field Breaking Change
**Severity: High.** Adding `"quarantined"` to the `status` enum breaks any API client that does exhaustive matching on `pending | complete | failed`. The `contentRestriction` overlay approach avoids this entirely. If the team insists on a `status: "quarantined"` value, this MUST be called out as a breaking API change, documented in a migration guide, and ideally preceded by communicating with existing API consumers.

### Risk: False Positive Friction
**Severity: Medium.** Google Safe Browsing has false positives. A legitimate capture gets restricted, and the tenant has no self-service path to appeal. The "contact support" link mitigates this but creates operator burden. Monitor the false positive rate in the first weeks; if it's high, prioritize the appeal workflow.

### Risk: Alarm Cascading
**Severity: Medium.** If a tenant has many scheduled captures of the same domain and that domain gets flagged, ALL their captures get restricted in one re-scan cycle. The tenant sees dozens of "Restricted" badges at once. This looks like a system-wide problem, not a single-domain issue. Consider: in the info alert on the detail view, name the specific URL that was flagged, so the tenant can see it's the *same* URL across all their restricted captures.

### Risk: Broken Image in Detail View
**Severity: Low but visible.** If the detail view tries to render `<img src="/v1/captures/{id}/artifacts/screenshot">` for a restricted capture, the 451 response will show a broken image icon. The render path MUST skip the screenshot `<img>` tag for restricted captures. This is not a "nice to have" -- broken images are one of the strongest negative UX signals.

### Concern: "Quarantined" Terminology Leakage
The spec uses "quarantined" internally, which is fine for code, database fields, and operator tools. But it MUST NOT appear in tenant-facing text. "Quarantine" implies contamination. Use "restricted" or "content restricted" in all user-facing surfaces (UI labels, API error messages, documentation).

## Additional Agents Needed

- **ux-design-minion** -- to implement the specific CSS for `detail-status-banner--restricted`, `badge--warning`, and the disabled artifact link styling. The strategy is defined here; the visual implementation details (exact colors, disabled link opacity, hover states) need design execution.

- **api-design-minion** -- to finalize the `contentRestriction` schema, the 451 response shape, the 422 rejection shape, and the `capture.restricted` webhook payload. This contribution provides the UX rationale; the API design needs to be formally specified.

- **frontend-minion** -- to implement `renderDetailRestricted()`, the list view badge changes, the submit form 422 handling, and the `fetchAndRenderDetail()` routing update. The patterns are well-established in the existing codebase; this is execution against the strategy defined here.
