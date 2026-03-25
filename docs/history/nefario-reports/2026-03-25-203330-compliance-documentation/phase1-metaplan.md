# Meta-Plan: Compliance Documentation for Enterprise Adoption

## Planning Consultations

### Consultation 1: Security Architecture Whitepaper Structure

- **Agent**: security-minion
- **Planning question**: Given WRL's architecture (Cloudflare Workers, D1, R2, KV, Browser Rendering, Ed25519 signing, RFC 3161 timestamps, GitHub OAuth + API key auth, IP hashing, content security scanning via Google Web Risk, rate limiting), what should the security whitepaper cover? Specifically: what trust model sections are needed for an enterprise security review? What encryption-at-rest and in-transit details should be documented? How should tenant isolation be described (D1 row-level scoping, R2 key prefixing, KV namespace)? What access control model description would satisfy a procurement security questionnaire? Review the existing privacy policy at `landing/public/privacy.html` and the ops runbooks at `docs/operations/runbooks/` to avoid duplication.
- **Context to provide**: `wrangler.toml` (bindings), `src/signing.js`, `src/ip-hash.js`, `src/session.js`, `src/oauth.js`, `src/threat-check.js`, `landing/public/privacy.html`
- **Why this agent**: Security architecture expertise is essential for a credible whitepaper. The agent can identify what enterprise security reviewers expect and what gaps exist in the current documentation.

### Consultation 2: Data Flow and Retention Policy Design

- **Agent**: data-minion
- **Planning question**: WRL stores data across four Cloudflare primitives (D1 for metadata, R2 for capture artifacts, KV for rate limit counters, Browser Rendering sessions are ephemeral). What data retention periods are appropriate for each storage layer? What deletion procedure ensures complete tenant data removal across all stores (D1 rows, R2 objects, KV entries)? What is the right retention policy for capture data vs. operational logs (Coralogix, 90-day retention mentioned in privacy policy)? How should the offboarding procedure handle in-flight captures and active schedules?
- **Context to provide**: D1 schema (`migrations/` directory), `wrangler.toml` bindings, `landing/public/privacy.html` (existing retention table), `src/db.js`, `src/kv.js`
- **Why this agent**: Database architecture expertise needed to design deletion procedures that are complete across all storage layers and don't leave orphaned data.

### Consultation 3: Document Structure and Publishing Strategy

- **Agent**: user-docs-minion
- **Planning question**: WRL has an Eleventy docs site at `docs.webresourceledger.com` (content in `site/content/`) and a landing page at `webresourceledger.com` (with existing privacy, terms, content-policy, refund-policy pages). Where should each compliance document live? The security whitepaper, DPA, subprocessor list, incident response procedure, data retention policy, and privacy policy need to be discoverable by enterprise procurement teams. Should they be on the docs site, the landing site, or a dedicated `/security` or `/compliance` section? How should they be structured for progressive disclosure (executive summary vs. full technical detail)? How do we handle the DPA as a downloadable PDF vs. an HTML page?
- **Context to provide**: `site/content/` (current docs pages), `landing/public/` (current legal pages), `site/eleventy.config.js`, `site/_data/`
- **Why this agent**: User documentation expertise for structuring enterprise-facing compliance documents that serve both legal reviewers and technical evaluators.

### Consultation 4: DPA and GDPR Compliance Review Approach

- **Agent**: security-minion
- **Planning question**: The DPA template needs to cover GDPR Article 28 processor obligations. Given that WRL's existing privacy policy already documents data categories, legal bases, and third-party processors, what additional DPA clauses are needed? Specifically: what standard contractual clauses should be referenced for international transfers (Cloudflare global, GitHub/Stripe/Sectigo in USA)? What technical and organizational measures (TOMs) should be enumerated? What incident notification timeline is appropriate for a small SaaS (72-hour GDPR requirement vs. practical detection capability)? Note: the subprocessor list in the privacy policy says "DigiCert" for timestamping but WRL actually uses Sectigo (switched in Phase 0028).
- **Context to provide**: `landing/public/privacy.html`, `landing/public/terms.html`, issue constraints (depends on R24, R32, R33 being documented)
- **Why this agent**: Security-minion handles threat modeling and GDPR requirements. The DPA is fundamentally a security contract.

### Consultation 5: Incident Response Procedure Design

- **Agent**: observability-minion
- **Planning question**: WRL has Coralogix alerting (9 alert rules documented in `docs/operations/alerts.md`) and operational runbooks (`docs/operations/runbooks/`). What should the incident response procedure look like for a compliance document? How should detection (Coralogix alerts), assessment (severity classification), containment, and notification be structured? What communication templates are needed (customer notification, supervisory authority notification under GDPR Art. 33)? How does the existing alerting infrastructure map to incident detection capabilities?
- **Context to provide**: `docs/operations/alerts.md`, `docs/operations/runbooks/`, `docs/operations/cache-monitoring.md`
- **Why this agent**: Observability expertise needed to ground the incident response procedure in WRL's actual detection capabilities rather than aspirational processes.

### Consultation 6: Architecture Documentation for Whitepaper

