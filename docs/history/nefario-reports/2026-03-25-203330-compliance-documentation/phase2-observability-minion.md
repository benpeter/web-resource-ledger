# Domain Plan Contribution: observability-minion

## Incident Response Procedure for WRL Compliance

### Recommendations

#### 1. Detection Layer -- Mapping Alerts to Incident Categories

WRL has nine Coralogix alerts already deployed. For the incident response procedure, these alerts map to three incident categories that compliance cares about:

**Service Availability Incidents**
- `[WRL] Worker Errors (5xx)` -- P1, >2 events/5min
- `[WRL] Capture Failures` -- P1, >3 events/5min
- These represent core service degradation. Customer-facing impact.

**Security Incidents**
- `[WRL] Auth Failure Spike` -- P1, >3 events/15min
- `[WRL] Threat Check Quarantines` -- P3, >5 events/24h
- `[WRL] Threat Check API Failures` -- P2, >2 events/10min
- Auth spikes may indicate credential stuffing or key compromise. Quarantines may indicate abuse or data contamination.

**Degraded Service Incidents**
- `[WRL] TSA Failures` -- P3
- `[WRL] Qualified TSA Failures` -- P2
- `[WRL] Email Delivery Failures` -- P2
- `[WRL] Email Bounces` -- P3
- These degrade functionality (timestamps, notifications) without losing data.

**Gap: No data breach detection alert exists.** The existing alerts cover operational failures and security probes, but there is no alert specifically for unauthorized data access. WRL's architecture (serverless, no SSH, secrets in Wrangler) makes traditional breach vectors unlikely, but the procedure should acknowledge this gap and describe how breach indicators would surface (unusual Cloudflare dashboard activity, unexpected KV/R2 access patterns, Coralogix queries for anomalous `admin.*` events).

#### 2. Assessment -- Severity Classification

The procedure should define four severity levels that map directly to the existing alert priorities and compliance obligations:

| Severity | Criteria | GDPR Relevance | Response Window |
|----------|----------|----------------|-----------------|
| SEV-1 (Critical) | Service fully unavailable OR confirmed personal data breach | Art. 33/34 notification may apply | Acknowledge within 30 min |
| SEV-2 (High) | Core functionality degraded (captures failing across tenants) OR suspected unauthorized access | Possible notifiable breach | Acknowledge within 2 hours |
| SEV-3 (Medium) | Non-core degradation (TSA down, emails failing) OR elevated security signals | Unlikely notifiable; document anyway | Acknowledge within 8 hours |
| SEV-4 (Low) | Informational (quarantine spikes, bounce clusters) | Not notifiable | Next business day |

**Sole-proprietor realism:** There is one operator. "Acknowledge within 30 min" means the email alert was seen and triage started, not that a war room is staffed. The procedure must be honest that SEV-1 response is best-effort during sleep hours, with Cloudflare's platform resilience (auto-restart, queue retries) providing the first line of defense.

#### 3. Containment Actions -- What the Operator Can Actually Do

Based on the runbooks and infrastructure, these are the real containment actions available:

| Action | How | When |
|--------|-----|------|
| **Rollback deployment** | `wrangler rollback` or trigger Deploy to Production workflow with last-good SHA | Post-deploy regressions |
| **Revoke API key** | Admin API: `DELETE /v1/admin/keys/:tenantId/:keyHash` | Compromised or abused key |
| **Rotate signing key** | `scripts/generate-signing-key.js` + `wrangler secret put` + cache purge | Key compromise |
| **Block IP via WAF** | Cloudflare WAF rule in dashboard | Active attack |
| **Disable tenant** | Revoke all tenant API keys | Tenant abuse |
| **Purge cached data** | `POST /v1/admin/cache/purge` | Stale/compromised cached responses |
| **Quarantine captures** | Already automatic via daily rescan; manual via D1 update | Malicious content in stored captures |

**Gap: No "kill switch" to halt all capture processing.** If a breach is in progress via the capture pipeline, the operator would need to either revoke all API keys or deploy a code change. Consider documenting a "pause processing" procedure (e.g., set queue consumer `max_concurrency` to 0 via wrangler, or deploy a maintenance-mode flag in KV). This does not need to be built now -- just documented as "in a critical breach, here is the manual workaround."

