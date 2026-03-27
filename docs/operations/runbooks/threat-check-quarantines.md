---
alert: "[WRL] Threat Check Quarantines"
events:
  - threatcheck.quarantine
priority: P3
---

# Runbook: [WRL] Threat Check Quarantines

## What fires this

More than 5 `threatcheck.quarantine` events in a 24-hour window. The daily
re-scan found existing captures whose URLs are now listed by the Google Web
Risk API as threats, and those captures have been quarantined.

This is a P3 alert. Quarantined captures are already isolated — no user-facing
request is blocked or degraded at fire time. This alert is an audit signal,
not an outage.

## Check

Query Coralogix:

```
event:"threatcheck.quarantine" AND applicationName:"wrl"
```

Look at:
- `captureId` — which captures were quarantined
- `tenantId` — are quarantines concentrated in one tenant?
- `url` — are URLs from a common domain or pattern?
- `threatTypes` — what threat categories the Web Risk API returned
- Timing — did all quarantines happen in one re-scan batch or spread across
  the day?

To see the re-scan batch summary that produced the quarantines:

```
event:"threatcheck.rescan_tick" AND applicationName:"wrl"
```

Look at `flaggedCount`, `scannedCount`, and `skippedCount` in the tick event
to understand the scale of the batch.

## Likely causes

**Legitimate threat escalation.** A domain that was safe at capture time was
later added to the Web Risk threat feeds. This is the expected case. The
quarantine is correct behaviour.

**Threat feed false positive cluster.** The Web Risk API occasionally adds
benign domains to threat lists temporarily. If quarantined URLs are from
well-known legitimate sites (major news outlets, CDNs, etc.), this is likely
a false positive batch.

**Tenant capturing from known-bad domains.** A tenant's capture patterns
overlap significantly with the threat feeds — common domains they target are
legitimately flagged. Warrants a conversation with the tenant.

**Systematic abuse.** A tenant is deliberately capturing threat-listed URLs.
Rare but possible. Check if the `tenantId` is consistent and the URLs are
unambiguously malicious.

## Fix

1. **Review the quarantined URLs.** Are they from domains you recognise?
   Obvious malware/phishing domains confirm the quarantine is correct.
   Known-legitimate domains suggest a false positive.

2. **Check Web Risk directly** for a sample URL:

   ```
   curl "https://webrisk.googleapis.com/v1/uris:search?key=API_KEY&uri=URL&threatTypes=MALWARE&threatTypes=SOCIAL_ENGINEERING"
   ```

   If Web Risk returns no threat types for a URL that was quarantined,
   the threat feed may have already been corrected.

3. **If false positives confirmed:** Unquarantine the affected captures via
   the admin API and document the incident. No code change is needed.

4. **If tenant abuse suspected:** Review the tenant's capture history and
   consider revoking their API key pending investigation.

5. **If volume is unexpectedly high (dozens per day):** Check the re-scan
   batch logs to see if `skippedCount` is zero — a skip bug could cause
   re-scanning captures that should be excluded.

## False positive?

Possible if the Web Risk API has a temporary false positive batch for a
popular domain. Check the `url` field across quarantined captures — if all
flagged URLs share a well-known legitimate hostname, treat as a false positive
and monitor for resolution. The alert will auto-resolve once the re-scan
passes a day without exceeding the threshold.
