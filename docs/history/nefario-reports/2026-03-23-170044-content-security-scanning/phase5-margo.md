# Margo Review: Content Security Scanning (Issue #109)

## Verdict: ADVISE

The implementation is proportional to the problem. Two new source files
(threat-check.js, rescan.js) plus targeted modifications to db.js and index.js.
No new dependencies, no new abstraction layers, no framework additions. The
complexity budget is well within bounds. One functional defect needs fixing; the
remaining items are minor.

---

## Findings

### 1. [BUG] buildWebhookPayload does not handle capture.quarantined event type

**File:** `src/webhook-dispatch.js` lines 95-128
**File:** `src/rescan.js` line 136

`rescan.js` dispatches webhooks with event type `'capture.quarantined'`:

```js
dispatchWebhooks(env, qTenantId, 'capture.quarantined', captureRecord)
```

But `buildWebhookPayload` only has branches for `capture.complete` and
`capture.failed`. The quarantined event will produce a payload missing
`quarantineReason` and `quarantinedAt` -- the two fields that make the event
useful to consumers. The webhook fires but the payload is incomplete.

**Fix:** Add an `else if (eventType === 'capture.quarantined')` branch that
includes `data.quarantineReason` and `data.quarantinedAt` from the capture
record. Also update the JSDoc `@param eventType` to list the three valid values.

**Severity:** Functional defect. Webhook consumers subscribed to
`capture.quarantined` will receive payloads without the quarantine details.

---

### 2. [MINOR] threatTypes passed as array where string expected in quarantineCapturesByUrl

**File:** `src/rescan.js` line 100
**File:** `src/db.js` line 1404 (JSDoc declares `@param {string|null} threatTypes`)

`rescan.js` passes the raw array `threatTypes` (e.g. `['MALWARE', 'SOCIAL_ENGINEERING']`)
to `quarantineCapturesByUrl`'s fourth parameter, which is documented as `string|null`.
D1's `.bind()` calls `.toString()` on the array, producing `"MALWARE,SOCIAL_ENGINEERING"`,
which happens to work. But this is accidental: the type contract is violated, and if
D1's bind behavior ever changes (or someone adds validation), this breaks silently.

**Fix:** Either change the call site to `threatTypes.join(',')` (matching what's
already done for `reason` on line 99), or change the db.js JSDoc to
`string[]|string|null` and add an explicit `.toString()` or `.join(',')` inside
the function. The former is simpler.

---

### 3. [MINOR] rescan.js flaggedCount counts unique URLs, not quarantined captures

**File:** `src/rescan.js` lines 116, 157

`flaggedCount++` increments once per flagged URL, but `quarantineCapturesByUrl`
may quarantine multiple captures sharing that URL. The summary log reports
`flaggedCount` which sounds like "captures quarantined" but actually means
"unique URLs flagged". This is not wrong per se, but operators reading the log
may misinterpret the number.

**Fix:** Either rename to `flaggedUrlCount` for clarity, or sum the actual
quarantined capture count from the return value. The rename is simpler and
avoids scope creep.

---

### 4. [POSITIVE] Complexity assessment

No concerns on the following dimensions:

- **Dependency count:** Zero new dependencies. Google Web Risk is called via
  plain `fetch()`. No SDK, no client library.
- **Abstraction layers:** threat-check.js is a flat module with two exported
  functions. No class hierarchy, no factory pattern, no strategy pattern. Direct
  and readable.
- **Migration:** 0009_threat_check.sql adds five columns and one table. The
  partial index on `(last_threat_check_at) WHERE status='complete' AND quarantined=0`
  is correctly scoped for the rescan query. No over-indexing.
- **Fail-open design:** Correct for a pre-capture check. Missing API key, API
  errors, and timeouts all degrade gracefully without blocking captures. The
  `degraded` flag and `reason` field give operators visibility.
- **YAGNI compliance:** No cursor-based resume in the rescan cron (comment
  explicitly says YAGNI). No auto-un-quarantine. No caching of Web Risk results.
  No second threat intelligence provider abstraction. All good.
- **Cron integration:** Dynamic import (`await import('./rescan.js')`) in the
  scheduled handler keeps rescan code out of the main bundle for non-cron
  invocations. Clean separation.
- **Test coverage:** threat-check.test.js covers clean URLs, threat matches,
  allowlist filtering, fail-open on API errors/timeouts/network failures, missing
  API key, URL encoding, API key header placement, and multi-URL fan-out.
  Injectable `lookup` parameter avoids mocking `fetch` globally. Well-structured.

---

## Summary

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| 1 | buildWebhookPayload missing capture.quarantined branch | Bug | Fix before merge |
| 2 | threatTypes array passed where string expected | Minor | Fix at call site |
| 3 | flaggedCount semantics ambiguous in rescan summary log | Minor | Rename variable |

The implementation is clean, well-documented, and appropriately scoped. Finding
#1 is the only one that affects correctness for consumers. Findings #2 and #3
are quick fixes that prevent future confusion.
