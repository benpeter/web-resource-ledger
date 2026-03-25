## Domain Plan Contribution: security-minion

### Recommendations

#### Question 1: Security Whitepaper Content

Having reviewed the actual implementation (signing.js, auth.js, session.js, oauth.js, ip-hash.js, threat-check.js, url-validation.js, rfc3161.js, db.js, wrangler.toml), here is what the security whitepaper must cover to satisfy enterprise security reviews.

**1. Trust Model and Architecture Overview**

The whitepaper needs a clear data flow diagram showing trust boundaries:

- **Trust boundary 1: API ingress** -- Cloudflare edge (TLS termination, DDoS, WAF) to Worker (auth, rate limiting, input validation). All inbound data is untrusted.
- **Trust boundary 2: Worker to Browser Rendering** -- untrusted URLs pass through SSRF validation (url-validation.js) before reaching headless Chromium. Document the TOCTOU residual risk honestly (DNS re-resolution between validation and render; IP pinning unavailable in CF Browser Rendering). Enterprise reviewers respect disclosed residual risks more than claims of zero risk.
- **Trust boundary 3: Worker to external services** -- TSA (DigiCert/Sectigo), GitHub OAuth, Google Web Risk, Stripe, Resend. Each is an outbound dependency with fail-open or fail-closed behavior that must be documented per-service.
- **Trust boundary 4: Storage** -- D1 (metadata, API key hashes), R2 (capture artifacts), KV (rate limits, ephemeral OAuth state). Tenant data isolation is logical (tenant_id foreign keys), not physical.

**2. Encryption Details**

Document precisely, because enterprise questionnaires ask exact algorithms:

- **In transit**: TLS 1.2+ enforced by Cloudflare edge for all API traffic. mTLS not offered (single-tenant model, API key auth). Internal Worker-to-D1/R2/KV communication is within Cloudflare's internal network (not user-controlled TLS).
- **At rest**: Cloudflare encrypts D1, R2, and KV at rest (AES-256, managed by Cloudflare -- WRL does not hold the encryption keys). This is infrastructure-level encryption, not application-level. The whitepaper must be honest that WRL relies on Cloudflare's at-rest encryption guarantees and does not add an application-level encryption layer. Enterprise reviewers will ask "who holds the keys?" -- the answer is Cloudflare.
- **Cryptographic signing**: Ed25519 (signing.js) for capture integrity. PKCS8 private key stored as Cloudflare Worker secret (env.SIGNING_KEY). Key versioning via SHA-256 fingerprint of public key (first 8 hex chars = keyId). Key rotation supported (cache invalidation on key string change). Public keys archived in D1 signing_keys table for historical verification.
- **Hashing**: SHA-256 for API key storage (auth.js hashApiKey), session ID storage (session.js via hashApiKey), IP pseudonymization (ip-hash.js -- HMAC-SHA-256 with daily rotating key derived from IP_HASH_SEED). No raw secrets or session IDs are ever persisted.
- **RFC 3161 timestamps**: SHA-256 message imprint sent to TSA (DigiCert standard, Sectigo qualified/eIDAS). Raw TSA token stored for third-party verification. Certificate chain validation deferred (documented limitation).

**3. Tenant Isolation**

Be precise about what "isolation" means here, because enterprise buyers will probe:

- **Logical isolation, not physical**: All tenants share the same D1 database, R2 bucket, KV namespace, and Worker. Isolation is enforced by tenant_id foreign keys in D1 and R2 key prefixes. There is no per-tenant encryption key, no per-tenant database, no per-tenant Worker.
- **Query-level enforcement**: Every D1 query in db.js filters by tenant_id. There is no admin query path that returns cross-tenant data to tenant API keys (scope separation: admin vs capture/read).
- **Rate limiting isolation**: Per-tenant rate limiters (CAPTURE_RATE_LIMITER, configurable via KV counters, default 10/60s) prevent one tenant from exhausting shared capacity. Global limiter (200/60s) is the backstop.
- **API key isolation**: Keys are scoped to tenant_id. A key for tenant A cannot access tenant B's captures. Revoked keys are hard-rejected (no fallthrough to legacy).
- **What the whitepaper should NOT claim**: Physical isolation, per-tenant encryption, or data residency guarantees. Cloudflare Workers run on the nearest PoP globally -- there is no region pinning (this is a known gap for data residency requirements).

