# Margo Complexity Review: Content Security Scanning

## Verdict: ADVISE

The plan is well-scoped, proportional to the problem, and demonstrates strong complexity discipline throughout. The YAGNI guardrails are explicit and correct (no auto-un-quarantine, no caching, no cursor-based resume, no parallel re-scan, no UI in this pass). Six tasks for a feature that touches schema, a new external API client, multiple endpoint modifications, a cron handler, observability, and documentation is not inflated -- it is the actual work surface.

Specific positives worth noting:

- The CHECK constraint workaround (flag column + API-layer mapping) is the right call. It avoids a risky table rebuild for a cosmetic schema change.
- Provider-agnostic naming (`threatCheck` not `safeBrowsing`) prevents future rename churn at zero current cost.
- Serial re-scan processing instead of parallel fan-out is the correct simplicity choice for 500 URLs/day.
- Daily cron (15 min CPU) over 6-hourly (30s CPU) is a good resource trade.
- Dynamic import of `rescan.js` in the scheduled handler avoids loading it on every per-minute tick. Clean.

---

### Non-Blocking Concerns

**1. `threat_checks` audit table -- verify it earns its keep**

File: `migrations/0009_threat_check.sql` (proposed)

The audit table (`threat_checks`) stores every check result with `capture_id`, `checked_at`, `verdict`, `threat_types`, `source`. The plan adds an index on `(capture_id, checked_at DESC)`. But no handler, query, or endpoint in the plan reads from this table. The only writes are in `quarantineCapture()` and `recordThreatCheck()`.

This is an audit trail for future forensics -- reasonable for a security feature. But it will grow linearly with captures x re-scan frequency (500 rows/day minimum). Without a consumer, it is write-only storage with no read path.

**Recommendation**: Keep the table (audit trails for security quarantine decisions are justified), but drop the index on `(capture_id, checked_at DESC)` until a query actually needs it. Indexes on write-only tables are pure cost. Add the index when you build the admin review endpoint that reads this data.

**2. Five new DB functions may be one too many**

File: `src/db.js` (proposed additions)

The plan adds: `quarantineCapture`, `recordThreatCheck`, `listCapturesNeedingThreatCheck`, `quarantineCapturesByUrl`, `setCaptureThreatCheck`. That is five new exported functions.

`quarantineCapture` (single capture by ID) and `quarantineCapturesByUrl` (all captures for a URL) are both used -- the first by hypothetical future admin actions, the second by the re-scan cron. But `quarantineCapture` has no caller in this plan. The re-scan uses `quarantineCapturesByUrl` exclusively.

**Recommendation**: Defer `quarantineCapture` (single-capture quarantine) until the admin endpoint or manual unquarantine feature is built. Today, quarantine only happens via re-scan, which always operates on URLs. One fewer function to write, test, and maintain.

**3. `checkUrls` batch function in `threat-check.js` -- verify it is actually called**

File: `src/threat-check.js` (proposed)

Task 2 builds `checkUrls(urls, env, options)` as a batch fan-out wrapper around `checkUrl`. Task 3 says "check against Web Risk using `checkUrls()` for all validated URLs in parallel" for the batch capture endpoint. This is reasonable -- the batch endpoint validates multiple URLs and should screen them in parallel.

However, the re-scan cron (Task 4) processes URLs serially and calls `checkUrl` directly. So `checkUrls` has exactly one call site (batch capture handler).

**Not blocking**: one call site is fine if the function is trivial (it is -- just `Promise.allSettled` over `checkUrl`). But the implementing agent should confirm the batch capture handler actually calls it rather than inlining the same pattern.

**4. Task 3 prompt has a no-op diff**

File: plan section for Task 3, item 4 (`handleGetCapture`)

The prompt shows a before/after diff that is identical:
```
// Before:
if (!record || record.status !== 'complete') {
// After:
if (!record || record.status !== 'complete') {
```

This will confuse the implementing agent. The intent is clearly "keep this gate as-is" but showing it as a before/after change is misleading. Flag for the implementing agent: this is NOT a change, just context.

---

### What I Am NOT Flagging

- **New GCP dependency (Web Risk API key)**: One API key with a single HTTP GET endpoint is minimal operational surface. No SDK, no client library, just `fetch()`. The plan correctly calls out it is optional (graceful degradation). This is proportional.
- **Task count (6)**: Each task maps to a distinct code boundary with clear ownership. No task is padding.
- **Two new runbooks and two new alerts**: Proportional to adding a new security subsystem. The alert thresholds are conservative and justified.
- **Feature scope**: The issue spec was approved by the product owner. Everything in the plan traces to a success criterion in the spec.

---

### Complexity Budget Tally (Managed/Serverless Column)

| Addition | Cost | Justification |
|----------|------|---------------|
| New external dependency (Google Web Risk API) | 1 | Single API key, HTTP GET, no SDK |
| New module (`threat-check.js`) | 1 | Pure function, no state, injectable |
| New module (`rescan.js`) | 1 | Single cron handler, follows existing pattern |
| New DB table (`threat_checks`) | 1 | Audit trail for security decisions |
| Schema columns (5 new on `captures`) | 1 | Flat additions, no structural change |

**Total: 5 points.** Proportional for a security feature that touches pre-capture validation, background re-scanning, artifact access gating, and observability.
