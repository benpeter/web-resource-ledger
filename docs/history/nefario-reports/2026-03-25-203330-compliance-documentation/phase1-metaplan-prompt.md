MODE: META-PLAN

You are creating a meta-plan -- a plan for who should help plan.

## Task

WRL needs the compliance documentation required for enterprise adoption. A security whitepaper describes the architecture and trust model, a DPA template is ready for customer signature, subprocessors are enumerated, and operational procedures (incident response, data retention, deletion) are documented. These artifacts make WRL viable for customers with procurement and legal review processes.

Success criteria:
- Security whitepaper covers: architecture overview, data flow diagram, encryption (at rest and in transit), access controls, key management, tenant isolation, audit logging
- Data Processing Agreement (DPA) template ready for customer countersignature
- Subprocessor list published: Cloudflare (compute, storage, DNS), Stripe (billing), Sectigo (TSA), with data categories and jurisdictions for each
- Incident response procedure: detection, assessment, containment, notification timelines, communication templates
- Data retention policy: capture data retention periods, deletion triggers, tenant offboarding procedure
- Data deletion procedure: tenant can request full data deletion, documented steps and timeline
- Privacy policy for the SaaS product: data collected, purposes, legal basis, rights, contact
- All documents published on docs site and/or as repo files
- DPA and privacy policy reviewed against GDPR requirements (checklist in outcome.md)

Scope:
- In: Security whitepaper, DPA template, subprocessor list, incident response procedure, data retention/deletion policy, privacy policy
- Out: SOC 2 Type II audit engagement, ISO 27001 certification, penetration test report, legal counsel review

Constraints:
- Depends on R24 (multi-tenant architecture must be finalized)
- Depends on R32 (content security must be documented)
- Depends on R33 (capture auth gate must be documented)
- DPA and privacy policy are templates -- final versions require legal review
- Subprocessor list must be kept current; document the update process

## Working Directory
/Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/velvet-roaming-hammock

## Codebase Context
- Cloudflare Workers app with D1, R2, KV, Browser Rendering
- Multi-tenant with API key auth + GitHub OAuth sessions
- Ed25519-signed WACZ bundles with RFC 3161 timestamps (Sectigo TSA)
- Stripe billing integration with metered usage
- Existing legal pages: privacy.html, terms.html, content-policy.html, refund-policy.html on landing site
- Docs site at docs.webresourceledger.com (Eleventy-based)
- Operations docs in docs/operations/ (alerts.md, cache-monitoring.md, runbooks/)
- Content security scanning integrated

## External Skill Discovery
Scan .claude/skills/ and .skills/ for SKILL.md files.

## Instructions
1. Read relevant files to understand the codebase context
2. Discover external skills
3. Analyze the task against your delegation table
4. Identify which specialists should be CONSULTED FOR PLANNING (not execution -- planning)
5. For each specialist, write a specific planning question
6. Return the meta-plan in structured format
7. Write your complete meta-plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-li92AL/compliance-documentation/phase1-metaplan.md
