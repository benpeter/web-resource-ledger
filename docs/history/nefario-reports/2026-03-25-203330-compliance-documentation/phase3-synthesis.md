# Phase 3: Synthesis -- Compliance Documentation

## Delegation Plan

**Team name**: compliance-docs
**Description**: Create enterprise compliance documentation for WRL: security whitepaper, DPA template, subprocessor list, incident response procedure, data retention/deletion policy, privacy policy fix, docs site navigation update, and landing site trust page.

---

### Task 1: Subprocessor List
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Write the WRL subprocessor list as a docs site page.

    ## What to do

    Create `site/content/security/subprocessors.md` with Eleventy frontmatter (layout: doc.njk, title, description, order: 504).

    List every third-party service that processes data on behalf of WRL or its customers. For each subprocessor, include: entity name, purpose, data categories processed, data location, transfer mechanism (EU-US DPF, SCCs, or "no personal data transferred"), and a link to the provider's own DPA/privacy policy.

    The complete subprocessor list (verified from the codebase):

    | Entity | Purpose | Data Processed | Location |
    |--------|---------|---------------|----------|
    | Cloudflare (Workers, D1, R2, KV, Browser Rendering, Queues) | Infrastructure, compute, storage, CDN | All service data | Global (nearest PoP) |
    | GitHub | OAuth authentication | GitHub user ID, username, email (via `read:user user:email` scope) | USA |
    | Stripe | Payment processing | Customer ID, payment methods, invoices, meter events | USA |
    | DigiCert | RFC 3161 timestamping (standard) | SHA-256 hash of WACZ bundle (no personal data) | USA |
    | Sectigo | RFC 3161 timestamping (eIDAS qualified) | SHA-256 hash of WACZ bundle (no personal data) | USA |
    | Coralogix | Operational logging & alerting | Pseudonymized IPs (HMAC-SHA-256), tenant IDs, event metadata | EU (EU2 region) |
    | Resend | Transactional email delivery | Recipient email addresses, email content | USA |
    | Google (Web Risk API) | URL threat screening | URLs submitted for capture (may contain PII in query strings) | USA |

    Include:
    - "Last updated: [date]" at the top
    - A brief note explaining how customers are notified of subprocessor changes (email notification to account contact, with 30 days advance notice for new subprocessors)
    - The transfer mechanism for each (Cloudflare: EU-US DPF + SCCs; GitHub: EU-US DPF + SCCs; Stripe: EU-US DPF + SCCs; DigiCert/Sectigo: no personal data; Coralogix: EU processing; Resend: SCCs; Google: EU-US DPF + SCCs)
    - A TL;DR summary box at the top (3-4 sentences)

    ## What NOT to do

    - Do not duplicate content from the privacy policy. This is the authoritative, detailed version. The privacy policy links here.
    - Do not add aspirational subprocessors. Only list services currently integrated in the codebase.
    - Do not create any landing site pages -- that is a separate task.

    ## Context

    The existing privacy policy at `landing/public/privacy.html` has a "Third-Party Processors" table that is incomplete (missing Resend, Google Web Risk, and Sectigo as separate entities). This new page is the canonical source; the privacy policy will be updated to reference it.

    Read `landing/public/privacy.html` for the current processor table as a starting point. Read `src/oauth.js` (line ~129 for scope), `src/threat-check.js` (Google Web Risk), `src/rfc3161.js` (DigiCert + Sectigo), and `wrangler.toml` for bindings.

    Follow the content style of existing docs pages (see `site/content/authentication.md` for tone and format). Use the same Eleventy frontmatter pattern.

    ## Available Skills
    - ops-runbook: `.claude/skills/ops-runbook/SKILL.md` (WRL operational procedures reference)

- **Deliverables**: `site/content/security/subprocessors.md`
- **Success criteria**: All 8 subprocessors listed with complete columns; transfer mechanisms specified; TL;DR box present; frontmatter correct for Eleventy rendering

---