- **Agent**: software-docs-minion
- **Planning question**: The security whitepaper needs an architecture overview section with a data flow diagram. WRL's architecture involves: client -> Cloudflare Workers -> D1/R2/KV/Browser Rendering/Queue, with external integrations (GitHub OAuth, Sectigo TSA, Google Web Risk, Stripe, Coralogix, Resend). What diagram format (Mermaid? C4?) best serves a security whitepaper audience? Should the architecture overview be a standalone section of the whitepaper or a separate document referenced from multiple places? How should the data flow diagram distinguish between personal data flows and operational data flows?
- **Context to provide**: `wrangler.toml`, `src/index.js` (router), `openapi.yaml`, existing docs site pages
- **Why this agent**: Architecture documentation expertise for creating clear, accurate diagrams and descriptions that serve a security review audience.

### Cross-Cutting Checklist

- **Testing**: Exclude from planning. These are documentation deliverables with no executable code output. Phase 6 (test execution) will run existing tests to verify no code changes introduced regressions, but no new test strategy is needed.
- **Security**: INCLUDED (Consultations 1 and 4). security-minion is central to this task -- the whitepaper, DPA, and incident response all require security domain expertise.
- **Usability -- Strategy**: INCLUDED. Planning question for ux-strategy-minion: "Enterprise procurement teams need to evaluate WRL's security posture quickly. What is the ideal information architecture for compliance documents? What should a buyer see in 30 seconds (trust page), 5 minutes (whitepaper executive summary), and 30 minutes (full documentation)? How should documents cross-reference each other?"
- **Usability -- Design**: Exclude from planning. No new UI components -- these are markdown/HTML documents following existing site patterns.
- **Documentation**: INCLUDED (Consultations 3 and 6). Both user-docs-minion and software-docs-minion are consulted.
- **Observability**: INCLUDED (Consultation 5). observability-minion brings expertise on incident detection grounded in actual Coralogix alerting setup.

### Notable Exclusions

- **api-design-minion**: No API surface changes in this task. The compliance documents describe existing APIs but don't modify them.
- **iac-minion**: No infrastructure changes. Documents may reference infrastructure (Cloudflare bindings, deployment) but don't modify it.
- **oauth-minion**: OAuth flows are already documented in the privacy policy and auth docs. The whitepaper will reference but not redesign them.

### Anticipated Approval Gates

1. **Security whitepaper architecture section and trust model** (MUST gate): Hard to reverse once published; the trust model framing propagates into the DPA and all other documents. Multiple valid approaches exist (e.g., zero-trust framing vs. perimeter model, level of detail on Cloudflare's security posture vs. WRL's own controls).

2. **DPA template core clauses** (MUST gate): Legal contract template that customers will countersign. Incorrect clauses create legal liability. Must be reviewed before downstream documents (subprocessor list, data retention policy) are finalized since they're referenced from the DPA.

3. **Document publishing locations** (OPTIONAL gate): Where each document lives (docs site vs. landing site vs. repo) affects discoverability but is easy to reorganize later.

### Rationale

This task is documentation-heavy but architecturally significant -- these documents make binding statements about WRL's security posture, data handling, and incident response capabilities. The key risk is documents that don't match reality (e.g., claiming encryption-at-rest when D1/R2 encryption is Cloudflare-managed and not customer-controlled, or promising incident response timelines the one-person operation can't meet).

The planning consultation structure prioritizes:
1. **Accuracy over comprehensiveness**: security-minion and observability-minion ground documents in actual architecture and capabilities
2. **Structure over content**: user-docs-minion and software-docs-minion design the information architecture before content is written
3. **GDPR specificity**: security-minion reviews DPA against Article 28 requirements rather than using a generic template

The ux-strategy-minion consultation (via cross-cutting checklist) ensures the compliance documentation serves its actual audience: enterprise procurement teams doing due diligence, not lawyers doing deep legal review (that's explicitly out of scope per the issue constraints).

### Scope

**In scope**:
- Security whitepaper (architecture, trust model, encryption, access controls, key management, tenant isolation, audit logging)
- DPA template ready for customer countersignature
- Subprocessor list (Cloudflare, Stripe, Sectigo, GitHub, Coralogix, Google, Resend) with data categories and jurisdictions
- Incident response procedure (detection via Coralogix, assessment, containment, notification timelines, communication templates)
- Data retention policy (per-storage-layer retention periods, deletion triggers, tenant offboarding)
- Data deletion procedure (full tenant data deletion steps and timeline)
- SaaS privacy policy (may be an update to existing `landing/public/privacy.html` or a separate docs-site version)
- Publishing all documents on docs site and/or as repo files
- GDPR compliance checklist for DPA and privacy policy (in outcome.md)

**Out of scope**:
- SOC 2 Type II audit engagement
- ISO 27001 certification
- Penetration test report
- Legal counsel review (documents are templates pending legal review)
- Code changes to the application
- New infrastructure or tooling

### External Skill Integration

#### Discovered Skills

| Skill | Location | Classification | Domain | Recommendation |
|-------|----------|---------------|--------|----------------|
| ops-runbook | `.claude/skills/ops-runbook/SKILL.md` | LEAF | WRL operational procedures | Reference only -- provides context for incident response and deletion procedures but does not execute compliance doc creation |

#### Precedence Decisions

No conflicts. The ops-runbook skill is a reference resource for operational procedures, not a competing specialist. It will be listed as context in task prompts that need operational procedure details (incident response, data deletion).
