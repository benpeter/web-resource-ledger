---
layout: layouts/doc.njk
title: Incident Response
description: How WRL detects, assesses, and responds to security incidents.
---

# Incident Response

<div class="callout callout--info">

**Summary:** WRL uses automated monitoring via Coralogix to detect service and security incidents. WRL is operated by a sole proprietor -- there is no 24/7 SOC. Response timelines are best-effort. Affected tenants are notified by email. GDPR breach notifications go to the supervisory authority within 72 hours and to affected customers within 48 hours of a confirmed breach.

</div>

## Detection

WRL monitors production health using nine alert rules in Coralogix. Each alert fires an email notification when its threshold is crossed.

### Service Availability

These alerts indicate the service is unavailable or captures are failing.

| Alert | Priority | What it means |
|-------|----------|---------------|
| `[WRL] Worker Errors (5xx)` | P1 | The Cloudflare Worker is returning HTTP 5xx responses -- the API itself is broken |
| `[WRL] Capture Failures` | P1 | Captures are failing after all retry attempts, indicating a systemic processing issue |

### Security

These alerts indicate authentication anomalies or threat screening problems.

| Alert | Priority | What it means |
|-------|----------|---------------|
| `[WRL] Auth Failure Spike` | P1 | More than 3 auth failures in 15 minutes -- consistent with API key scanning or a misconfigured integration |
| `[WRL] Threat Check API Failures` | P2 | Google Web Risk URL screening is unavailable; captures are proceeding unscreened |
| `[WRL] Threat Check Quarantines` | P3 | More than 5 previously accepted captures quarantined in 24 hours -- may indicate a tenant capturing from a known-bad domain |

### Degraded Service

These alerts indicate a non-core feature is impaired. Captures continue to succeed.

| Alert | Priority | What it means |
|-------|----------|---------------|
| `[WRL] Qualified TSA Failures` | P2 | eIDAS-qualified timestamps are unavailable; captures complete but without the qualified timestamp |
| `[WRL] Email Delivery Failures` | P2 | Outbound notification emails are not being delivered |
| `[WRL] TSA Failures` | P3 | Standard RFC 3161 timestamps are unavailable; captures complete with `tsaStatus: 'error'` |
| `[WRL] Email Bounces` | P3 | Hard bounces on notification emails indicate invalid recipient addresses |

### Data Breach Detection

There is no dedicated alert for data exfiltration or unauthorized data access. WRL's serverless architecture limits traditional breach vectors: there are no SSH-accessible servers, no persistent file system, and all secrets are stored as Cloudflare Worker secrets (not in code or config files). The most likely unauthorized access path is a compromised API key or admin credential.

The operator monitors for anomalous admin API activity in Coralogix logs. Unusual patterns -- unexpected key creation, bulk reads outside normal business hours -- will prompt investigation.

---

## Severity Classification

| Severity | Criteria | Acknowledge within |
|----------|----------|--------------------|
| SEV-1 (Critical) | Service fully unavailable **or** confirmed personal data breach | 30 minutes (best-effort) |
| SEV-2 (High) | Core functionality degraded **or** suspected unauthorized access | 2 hours |
| SEV-3 (Medium) | Non-core service degraded (timestamps, email) **or** elevated security signals | 8 hours |
| SEV-4 (Low) | Informational signals (quarantine spikes, bounce clusters) | Next business day |

"Acknowledge" means the operator has reviewed the alert, assessed severity, and begun investigation. It does not mean resolution.

---

## Containment

Depending on the nature of the incident, the operator can take the following actions:

- **Rollback deployment** -- revert to the previous Worker version if a bad release caused 5xx errors
- **Revoke API keys** -- immediately invalidate a compromised or abused tenant key via the admin API
- **Rotate the signing key** -- generate a new Ed25519 keypair and redeploy; existing signatures remain verifiable via the published key history
- **Block IPs via WAF** -- add Cloudflare WAF rules to block abusive source addresses
- **Disable a tenant** -- prevent a specific tenant from submitting new captures while preserving their existing data
- **Purge caches** -- force Cloudflare to re-fetch assets if stale content is part of the incident
- **Quarantine captures** -- mark specific captures as quarantined, preventing access while investigation is underway