**4. Access Control Model**

This maps directly to what procurement questionnaires ask:

- **Authentication methods**: (a) API key (Bearer token, SHA-256 hashed, D1 lookup); (b) GitHub OAuth 2.0 with PKCE (session cookie, HMAC-signed, __Host- prefix); (c) Admin key (infrastructure secret, timing-safe comparison).
- **Authorization model**: Scope-based. Three scopes: `capture` (implies `read`), `read`, `admin`. Admin is a separate infrastructure key, not a tenant key scope. No RBAC, no ABAC -- flat scope model.
- **Session security**: 32-byte random session IDs (crypto.getRandomValues), 7-day expiry, HMAC-SHA-256 signed cookies with __Host- prefix (enforces Secure, no Domain, Path=/). Session IDs stored as SHA-256 hashes in D1.
- **Rate limiting layers**: Six distinct rate limiters (capture per-tenant, capture per-IP, capture global, verify, admin, auth). Auth rate limiter (10/60s) specifically defends against credential stuffing.

**5. Security Controls Inventory (for questionnaire mapping)**

| Control | Implementation | Evidence |
|---------|---------------|----------|
| Input validation | URL validation with SSRF blocklist, tenant ID regex, capture ID format checks | url-validation.js, db.js |
| Output encoding | JSON responses only (no HTML rendering of user input in API) | responses.js |
| Authentication | SHA-256 hashed API keys, HMAC-signed session cookies, timing-safe comparison | auth.js, session.js |
| Authorization | Scope-based access control checked on every endpoint | auth.js hasScope() |
| Rate limiting | 6 distinct rate limiters at Cloudflare edge | wrangler.toml |
| Cryptographic integrity | Ed25519 signatures on all capture bundles | signing.js |
| Timestamping | RFC 3161 via DigiCert (standard) + Sectigo (eIDAS qualified) | rfc3161.js |
| SSRF prevention | DNS pre-resolution, private IP blocklist (RFC 1918, link-local, CGNAT, loopback, etc.) | url-validation.js |
| Content security | Google Web Risk API pre-capture screening + daily re-scan with quarantine | threat-check.js |
| Secret management | Cloudflare Worker secrets (never in code, never in logs), 1Password for operator | wrangler.toml comments |
| IP pseudonymization | HMAC-SHA-256 with daily key rotation | ip-hash.js |
| Logging | Structured logs to Coralogix EU2, no PII/credentials in logs | log.js |
| Alerting | 9 alert rules covering auth failures, capture failures, 5xx, threat checks | alerts.md |

**6. Sections That Satisfy Enterprise Security Review**

The whitepaper should be structured to map to common security questionnaires (SIG Lite, CAIQ, VSA):

1. Executive Summary (1 page)
2. Architecture Overview with DFD and trust boundaries
3. Data Classification and Handling (what data, where stored, how protected)
4. Authentication and Access Control
5. Encryption (transit, rest, signing)
6. Tenant Isolation Model
7. SSRF Prevention and Input Validation
8. Content Security (threat screening, quarantine)
9. Incident Detection and Response (alerts, logging)
10. Supply Chain Security (open source, Cloudflare dependency)
11. Compliance Posture (GDPR, eIDAS readiness)
12. Residual Risks and Mitigations (honest disclosure)
13. Appendix: Subprocessor List

---

#### Question 2: DPA, International Transfers, TOMs, Incident Response

**DPA Clauses Beyond the Privacy Policy**

The privacy policy covers the controller-facing obligations well. The DPA needs to address the processor-facing obligations for enterprise customers where WRL processes data on their behalf (Art. 28 GDPR):