#### 4. Notification Timelines -- GDPR Art. 33 and Art. 34

The procedure must include concrete timelines for two notification paths:

**Supervisory Authority (Art. 33):**
- 72 hours from becoming "aware" of a personal data breach
- "Aware" = operator has reasonable certainty a breach occurred, not just a suspicion
- WRL's controller is in Germany -> Hessischer Beauftragter fur Datenschutz und Informationsfreiheit (HBDI) is the relevant authority
- The procedure should include the HBDI contact details and online notification form URL

**Affected Data Subjects / Customers (Art. 34):**
- Required when the breach is "likely to result in a high risk to the rights and freedoms" of individuals
- For WRL: captured web page content, tenant account data (GitHub user ID, username), hashed IPs
- Realistically, most WRL breach scenarios involve service disruption, not personal data exposure -- the personal data surface is small (no emails stored, no passwords, GitHub OAuth tokens are ephemeral)
- The procedure should include a decision tree: "Does the breach involve personal data? -> Was personal data actually accessed/exfiltrated? -> Does it pose high risk to individuals?"

**Sole-proprietor realism:** The "72 hours" clock is the hard constraint. The procedure should include a template that can be filled in within 15 minutes, not a 5-page report. The supervisory authority accepts initial notifications with incomplete information, followed by supplementary details.

#### 5. Communication Templates Needed

**Template 1: Supervisory Authority Initial Notification (Art. 33)**
- Nature of the breach (categories of data, approximate number of records, approximate number of data subjects)
- Name and contact of the data protection officer (or controller -- Ben, in this case)
- Likely consequences
- Measures taken or proposed
- Should be structured as a form that maps to the HBDI online submission fields

**Template 2: Customer/Tenant Notification**
- What happened (plain language, not legalese)
- What data was affected
- What the operator has done
- What the customer should do (rotate API keys, review capture integrity)
- Contact information for questions
- Should be an email template, since WRL already has email delivery infrastructure (Resend)

**Template 3: Service Incident Communication (non-breach)**
- For availability/degradation incidents that do not involve personal data
- Status update format: current state, impact, ETA, what we are doing
- Can be posted to a status page or sent via email
- Less formal than the GDPR templates

**Template 4: Post-Incident Report**
- Timeline of events (detection, assessment, containment, resolution)
- Root cause
- Impact (duration, affected tenants, data affected)
- Remediation actions taken
- Preventive measures planned
- Required for both internal records and, if applicable, supplementary Art. 33 notification

#### 6. Gaps Between Current State and Compliance Requirements

| Gap | Severity | Recommendation |
|-----|----------|----------------|
| No documented incident response procedure | High | This is what we are building |
| No data breach detection alert | Medium | Add Coralogix query for anomalous admin API usage patterns; document manual indicators |
| No status page for customer communication | Low | Consider a simple static status page on Cloudflare Pages; not required for compliance but improves trust |
| No formal incident log/register | Medium | GDPR Art. 33(5) requires documenting all breaches regardless of notification. A simple markdown file or D1 table suffices |
| No "pause processing" emergency procedure | Medium | Document the manual workaround (revoke keys / zero concurrency) |
| Alert notification is email-only | Low | Email to a sole proprietor is fine; consider adding a mobile push channel (Pushover, PagerDuty free tier) for SEV-1 to improve response time during off-hours |
| No Coralogix dashboard for incident investigation | Low | Build a single "Incident Investigation" dashboard with key queries pre-loaded (auth failures by cip, capture failures by URL, 5xx by path) |
| 60-min alert suppression may delay breach awareness | Medium | For the Auth Failure Spike alert specifically, consider reducing retriggering to 15 minutes -- sustained auth probing at scale could indicate a breach in progress |

### Proposed Tasks

**Task 1: Write the Incident Response Procedure document**
- Deliverable: `docs/compliance/incident-response.md`
- Content: Detection (alert-to-category mapping), severity classification, containment actions, notification timelines, escalation (N/A for sole proprietor -- but document what happens if operator is unavailable), post-incident review process
- Must reference actual alert names and runbook paths, not generic placeholders
- Include the sole-proprietor operational model explicitly -- reviewers need to see that the operator acknowledges the single-person constraint