---

## GDPR Notification Timelines

If an incident involves a personal data breach, GDPR notification requirements apply.

| Recipient | Deadline | Basis |
|-----------|----------|-------|
| Supervisory authority (BfDI or state DPA) | Within 72 hours of the operator becoming aware of a confirmed breach | Art. 33 GDPR |
| Affected customers (tenants) | Within 48 hours of confirmed breach | 24-hour buffer before the authority deadline |
| Affected data subjects | Without undue delay, when the breach poses high risk to individuals | Art. 34 GDPR |
| Post-incident report to affected customers | Within 30 days | Best practice |

The 48-hour customer notification target gives the operator time to prepare an accurate notification while leaving a 24-hour buffer before the 72-hour authority deadline.

### Breach Assessment

Not every security event is a notifiable breach. This decision tree guides the assessment:

```
Alert fires or anomaly detected
        |
        v
Is personal data involved?
(account data, session hashes, pseudonymized IPs, capture records)
        |
   No --+--> No notification required. Document and close.
        |
       Yes
        |
        v
Was the data actually accessed or exfiltrated?
(vs. failed attempt, mis-configuration with no access)
        |
   No --+--> No notification required. Document and close.
        |
       Yes
        |
        v
Does the breach pose high risk to affected individuals?
(sensitivity of data, volume, reversibility of harm)
        |
   No --+--> Notify authority (Art. 33). No data subject notification needed.
        |
       Yes
        |
        v
Notify authority (Art. 33) AND affected data subjects (Art. 34).
Notify affected tenants within 48 hours.
```

Data processed by WRL is pseudonymized by design (IP hashes, session hashes) and capture data is attributed to tenant IDs rather than personal identities directly. This limits the risk profile of most breach scenarios, but does not eliminate notification obligations when personal data is confirmed as accessed.

---

## Operational Model

WRL is operated by a sole proprietor (Gerhard Benjamin Peter, Marburg, Germany). There is no 24/7 security operations center, no dedicated on-call rotation, and no team of responders.

**What this means in practice:**

- Detection is automated via Coralogix email alerts. The system does not sleep.
- Human response depends on the operator being available and seeing the alert. Response outside business hours is best-effort.
- Cloudflare's platform provides the first line of defense: Workers restart automatically on crash, queue retries handle transient failures, and Cloudflare's WAF provides baseline DDoS and abuse protection.
- The service is designed for resilience without human intervention in routine failure scenarios.

Response time commitments are targets, not guarantees. For a service at this scale and price point, automated resilience is the primary mechanism -- human intervention handles the cases automation cannot resolve.

---

## Communication

If an incident affects your service or your data, you will be notified by email to the account contact address on your tenant record.

A notification will include:

- What happened and when it was detected
- What data was affected (if any)
- What actions the operator has taken
- What actions you should take (for example, rotating your API keys)
- A timeline for the post-incident report

For GDPR breach notifications, the notification will specify the categories and approximate volume of personal data involved, the likely consequences of the breach, and the measures taken or proposed to address it.

If you believe your account has been compromised and have not received a notification, contact the operator directly at [bp@ben-peter.com](mailto:bp@ben-peter.com).

---

## Post-Incident Review

After a SEV-1 or SEV-2 incident, the operator will produce a post-incident report covering:

- **Timeline** -- when the incident started, when it was detected, when it was contained, when it was resolved
- **Root cause** -- what caused the incident
- **Impact** -- which tenants were affected and what data or functionality was impaired
- **Remediation** -- what was done to resolve the incident
- **Preventive measures** -- what changes will reduce the likelihood or severity of recurrence

For incidents involving personal data, this report is sent to affected tenants within 30 days. For operational incidents with no data impact, it is published in the service changelog.