### Task 2: Data Retention and Deletion Policy
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Write the WRL data retention and deletion policy as a docs site page.

    ## What to do

    Create `site/content/security/data-retention.md` with Eleventy frontmatter (layout: doc.njk, title, description, order: 505).

    The document covers two areas: (1) how long WRL retains each category of data, and (2) how data is deleted when a tenant offboards.

    ### Retention Periods (verified from codebase and data-minion analysis)

    | Data Category | Storage | Retention | Rationale |
    |---------------|---------|-----------|-----------|
    | Tenant record | D1 `tenants` | Until deletion request + 30-day grace | Core identity, billing |
    | Capture metadata | D1 `captures` | Indefinite while tenant active; 30 days post-deletion | Archival is the product's purpose |
    | Capture artifacts (screenshots, HTML, headers, WACZ) | R2 `wrl-captures` | Same as capture metadata | Part of the capture record |
    | API keys | D1 `api_keys` | Until revoked or tenant deletion | SHA-256 hashes only |
    | Usage counters | D1 `usage_counters` | Current + 12 prior billing periods | Billing dispute resolution |
    | Sessions | D1 `sessions` | 7 days (TTL via `expires_at`) | Short-lived auth state |
    | GitHub identity | D1 `github_users` | Until tenant deletion | OAuth identity |
    | Schedules | D1 `schedules` | Until deleted by tenant or offboarding | Active config |
    | Webhooks | D1 `webhooks` | Until deleted by tenant or offboarding | Active config |
    | Notification preferences | D1 `notification_preferences` | Until tenant deletion | Includes email address |
    | Quarantined captures | R2 + D1 | 90 days, then purged | Threat-flagged content |
    | Rate limit counters | KV | Auto-expire (60-120s TTL) | Ephemeral |
    | OAuth state | KV | Auto-expire (600s TTL) | Ephemeral |
    | Operational logs | Coralogix (EU2) | 90 days | Pseudonymized, no raw PII |

    ### Deletion Procedure

    Document the tenant deletion process in customer-facing language (what happens, not how it is implemented):

    1. Tenant requests deletion (via dashboard or support)
    2. Account immediately blocked -- no new captures, schedules paused
    3. 30-day grace period -- tenant can cancel, existing data remains accessible for export
    4. After grace period: all capture artifacts deleted from storage, all metadata removed from database, all sessions and API keys invalidated
    5. External systems: Stripe subscription cancelled and customer record deleted; Coralogix logs expire naturally within 90 days (pseudonymized, cannot be attributed post-deletion)
    6. Deletion is irreversible after the grace period

    Put technical implementation details (FK ordering, R2 key resolution, WACZ content-addressing edge case) in `<details>` blocks for infosec reviewers.

    Include a TL;DR summary box at the top.

    ## What NOT to do

    - Do not propose code changes (schema migrations, new endpoints, cron jobs). This is documentation of the intended policy. Implementation tasks are out of scope for this effort (see issue #117 scope: "All documents, no code changes").
    - Do not duplicate the privacy policy retention table verbatim. Cross-link to it instead.
    - Do not promise automated deletion features that do not exist yet. Be honest: "The deletion procedure is currently operator-initiated. Automated self-service deletion is planned."

    ## Context

    Read `landing/public/privacy.html` for the existing retention table. Read `src/db.js` for the D1 schema and existing delete functions (`deleteExpiredSessions`, `deleteNotificationPreferences`). Read `wrangler.toml` for storage bindings. Read the data-minion's contribution for the complete storage inventory.

    The data-minion identified that R2 keys use `captures/{captureId}/...` (not tenant-prefixed) and WACZ bundles are content-addressed. These are relevant technical details for the `<details>` blocks but should not alarm the reader -- frame them as implementation details of the deletion procedure.

    Follow the content style of existing docs pages. Eleventy frontmatter pattern.

    ## Available Skills
    - ops-runbook: `.claude/skills/ops-runbook/SKILL.md` (WRL operational procedures reference)

- **Deliverables**: `site/content/security/data-retention.md`
- **Success criteria**: All data categories covered with retention periods; deletion procedure documented in customer-facing language; technical details in `<details>` blocks; TL;DR box present

---

### Task 3: Security Whitepaper
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The security whitepaper defines WRL's trust model and security narrative. All other compliance docs (DPA, incident response) reference claims made here. Inaccuracies propagate to the entire compliance surface. Hard to reverse once published and shared with enterprise prospects.
- **Gate rationale**: |
    Chosen: Single comprehensive whitepaper at `site/content/security/whitepaper.md` with Mermaid diagrams (C4 Context + custom data flow), structured to map to SIG Lite/CAIQ/VSA questionnaires, with explicit residual risks section
    Over: (1) Splitting into separate architecture/security/compliance pages (rejected: creates cross-referencing burden, enterprise reviewers want one document to attach to assessments); (2) ASCII diagrams (rejected: too dense for 6 storage bindings + 6 external services, CLAUDE.md prefers Mermaid for complex diagrams)
    Why: Enterprise procurement teams need a single, self-contained document they can attach to vendor assessment forms. The 13-section structure maps directly to common security questionnaires, reducing back-and-forth.
- **Prompt**: |
    Write the WRL Security Whitepaper as a docs site page.

    ## What to do

    Create `site/content/security/whitepaper.md` with Eleventy frontmatter (layout: doc.njk, title: "Security Whitepaper", description, order: 501).

    This is the flagship compliance document. Enterprise security reviewers will use it to evaluate WRL as a vendor. Every claim must be verifiable against the codebase. No aspirational statements.

    ### Structure (13 sections)

    1. **Executive Summary** (1 page equivalent). What WRL is, how it secures data, key differentiators (Ed25519 signing, RFC 3161 timestamps, IP pseudonymization).

    2. **Architecture Overview**. Include a Mermaid C4 Context diagram showing: WRL system, API Consumer (tenant), Browser Extension User, and all external systems (GitHub, DigiCert, Sectigo, Google Web Risk, Stripe, Coralogix, Resend). Use `C4Context` Mermaid syntax. If C4Context rendering is unreliable, use a `flowchart` with subgraphs.

    3. **Data Classification and Handling**. Two categories: personal data (IP addresses, GitHub identity, email, session IDs) and operational data (URLs, artifacts, signatures, logs). Include a Mermaid personal data flow diagram showing entry points, transformations (HMAC pseudonymization, SHA-256 hashing, token discard), and storage locations. Use red/orange styling for PII entry, green for pseudonymization/discard.

    4. **Authentication and Access Control**. Three auth methods (API key, GitHub OAuth PKCE, admin key). Scope model (capture, read, admin). Session security (__Host- prefix, HMAC-signed, 7-day expiry). Rate limiting (6 distinct limiters). Include a Mermaid sequence diagram for OAuth PKCE flow.

    5. **Encryption**. In transit: TLS 1.2+ (Cloudflare edge). At rest: AES-256 (Cloudflare-managed -- be honest that WRL does not hold encryption keys). Cryptographic signing: Ed25519 (signing.js). Hashing: SHA-256 for API keys, sessions, IP pseudonymization.

    6. **Tenant Isolation**. Logical isolation via tenant_id foreign keys. Shared D1/R2/KV/Worker. Per-tenant rate limiting. Query-level enforcement. Be explicit about what is NOT offered: no physical isolation, no per-tenant encryption, no data residency guarantees.

    7. **SSRF Prevention and Input Validation**. URL validation with private IP blocklist (RFC 1918, link-local, CGNAT, loopback). Document the TOCTOU residual risk honestly (DNS re-resolution between validation and Browser Rendering).

    8. **Content Security**. Google Web Risk pre-capture screening. Daily re-scan with automatic quarantine. Quarantine states and resolution.

    9. **Incident Detection and Response**. 9 Coralogix alert rules (list them by name and priority). Structured logging to EU2 (no PII in logs). Link to the incident response procedure page (separate doc).

    10. **Supply Chain Security**. Open source codebase. Cloudflare dependency model. No npm runtime dependencies (Workers runtime). GitHub Actions for CI/CD.

    11. **Compliance Posture**. GDPR: data minimization, pseudonymization, right to deletion, DPA available. eIDAS: qualified timestamps via Sectigo. No SOC 2 or ISO 27001 certification (be honest -- reference Cloudflare's certifications for infrastructure).

    12. **Residual Risks and Mitigations**. Enumerate honestly: TOCTOU SSRF risk, no application-level encryption at rest, no data residency guarantees, sole-proprietor operational constraint, RFC 3161 certificate chain validation deferred, no 24/7 SOC.

    13. **Controls Inventory** (table format). Map security controls to implementation and evidence files. Use the controls table from the security-minion's analysis.

    ### Diagrams to include (all Mermaid)

    - C4 Context diagram (system boundaries, actors, external services)
    - Capture pipeline data flow (POST /v1/captures through queue to storage, showing each transformation)
    - Personal data flow (entry, pseudonymization, storage, discard points)
    - OAuth PKCE authentication sequence

    Use the `/mermaid` skill for Mermaid syntax reference if needed.

    ### Key constraints

    - Every security claim must map to a specific source file. Use format: "(see `filename.js`)" for verifiability.
    - Do not reveal exact rate limit thresholds, KV key formats, or error handling internals. Document that controls exist, not how to bypass them.
    - Do not claim SOC 2, ISO 27001, or any formal certification WRL does not hold. Reference Cloudflare's certifications for infrastructure.
    - Include the sole-proprietor operational model explicitly in relevant sections -- do not hide it.
    - Keep a professional but honest tone. The privacy policy (`landing/public/privacy.html`) sets the right precedent with its "reasonable-effort privacy policy for a small, early-stage project" disclaimer.

    ## What NOT to do

    - Do not create the subprocessor list, DPA, incident response, or data retention documents. Those are separate tasks.
    - Do not modify any code or configuration files.
    - Do not create landing site pages.
    - Do not add nav entries to site.js -- that is a separate task.

    ## Files to read for source material

    Architecture and security:
    - `src/capture.js` (capture pipeline, Browser Rendering, SSRF, threat check)
    - `src/auth.js` (API key auth, scopes, timing-safe comparison)
    - `src/oauth.js` (GitHub OAuth PKCE, session creation, token handling)
    - `src/session.js` (session management, HMAC signing, __Host- cookies)
    - `src/signing.js` (Ed25519 signatures, key rotation, public key archive)
    - `src/rfc3161.js` (RFC 3161 timestamping, DigiCert + Sectigo)
    - `src/ip-hash.js` (IP pseudonymization, HMAC-SHA-256, daily rotation)
    - `src/url-validation.js` (SSRF prevention, private IP blocklist)
    - `src/threat-check.js` (Google Web Risk, daily rescan, quarantine)
    - `src/db.js` (D1 schema, tenant scoping, query patterns)
    - `src/log.js` (structured logging, NEVER LOG contract)
    - `wrangler.toml` (bindings, rate limiters, queues, cron)

    Operations:
    - `docs/operations/alerts.md` (9 Coralogix alert rules)
    - `docs/operations/runbooks/` (operational procedures)

    Existing docs:
    - `site/content/authentication.md` (for tone/format reference)
    - `site/content/verification.md` (for cryptographic verification details)
    - `site/content/legal-evidence.md` (for legal evidence framing)
    - `landing/public/privacy.html` (for current privacy commitments)

    ## Available Skills
    - ops-runbook: `.claude/skills/ops-runbook/SKILL.md` (WRL operational procedures reference)
    - mermaid: `/Users/ben/.claude/skills/mermaid/SKILL.md` (Mermaid diagram syntax reference)

- **Deliverables**: `site/content/security/whitepaper.md`
- **Success criteria**: All 13 sections present; at least 4 Mermaid diagrams (C4 context, capture pipeline, personal data flow, OAuth sequence); every security claim references a source file; residual risks section is honest and specific; controls inventory table complete; no aspirational claims

---

### Task 4: Incident Response Procedure
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    Write the WRL Incident Response Procedure as a docs site page.

    ## What to do

    Create `site/content/security/incident-response.md` with Eleventy frontmatter (layout: doc.njk, title: "Incident Response", description, order: 503).

    This is the customer-facing incident response overview: what tenants can expect if something goes wrong. Not the internal runbook.

    ### Sections

    **1. Detection**
    How incidents are detected. Map the 9 existing Coralogix alerts to three incident categories:

    - Service Availability: `[WRL] Worker Errors (5xx)` (P1), `[WRL] Capture Failures` (P1)
    - Security: `[WRL] Auth Failure Spike` (P1), `[WRL] Threat Check Quarantines` (P3), `[WRL] Threat Check API Failures` (P2)
    - Degraded Service: `[WRL] TSA Failures` (P3), `[WRL] Qualified TSA Failures` (P2), `[WRL] Email Delivery Failures` (P2), `[WRL] Email Bounces` (P3)

    Acknowledge the gap: no dedicated data breach detection alert. Explain that WRL's serverless architecture (no SSH, no persistent servers, secrets in Cloudflare Worker secrets) limits traditional breach vectors, but the operator monitors for anomalous admin API activity.

    **2. Severity Classification**

    | Severity | Criteria | Response Window |
    |----------|----------|-----------------|
    | SEV-1 (Critical) | Service fully unavailable OR confirmed personal data breach | Acknowledge within 30 min (best-effort) |
    | SEV-2 (High) | Core functionality degraded OR suspected unauthorized access | Acknowledge within 2 hours |
    | SEV-3 (Medium) | Non-core degradation (TSA, email) OR elevated security signals | Acknowledge within 8 hours |
    | SEV-4 (Low) | Informational (quarantine spikes, bounce clusters) | Next business day |

    **3. Containment Actions**
    What the operator can do: rollback deployment, revoke API keys, rotate signing key, block IPs via WAF, disable tenants, purge caches, quarantine captures.

    **4. GDPR Notification Timelines**
    - Supervisory authority (Art. 33): within 72 hours of confirmed breach
    - Affected customers: within 48 hours of confirmed breach (24-hour buffer before authority deadline)
    - Data subjects (Art. 34): when breach poses high risk to individuals
    - Post-incident report: within 30 days

    Include a brief breach assessment decision tree: Alert fires -> Personal data involved? -> Actually accessed/exfiltrated? -> High risk to individuals? -> Notification required?

    **5. Operational Model**
    Be honest: WRL is operated by a sole proprietor. No 24/7 SOC, no on-call rotation. Automated detection via Coralogix email alerts. Best-effort human response. Cloudflare's platform resilience (auto-restart, queue retries) provides first-line defense.

    **6. Communication**
    How affected customers will be notified: email to account contact address. Include a brief description of what a notification would contain (what happened, what data affected, what the operator has done, what the customer should do).

    **7. Post-Incident Review**
    Timeline, root cause analysis, remediation actions, preventive measures. Post-incident report provided to affected customers within 30 days.

    Include a TL;DR summary box at the top.

    ## What NOT to do

    - Do not create notification templates (those are internal operator tools, not customer-facing).
    - Do not create an incident register (that is an internal operational artifact).
    - Do not propose new Coralogix alerts or code changes.
    - Do not create the internal runbook -- that already exists at `docs/operations/runbooks/`.
    - Do not overpromise. "Best-effort within 30 minutes" is honest; "guaranteed 15-minute MTTR" is fiction for a sole proprietor.

    ## Context

    Read `docs/operations/alerts.md` for the 9 alert rules (names, priorities, thresholds, notification settings).
    Read `docs/operations/runbooks/` for existing operational procedures.
    Read `landing/public/privacy.html` for existing GDPR commitments.
    Read the observability-minion contribution for the detailed alert-to-category mapping and gap analysis.

    The DPA (separate document) will reference this page for incident response commitments. Keep the notification timelines consistent: 48 hours customer notification, 72 hours authority notification.

    ## Available Skills
    - ops-runbook: `.claude/skills/ops-runbook/SKILL.md` (WRL operational procedures reference)

- **Deliverables**: `site/content/security/incident-response.md`
- **Success criteria**: All 7 sections present; severity classification table; GDPR timelines stated; sole-proprietor model disclosed honestly; breach assessment decision tree included; TL;DR box present

---

### Task 5: Data Processing Agreement (DPA)
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1 (subprocessor list, referenced as annex)
- **Approval gate**: yes
- **Gate reason**: The DPA is a contractual template that enterprise customers will sign. Legal commitments (notification timelines, audit rights, deletion obligations) are hard to reverse once in use. It defines the processor relationship for all future enterprise deals.
- **Gate rationale**: |
    Chosen: HTML page on docs site + static PDF in `site/assets/`, standard GDPR Art. 28 structure with 4 annexes, audit rights via questionnaire (not on-site), 48-hour customer breach notification commitment
    Over: (1) Dynamic web form for DPA execution (rejected: KISS, enterprise buyers download and counter-sign PDFs); (2) Promising on-site audit rights (rejected: unrealistic for sole proprietor); (3) 24-hour breach notification (rejected: too aggressive for a one-person operation, creates legal liability)
    Why: The DPA must be achievable today. A sole proprietor cannot offer on-site audits or 24/7 breach monitoring. Honest commitments build more trust than aspirational ones that fail on first test.
- **Prompt**: |
    Write the WRL Data Processing Agreement template as a docs site page.

    ## What to do

    Create `site/content/security/dpa.md` with Eleventy frontmatter (layout: doc.njk, title: "Data Processing Agreement", description, order: 502).

    This is a GDPR Article 28 DPA template for enterprise customers where WRL processes personal data on their behalf. Include fill-in-the-blank placeholders for customer-specific details: `[Customer Name]`, `[Effective Date]`, `[Customer Contact]`.

    ### Structure

    **Main Agreement:**
    1. Definitions (controller, processor, personal data, processing, sub-processor, data subjects)
    2. Subject matter and duration (web capture processing on customer instruction, duration until termination/deletion)
    3. Nature and purpose of processing (capturing web pages, storing artifacts, generating timestamps, on documented customer instructions via API calls)
    4. Categories of data subjects (individuals whose personal data appears in captured web pages -- customer's determination)
    5. Categories of personal data (URLs potentially containing PII, captured page content, pseudonymized requestor IP, GitHub identity if using dashboard)
    6. Customer obligations (lawful basis for captures, not submitting URLs containing sensitive data without appropriate basis)
    7. Processor obligations (process only on documented instructions, confidentiality, security measures per Annex B, sub-processor management per Annex C)
    8. Sub-processor management (current list in Annex C, 30-day advance notice of changes, customer right to object)
    9. Data breach notification (48 hours to customer after confirmed breach, cooperation with authority notification)
    10. Audit rights (annual compliance questionnaire, right to request evidence of security measures, processor provides SOC 2/ISO certifications from infrastructure providers)
    11. Data return and deletion (data export via API during contract, deletion per data retention policy after termination, 30-day grace period)
    12. International transfers (reference Annex D for transfer mechanisms per sub-processor)
    13. Confidentiality
    14. Term and termination
    15. Liability (standard limitation, not exceeding main service agreement)

    **Annex A: Description of Processing**
    Structured table: purpose, duration, data categories, data subjects, processing operations.

    **Annex B: Technical and Organizational Measures (TOMs)**
    Enumerate based on actual implementation (verified from code):

    - Access Control (Logical): API key auth (SHA-256 hashed), GitHub OAuth PKCE, HMAC-signed session cookies (__Host- prefix), timing-safe comparison, scope-based authorization, admin key separation, auth rate limiting (AUTH_RATE_LIMITER)
    - Pseudonymization: IP HMAC-SHA-256 with daily rotation, API keys/sessions stored as SHA-256 hashes
    - Encryption: TLS 1.2+ in transit (Cloudflare edge), AES-256 at rest (Cloudflare-managed), Ed25519 integrity signatures
    - Integrity: Ed25519 signatures on WACZ bundles, RFC 3161 timestamps, SHA-256 content hashes, DB constraints
    - Availability: Cloudflare global edge (300+ cities), queue-based processing with retry (3 retries, DLQ), fail-open for non-critical services
    - Incident Detection: 9 Coralogix alert rules, structured logging to EU2 (no PII), daily URL re-scan
    - Data Minimization: GitHub tokens discarded after identity fetch, first API key show-once semantics, OAuth state auto-expire
    - Physical Security: N/A (serverless). Reference Cloudflare SOC 2 Type II, ISO 27001.

    **Annex C: Sub-Processor List**
    Reference `site/content/security/subprocessors.md` (the dedicated subprocessor page). Include a summary table here with: entity, purpose, location, DPA status.

    **Annex D: International Transfer Mechanisms**
    For each sub-processor: EU-US Data Privacy Framework certification status, SCCs (Module 3: processor-to-processor), or "no personal data transferred" (for TSA services that only receive hashes).

    Include a "Download PDF" note at the top (the PDF will be created manually from this content and placed at `site/assets/wrl-dpa.pdf` -- do not generate a PDF, just reference where it will be).

    Include the same disclaimer as the privacy policy: this is a reasonable-effort template, not professional legal advice.

    ## What NOT to do

    - Do not build a dynamic form or PDF generation pipeline.
    - Do not promise audit rights that a sole proprietor cannot deliver (no on-site audits, no penetration testing by customer).
    - Do not include SLA commitments (those belong in a separate service agreement).
    - Do not duplicate the full subprocessor details -- reference the subprocessor page.
    - Do not modify any other files.

    ## Context

    Read `landing/public/privacy.html` for existing privacy commitments (the DPA must not contradict these).
    Read `site/content/security/subprocessors.md` (created in Task 1) for the subprocessor list.
    Read `site/content/security/data-retention.md` (created in Task 2) for retention/deletion commitments.

    The incident response page (Task 4) commits to 48-hour customer notification. The DPA must use the same timeline.

    ## Available Skills
    - ops-runbook: `.claude/skills/ops-runbook/SKILL.md` (WRL operational procedures reference)

- **Deliverables**: `site/content/security/dpa.md`
- **Success criteria**: Complete Art. 28 DPA with all 4 annexes; TOMs reference actual code implementations; notification timeline matches incident response page (48 hours); sub-processor annex references the subprocessor page; placeholders clearly marked; disclaimer present

---

### Task 6: Security Hub Page and Docs Nav Update
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1, Task 2, Task 3, Task 4, Task 5
- **Approval gate**: no
- **Prompt**: |
    Create the Security & Compliance hub page on the WRL docs site and update the navigation to include the new security section.

    ## What to do

    ### 1. Create `site/content/security/index.md`

    Eleventy frontmatter: layout: doc.njk, title: "Security & Compliance", description, order: 500.

    This is the 5-minute entry page for enterprise buyers. For each compliance document, write a 200-300 word executive summary answering: what is this, what does it commit to, who should read the full version. Link to each full document.

    Documents to summarize (read each one first):
    - Security Whitepaper (`/security/whitepaper/`)
    - Data Processing Agreement (`/security/dpa/`)
    - Subprocessor List (`/security/subprocessors/`)
    - Incident Response (`/security/incident-response/`)
    - Data Retention & Deletion (`/security/data-retention/`)
    - Privacy Policy (link to `https://webresourceledger.com/privacy`)

    Include a brief intro paragraph explaining WRL's security philosophy: honest disclosure over marketing claims, every statement verifiable against the open-source codebase.

    ### 2. Update `site/_data/site.js`

    Add the security section to the nav array. The current nav is a flat list. Add a separator comment and the security items after "API Reference":

    ```javascript
    // Security & Compliance
    { title: "Security & Compliance", url: "/security/" },
    { title: "Security Whitepaper", url: "/security/whitepaper/" },
    { title: "Data Processing (DPA)", url: "/security/dpa/" },
    { title: "Subprocessors", url: "/security/subprocessors/" },
    { title: "Incident Response", url: "/security/incident-response/" },
    { title: "Data Retention", url: "/security/data-retention/" },
    ```

    The nav template in `base.njk` is already a flat list rendering `site.nav` items. These new entries will render as additional nav links. Do NOT modify `base.njk` to add group support -- keep it simple. The "Security & Compliance" entry serves as a visual section header (it links to the hub page).

    ### 3. Cross-link from existing docs pages

    Add contextual links to the security section from relevant existing pages:

    - `site/content/authentication.md`: add a note near the top or bottom linking to the security whitepaper for the full security model
    - `site/content/legal-evidence.md`: add a link to the security whitepaper's cryptographic integrity section
    - `site/content/index.md`: add a "Security & Compliance" card to the "What's next" grid (if one exists) or a link in the appropriate section

    Keep these additions minimal -- one sentence with a link, not a full paragraph.

    ## What NOT to do

    - Do not modify `base.njk` to add grouped navigation support. The flat list is sufficient.
    - Do not rewrite the content of the compliance documents. You are creating the hub page and nav, not editing the docs.
    - Do not create landing site pages -- that is a separate task.
    - Do not create a PDF version of the DPA.

    ## Context

    Read `site/_data/site.js` for the current nav structure.
    Read `site/_includes/layouts/base.njk` for the nav rendering template.
    Read `site/content/index.md` for the existing getting started page structure.
    Read all five security documents in `site/content/security/` to write accurate summaries.

- **Deliverables**: `site/content/security/index.md`, updated `site/_data/site.js`, cross-links in `site/content/authentication.md`, `site/content/legal-evidence.md`, `site/content/index.md`
- **Success criteria**: Hub page has executive summaries for all 6 compliance areas; nav includes all security pages; cross-links added to 3 existing pages; no changes to base.njk

---

### Task 7: Privacy Policy Fix
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1 (subprocessor list, for consistency)
- **Approval gate**: no
- **Prompt**: |
    Fix material inaccuracies in the WRL privacy policy.

    ## What to do

    Edit `landing/public/privacy.html` to correct the following verified inaccuracies:

    ### 1. OAuth Scope Disclosure
    The privacy policy currently states: "We request the `read:user` scope from GitHub."
    The code (`src/oauth.js`, line ~129) actually requests `read:user user:email`.
    Update the scope disclosure to accurately reflect both scopes.

    ### 2. Missing Processors
    The "Third-Party Processors" table is missing three services:
    - **Resend** (email delivery): receives email addresses for transactional notifications
    - **Google** (Web Risk API): receives URLs submitted for capture (may contain PII in query strings)
    - **Sectigo** (qualified timestamping): separate from DigiCert; receives SHA-256 hashes only (but should be listed for transparency)

    Add rows to the existing processor table following the same column format.

    ### 3. Email Address Data Category
    The privacy policy does not disclose that email addresses are collected and stored (in `notification_preferences` table). Add email addresses to the "What We Collect" section, noting they are collected from GitHub OAuth (when `user:email` scope is granted) or manual entry for notification preferences.

    ### 4. Subprocessor Page Reference
    Add a link to the new detailed subprocessor list: "For a detailed list of all subprocessors including data transfer mechanisms, see our [Subprocessor List](https://docs.webresourceledger.com/security/subprocessors/)."

    ## What NOT to do

    - Do not rewrite the entire privacy policy. Make targeted edits only.
    - Do not change the structure, tone, or formatting style of the existing page.
    - Do not modify the shared header/footer (update-in-all-pages pattern).
    - Do not add the security page to the footer nav (that is handled in Task 8).

    ## Context

    Read the full `landing/public/privacy.html` to understand the current structure.
    Read `src/oauth.js` line ~129 for the actual OAuth scope.
    Read `src/db.js` for the `notification_preferences` table schema.
    Read `site/content/security/subprocessors.md` (created in Task 1) for consistency.

    These are not minor editorial fixes -- they are GDPR Art. 13 disclosure requirements. The privacy policy must accurately list all data categories collected and all processors with access to personal data.

- **Deliverables**: Updated `landing/public/privacy.html`
- **Success criteria**: OAuth scope correctly shows `read:user user:email`; Resend, Google, and Sectigo added to processor table; email addresses disclosed as a collected data category; link to subprocessor page added

---

### Task 8: Landing Site Trust Page and Footer Update
- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 6 (security hub page must exist to link to)
- **Approval gate**: no
- **Prompt**: |
    Create a lightweight security/trust page on the WRL landing site and update the footer navigation.

    ## What to do

    ### 1. Create `landing/public/security.html`

    Follow the exact same HTML pattern as `landing/public/privacy.html`:
    - Same `<!DOCTYPE html>`, same meta tags pattern, same shared header comment pattern
    - Same CSS files (`design-system.css`, `landing.css`)
    - Same shared header (copy from privacy.html -- note the "update in all pages" comment)
    - Same footer structure

    Content (30-second trust signal page):
    - Headline: "Security & Compliance"
    - Brief intro (2-3 sentences): WRL is built on Cloudflare's infrastructure with cryptographic integrity at its core. Open-source codebase. Every security claim is verifiable.
    - Trust signal cards/list (concise, one line each):
      - GDPR compliant with Data Processing Agreement available
      - Ed25519 cryptographic signatures on every capture
      - RFC 3161 timestamps (standard + eIDAS qualified)
      - IP addresses pseudonymized (HMAC-SHA-256, never stored raw)
      - API keys stored as SHA-256 hashes
      - EU data processing via Coralogix EU2
      - Published subprocessor list
      - Open source on GitHub
    - Link to docs site security hub: "Read our full security documentation at docs.webresourceledger.com/security/"
    - Link to privacy policy: "Privacy Policy"

    ### 2. Update footer navigation across ALL landing pages

    The landing site uses a shared header/footer maintained manually across HTML files (noted in source: "update in all pages"). Add "Security" to the footer's Legal nav group in ALL landing pages:
    - `landing/public/index.html`
    - `landing/public/privacy.html`
    - `landing/public/terms.html`
    - `landing/public/refund-policy.html`
    - `landing/public/content-policy.html`
    - `landing/public/404.html`
    - `landing/public/security.html` (the new page)

    Read the existing footer in `privacy.html` to find the Legal nav group and add the Security link consistently.

    ## What NOT to do

    - Do not use a CSS framework or add any new CSS files. Use the existing `design-system.css` and `landing.css`.
    - Do not add JavaScript.
    - Do not modify the shared header structure (only add "Security" to the footer nav group).
    - Do not duplicate full compliance document content on this page -- it is a trust signal page that links to the docs site.

    ## Context

    Read `landing/public/privacy.html` for the exact HTML pattern to follow (header, footer, content area, CSS references).
    Read `landing/public/index.html` for the footer structure with nav groups.
    Count the existing landing pages so you update all of them.

- **Deliverables**: `landing/public/security.html`, updated footers in all 6 existing landing HTML files
- **Success criteria**: Security page follows exact same HTML pattern as privacy.html; footer updated in all 7 landing pages; links to docs site security hub; no new CSS or JS dependencies

---

### Cross-Cutting Coverage

- **Testing**: Excluded. This effort produces only documentation (markdown, HTML). No code logic changes that warrant automated tests. The privacy policy HTML fix (Task 7) is a content edit, not a functional change. Phase 6 (post-execution test) will run existing tests to confirm nothing broke.
- **Security**: Covered. security-minion executes Task 3 (whitepaper) and Task 7 (privacy policy fix). Security-minion's detailed analysis informed all task prompts. Phase 3.5 architecture review includes security-minion.
- **Usability -- Strategy**: Covered via user-docs-minion's three-tier progressive disclosure model (30s trust page, 5min hub, 30min full docs). ux-strategy-minion reviews in Phase 3.5.
- **Usability -- Design**: Excluded from execution. No new UI components or interaction patterns -- all deliverables are text content in existing templates. accessibility-minion and ux-design-minion are not needed for markdown docs rendered through an existing accessible Eleventy template.
- **Documentation**: This entire effort IS documentation. software-docs-minion handles hub page/nav (Task 6). user-docs-minion handles 4 content documents. Phase 8 will assess if the evolution log and backlog need updates.
- **Observability**: Excluded from execution. No runtime components produced. observability-minion's analysis of alerts and gaps was incorporated into Task 4 (incident response procedure) content. Phase 3.5 review is sufficient.

---

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: These documents change what end users see and need to evaluate during procurement. Review focus: progressive disclosure coherence across the 6 documents, whether executive summaries on the hub page accurately represent the full documents, DPA readability for non-lawyers.
- **Not selected**:
  - ux-design-minion: No new UI components or visual designs produced. All content renders through existing Eleventy templates.
  - accessibility-minion: Docs site already has accessible templates (skip links, aria labels, semantic HTML). No new interaction patterns.
  - sitespeed-minion: Documentation pages with no complex assets. No performance budget concern.
  - observability-minion: No runtime components produced. Alert/logging analysis already incorporated into task prompts.

---

### Decisions

- **Document location: docs site vs. landing site**
  Chosen: All full compliance documents on the docs site (`site/content/security/`), landing site gets a lightweight trust page linking to docs.
  Over: Duplicating full docs on the landing site (user-docs-minion's recommendation against this was unanimous).
  Why: Avoids double maintenance burden. Docs site has the right reading experience (Eleventy layout, sidebar nav, consistent styling). Landing site is for marketing-tone trust signals.

- **Navigation: flat list vs. grouped sections**
  Chosen: Keep the flat nav list in `base.njk`, add security items as additional entries with "Security & Compliance" as a visual section header.
  Over: Modifying `base.njk` to support grouped navigation with collapsible sections (user-docs-minion's initial suggestion).
  Why: KISS. The flat list works. Adding 6 items makes it longer but not unmanageable. Grouped nav is a code change to the template that adds complexity for marginal benefit. If the nav grows further, that is a future concern.

- **Incident response notification timeline: 48 hours vs. 24 hours**
  Chosen: 48-hour customer notification commitment (24-hour buffer before 72-hour authority deadline).
  Over: 24-hour notification (more aggressive but unrealistic for sole proprietor).
  Why: security-minion's analysis: a sole proprietor with no 24/7 SOC cannot reliably meet a 24-hour commitment. 48 hours allows investigation time and is still within the GDPR Art. 33 window. Overpromising creates legal liability.

- **Data-minion's code changes (schema migration, deletion endpoints, cron jobs): in scope vs. deferred**
  Chosen: Deferred. Document the intended policy only.
  Over: Including schema migration and deletion endpoints in this phase.
  Why: Issue #117 scope is explicitly "All documents, no code changes." The data retention policy documents the intended behavior; implementation is a separate effort. The data-minion's analysis is preserved in the scratch file for the future implementation phase.

- **DPA PDF generation: manual vs. build pipeline**
  Chosen: Manual PDF creation, stored as static asset.
  Over: Adding a markdown-to-PDF build step.
  Why: KISS. The DPA is a slow-changing document. A build dependency for one file is over-engineering. Manual PDF creation with a note in the evolution log that it must be regenerated on content changes.

---

### Risks and Mitigations

1. **Legal accuracy without legal review (HIGH)**. These compliance documents have legal implications, especially the DPA. All documents carry a disclaimer ("reasonable-effort, not professional legal advice"). Mitigation: follow established Art. 28 DPA structures, be conservative in commitments, flag for eventual legal review.

2. **Privacy policy has material GDPR Art. 13 violations (HIGH)**. The current privacy policy omits processors (Resend, Google) and misrepresents OAuth scope. Task 7 fixes these. Mitigation: prioritize Task 7 completion; these fixes are legally required disclosures.

3. **Maintenance burden of 6 new documents (MEDIUM)**. Architectural changes must be reflected in compliance docs. Mitigation: cross-link rather than duplicate (subprocessor list is single-source); add compliance doc review to the release checklist (Phase 8 will capture this).

4. **Landing site header/footer duplication (LOW)**. Adding security.html makes 7 manually-synced HTML files. Mitigation: this is a pre-existing concern, not new. Document it as tech debt.

5. **Sole-proprietor credibility gap (MEDIUM)**. Enterprise buyers may question whether a one-person operation can deliver on incident response commitments. Mitigation: radical honesty. The whitepaper and incident response docs explicitly state the operational model. Transparency builds more trust than aspirational claims.

6. **WACZ content-addressing edge case in deletion (LOW)**. Shared WACZ keys across captures could complicate deletion. Mitigation: documented in data retention policy's `<details>` block as a technical consideration. Not a risk for the documentation effort itself.

---

### Execution Order

```
Batch 1 (parallel, no dependencies):
  Task 1: Subprocessor List          [user-docs-minion]
  Task 2: Data Retention Policy      [user-docs-minion]
  Task 3: Security Whitepaper        [security-minion]     ** APPROVAL GATE **
  Task 4: Incident Response          [user-docs-minion]

Batch 2 (after Batch 1):
  Task 5: DPA Template               [user-docs-minion]    ** APPROVAL GATE **
    (blocked by: Task 1 subprocessor list)
  Task 7: Privacy Policy Fix         [security-minion]
    (blocked by: Task 1 subprocessor list)

Batch 3 (after Batch 2):
  Task 6: Security Hub + Nav         [software-docs-minion]
    (blocked by: Tasks 1-5 all complete)
  Task 8: Landing Trust Page         [user-docs-minion]
    (blocked by: Task 6 hub page)
```

Note: Task 3 (whitepaper) gate and Task 5 (DPA) gate are independent -- the DPA does not depend on the whitepaper's approval, only on Task 1 completion. The whitepaper gate can be reviewed while Batch 2 proceeds.

---

### External Skills

| Skill | Classification | Tasks Using |
|-------|---------------|-------------|
| ops-runbook | LEAF | Tasks 1, 2, 3, 4, 5 (reference context for operational procedures) |

---

### Verification Steps

1. **Build the docs site locally** (`cd site && npx @11ty/eleventy --serve`) and verify all 6 new security pages render correctly with proper navigation
2. **Check all internal links** between security documents, and from existing pages to security section
3. **Verify privacy policy changes** render correctly at `landing/public/privacy.html`
4. **Verify landing site trust page** and footer links across all 7 HTML files
5. **Cross-check commitments**: DPA notification timeline (48h) matches incident response page; subprocessor list matches DPA Annex C and updated privacy policy; data retention periods are consistent across all documents
6. **Review for contradictions** between the security whitepaper claims and the privacy policy / DPA commitments