1. **Subject matter and duration** -- scope of processing (web capture on customer instruction), duration (until data deletion or contract termination).
2. **Nature and purpose** -- processing capture requests, storing artifacts, generating timestamps.
3. **Categories of data subjects** -- individuals whose personal data appears in captured web pages (this is the customer's determination, not WRL's).
4. **Categories of personal data** -- URLs (may contain PII in query strings), captured page content (may contain any personal data visible on the page), pseudonymized requestor IP.
5. **Customer instructions** -- WRL processes only on documented instructions (API calls = instructions). No autonomous processing.
6. **Sub-processor management** -- list of sub-processors, notification of changes, right to object.
7. **Security measures (TOMs)** -- reference the TOM annex.
8. **Data breach notification** -- timeline and procedure (see below).
9. **Audit rights** -- how the customer can verify compliance (realistically: questionnaire-based, not on-site for a sole-proprietor SaaS).
10. **Data return and deletion** -- procedure on contract termination.
11. **Confidentiality obligations** -- operator's duty to ensure personnel with access are bound by confidentiality.

**Standard Contractual Clauses (SCCs)**

The subprocessor chain requires SCCs for:

- **Cloudflare** (global network, data processed at nearest PoP): Cloudflare publishes its own DPA with SCCs (Module 3: processor-to-processor). WRL should reference Cloudflare's DPA and confirm SCCs are in place. EU-US Data Privacy Framework also applies (Cloudflare is certified).
- **GitHub** (USA, OAuth identity): Limited data transfer (GitHub user ID and login during auth only). GitHub's DPA with SCCs covers this. Minimal data, minimal risk.
- **Stripe** (USA, payment processing): Direct controller relationship between customer and Stripe for payment data. Stripe's own DPA applies. WRL acts as a conduit, not a processor of payment data.
- **Sectigo** (USA, TSA): Only SHA-256 hashes are sent (no personal data). Arguably no personal data transfer at all, but document it for transparency.
- **DigiCert** (USA, TSA): Same as Sectigo -- only hashes, no personal data.
- **Coralogix** (EU2 region): Pseudonymized operational data. EU processing, no international transfer concern.
- **Resend** (USA, email delivery): Email addresses of notification recipients. Resend's DPA with SCCs needed.
- **Google** (USA, Web Risk API): Only URLs are sent for threat checking. URLs may contain personal data in query strings. Google Cloud DPA with SCCs applies.

**Recommendation**: The DPA should include a sub-processor annex with each provider, the data transferred, the transfer mechanism (EU-US DPF, SCCs Module 3, or "no personal data"), and a link to the provider's own DPA.

**Technical and Organizational Measures (TOMs)**

Enumerate these based on what I verified in the code (Art. 32 GDPR):

**Access Control (Physical):**
- N/A -- no physical infrastructure. Cloudflare manages physical security of data centers. Reference Cloudflare's SOC 2 Type II and ISO 27001 certifications.

**Access Control (Logical):**
- API key authentication with SHA-256 hashed storage (auth.js)
- GitHub OAuth 2.0 with PKCE (oauth.js)
- HMAC-signed session cookies with __Host- prefix (session.js)
- Timing-safe key comparison (auth.js timingSafeEqual)
- Scope-based authorization on every endpoint
- Admin key separated from tenant keys
- Rate limiting on authentication endpoints (AUTH_RATE_LIMITER: 10/60s)

**Pseudonymization:**
- IP addresses pseudonymized via HMAC-SHA-256 with daily rotating key (ip-hash.js)
- Raw IPs never stored in capture records or logs
- API keys and session IDs stored only as SHA-256 hashes

**Encryption:**
- TLS 1.2+ for all data in transit (Cloudflare edge)
- AES-256 at rest for D1, R2, KV (Cloudflare infrastructure)
- Ed25519 signatures for capture integrity (signing.js)

**Integrity:**
- Ed25519 cryptographic signatures on all WACZ bundles
- RFC 3161 timestamps from independent TSAs
- SHA-256 content hashes for tamper detection
- Database CHECK constraints and application-layer validation

**Availability:**
- Cloudflare global edge network (300+ cities)
- Queue-based capture processing with automatic retry (3 retries, DLQ)
- Fail-open design for non-critical services (TSA, Web Risk) with degraded status tracking

**Incident Detection:**
- 9 Coralogix alert rules (auth failures, capture failures, 5xx, threat quarantines, TSA failures, email failures)
- Structured logging to Coralogix EU2 (no PII in logs)
- Daily URL re-scan for retroactive threat detection