**Task 2: Write GDPR notification templates**
- Deliverable: `docs/compliance/templates/supervisory-authority-notification.md`
- Deliverable: `docs/compliance/templates/customer-breach-notification.md`
- Deliverable: `docs/compliance/templates/service-incident-notification.md`
- Deliverable: `docs/compliance/templates/post-incident-report.md`
- Templates should have fill-in-the-blank fields with inline guidance
- Supervisory authority template must map to HBDI online form structure

**Task 3: Create incident register template**
- Deliverable: `docs/compliance/incident-register.md`
- GDPR Art. 33(5) requires maintaining a register of all personal data breaches
- Simple markdown table with columns: date, description, data categories affected, severity, notified authority (Y/N), notified subjects (Y/N), remediation, status
- Starts empty -- this is the template

**Task 4: Document the breach assessment decision tree**
- Deliverable: Section within the incident response procedure (Task 1)
- Flowchart logic: Alert fires -> Is personal data involved? -> Was it accessed/exfiltrated? -> High risk to individuals? -> Notification required?
- Maps WRL's specific data categories (GitHub user IDs, hashed IPs, captured URLs, capture artifacts) to GDPR breach criteria
- Most WRL incidents will exit the tree early ("no personal data involved")

**Task 5 (observability-specific): Add anomalous admin activity monitoring**
- Deliverable: New Coralogix alert definition in `docs/operations/alerts.md` and `scripts/provision-alerts.sh`
- Alert on admin API calls from unexpected patterns (e.g., admin.key_create or admin.key_revoke outside of a recognized operator session)
- This partially closes the "no breach detection alert" gap
- P2 priority, low threshold (any unexpected admin activity is suspicious)

### Risks and Concerns

**Risk 1: Sole-proprietor response time.**
The 72-hour GDPR notification window is forgiving, but detection-to-awareness could be slow if the operator is asleep, traveling, or otherwise unavailable. Email alerts to a single inbox are the weakest link. Mitigation: add a secondary notification channel (mobile push) for P1 alerts, and consider nominating a trusted backup contact who can at least acknowledge and assess.

**Risk 2: Over-engineering the procedure.**
This is a one-person SaaS with a small personal data surface. The procedure must be proportionate. A 30-page incident response plan that requires a "war room" and "incident commander rotation" is fiction. Keep it honest and executable. A sole proprietor checking Coralogix on their phone and filling in a 1-page template within 72 hours IS a valid incident response procedure if it is documented and followed.

**Risk 3: Template compliance.**
The GDPR notification templates should map to actual supervisory authority requirements, not generic "best practice" templates from compliance vendors. The HBDI has a specific online form with specific fields. The template should mirror those fields so the operator can copy-paste rather than translate between formats. The security-minion should verify the HBDI form structure.

**Risk 4: Incident register maintenance.**
Art. 33(5) requires documenting all breaches, not just notifiable ones. If the register is a markdown file, the operator must remember to update it. Consider whether a more structured approach (GitHub issue with a specific label, or a D1 table) would be more reliably maintained than a file that requires manual editing.

**Risk 5: Personal data scope creep.**
WRL's current personal data footprint is small: GitHub user ID, username, hashed IPs. If email addresses are added (they are currently not stored per the privacy policy), or if capture content is deemed to contain personal data of third parties (captured pages may contain names, emails visible on the page), the breach assessment calculus changes. The procedure should acknowledge that captured web page content *may* contain third-party personal data and factor this into the decision tree.

### Additional Agents Needed

- **security-minion**: Should review the breach assessment decision tree and validate GDPR Art. 33/34 notification criteria against WRL's actual data categories. Should also verify the HBDI (Hessische Datenschutzbehorde) online notification form structure so the template aligns with it. The security minion has better context on what constitutes "personal data" under GDPR for the edge cases (e.g., is a hashed IP still personal data? Is captured web page content personal data of the page owner or visitors?).