**Data Minimization:**
- GitHub access tokens discarded immediately after identity fetch (oauth.js line 257)
- Only GitHub ID and username stored (not email from GitHub, unless user opts in)
- First API key shown once, then deleted from KV (show-once semantics)
- OAuth state entries TTL 600s with immediate deletion on use

**Incident Notification Timeline**

For a sole-proprietor SaaS, be realistic:

- **GDPR Art. 33**: 72-hour notification to supervisory authority is the legal requirement. This is feasible for a sole proprietor IF the incident is detected promptly.
- **GDPR Art. 34**: Notification to data subjects "without undue delay" for high-risk breaches.
- **DPA commitment to customers**: I recommend committing to **notify affected customers within 48 hours of confirmed breach** (not 48 hours of detection -- investigation time is necessary to distinguish false positives from real breaches). This gives 24 hours buffer before the 72-hour authority notification deadline.
- **Detection capability**: The 9 Coralogix alerts provide reasonable detection for auth-related incidents. However, data exfiltration via authorized API keys (legitimate key used for unauthorized access) would not trigger alerts. The whitepaper should be honest about this gap.
- **Practical constraint**: As a sole proprietor, there is no 24/7 SOC. Incident response is best-effort during business hours, with Coralogix email alerts for off-hours detection. The DPA should state this honestly rather than overpromising.

**Recommended incident response timeline for the DPA:**
1. Detection: automated alerts + manual monitoring (best-effort, not 24/7)
2. Initial assessment: within 24 hours of detection
3. Customer notification: within 48 hours of confirmed breach
4. Authority notification: within 72 hours per GDPR Art. 33
5. Post-incident report: within 30 days

---

### Proposed Tasks

**Task 1: Security Whitepaper**
- **Deliverable**: `docs/compliance/security-whitepaper.md` (15-20 pages)
- **Structure**: Follow the 13-section outline above (Executive Summary through Subprocessor List)
- **Key constraint**: Every claim must map to verifiable code or configuration. No aspirational statements.
- **Include**: Mermaid DFD with trust boundaries, encryption details table, controls inventory table, residual risks section
- **Dependencies**: None (all source material is in the codebase)

**Task 2: DPA Template**
- **Deliverable**: `docs/compliance/dpa-template.md`
- **Structure**: Standard GDPR Art. 28 DPA with annexes
- **Annexes**: (A) Description of processing, (B) Technical and organizational measures, (C) Sub-processor list, (D) Standard Contractual Clauses reference
- **Dependencies**: Subprocessor list (Task 5) feeds into Annex C

**Task 3: Incident Response Procedure**
- **Deliverable**: `docs/compliance/incident-response.md`
- **Content**: Detection sources, severity classification, response timeline, notification templates, post-incident review process
- **Key constraint**: Must be realistic for sole-proprietor operations. No fantasy 15-minute MTTR claims.
- **Dependencies**: References alert rules from docs/operations/alerts.md

**Task 4: Data Retention and Deletion Policy**
- **Deliverable**: `docs/compliance/data-retention.md`
- **Content**: Retention schedule per data category (aligns with privacy policy table), deletion procedures (manual and automated), account deletion workflow, log retention
- **Key constraint**: Must match what the code actually does (7-day sessions, 90-day log retention, indefinite captures)
- **Dependencies**: None

**Task 5: Subprocessor List**
- **Deliverable**: `docs/compliance/subprocessors.md`
- **Content**: Table of all subprocessors with: name, purpose, data categories, location, transfer mechanism, DPA link
- **Subprocessors**: Cloudflare, GitHub, Stripe, Sectigo, DigiCert, Coralogix, Resend, Google (Web Risk)
- **Dependencies**: None (but feeds into DPA Annex C and privacy policy Third-Party Processors section)

**Task 6: Privacy Policy Update**
- **Deliverable**: Update `landing/public/privacy.html`
- **Changes needed**:
  - Add Resend as a processor (currently missing from Third-Party Processors table -- it handles email delivery with recipient email addresses)
  - Add Google as a processor (Web Risk API receives URLs which may contain personal data)
  - Add Sectigo separately from DigiCert (the privacy policy only lists DigiCert but WRL uses Sectigo for qualified timestamps)
  - Update the `read:user user:email` scope disclosure (the privacy policy says `read:user` only, but oauth.js line 129 requests `read:user user:email`)
  - Add email address collection disclosure (notification_preferences table stores email, source can be 'github' or 'manual')
- **Dependencies**: Should be done after Task 5 (subprocessor list) for consistency

**Execution order**: Tasks 4, 5 (no dependencies) -> Task 1 (whitepaper, references TOMs and subprocessors conceptually but can be written in parallel) -> Task 2 (DPA, incorporates subprocessor list as annex) -> Task 3 (incident response, standalone but referenced by DPA) -> Task 6 (privacy policy update, last because it should be consistent with all other documents)

Realistically, Tasks 1-5 can be written in parallel since they are documents, not code. Task 6 (privacy policy HTML update) should be last to ensure consistency.

---

### Risks and Concerns

**RISK 1 (HIGH): Privacy policy has material inaccuracies**

The current privacy policy at `landing/public/privacy.html` contains statements that do not match the code:

- **Scope discrepancy**: The privacy policy states "We request the `read:user` scope from GitHub." But oauth.js line 129 requests `read:user user:email`. The service receives and stores email addresses in notification_preferences. This is a GDPR disclosure gap -- the privacy policy must accurately disclose all data collected.
- **Missing processors**: Resend (email delivery, handles email addresses) and Google (Web Risk API, receives URLs) are not listed as processors. These are legally required disclosures under GDPR Art. 13(1)(e).
- **Missing data category**: Email addresses collected from GitHub OAuth and manual entry (notification_preferences table) are not disclosed as a data category.

This is not just a documentation gap -- it is a potential GDPR compliance violation (Art. 13 disclosure requirements). **Must be fixed before or alongside the compliance documentation effort.**

**RISK 2 (MEDIUM): No application-level encryption at rest**

The whitepaper will need to disclose that at-rest encryption is Cloudflare-managed (AES-256). WRL does not implement application-level encryption (e.g., envelope encryption with customer-managed keys). This is a common enterprise objection. The mitigation is honest disclosure plus the argument that Cloudflare's SOC 2 Type II and ISO 27001 certifications provide assurance. Some enterprises will reject this -- that is an acceptable business risk for WRL's current stage.

**RISK 3 (MEDIUM): No data residency guarantees**

Cloudflare Workers run at the nearest PoP. There is no way to guarantee that data is processed only in the EU. D1 and R2 have location hints but not hard guarantees. Enterprise customers in regulated industries (healthcare, finance) may require data residency. The whitepaper should state this limitation clearly and note Cloudflare's EU-only processing options (if available for Workers) as a future consideration.

**RISK 4 (MEDIUM): Sole-proprietor incident response capability**

The incident response procedure must be honest about the operational reality: one person, no SOC, no on-call rotation. Enterprise customers expect 24/7 monitoring and defined SLAs. The recommended approach is transparency: automated detection (Coralogix alerts), best-effort human response, defined maximum notification timelines. Overpromising creates legal liability.

**RISK 5 (LOW): RFC 3161 certificate chain validation is deferred**

The rfc3161.js header explicitly states "Certificate chain validation is deferred." The security whitepaper must not claim full RFC 3161 verification capability. It should state that WRL captures and stores TSA tokens, and that certificate chain validation is the verifier's responsibility (which is architecturally correct -- the verifier should not trust the archiver's validation).

**RISK 6 (LOW): TOCTOU in SSRF prevention is a documented residual risk**

url-validation.js documents a TOCTOU race between DNS validation and Browser Rendering's own DNS resolution. IP pinning is unavailable in CF Browser Rendering. The whitepaper should include this in the residual risks section with the existing risk quantification (attacker needs DNS control, sub-second timing, and capture ID to retrieve results).

---

### Additional Agents Needed

- **legal-minion** (if available) -- the privacy policy inaccuracies (Risk 1) have legal implications. A legal review of the updated privacy policy, DPA template, and terms consistency would be valuable. The current disclaimer ("not professional legal advice") is appropriate for the stage but the compliance documents should still be as accurate as possible.
- Otherwise: **None** -- the compliance documentation is primarily a security domain task. The writing can be handled by a general writing agent working from the security-minion's specifications. No code changes are required except the privacy policy HTML update (Task 6).
