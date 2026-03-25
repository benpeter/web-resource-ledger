# Decisions: Phase 0069 — Compliance Documentation

## D1: Document Location — Docs Site vs Landing Site

**Chosen**: All full compliance documents on the docs site (`site/content/security/`). Landing site gets a lightweight trust page linking to docs.

**Over**: Hosting full documents on both sites (rejected: content duplication, maintenance burden) or only on the landing site (rejected: landing pages lack Eleventy layout, navigation).

**Why**: Enterprise reviewers need a single, navigable location. The docs site already has the right layout and nav infrastructure. The landing trust page serves as a 30-second evaluation entry point.

## D2: Diagram Format — Mermaid vs ASCII

**Chosen**: Mermaid diagrams for architecture, data flow, and sequence diagrams.

**Over**: ASCII art diagrams (rejected: too dense for 6 storage bindings + 6 external services).

**Why**: CLAUDE.md explicitly recommends Mermaid for complex diagrams. GitHub and the docs site render Mermaid natively.

## D3: DPA Audit Rights — Questionnaire vs On-Site

**Chosen**: Compliance questionnaire upon written request, with 30-business-day turnaround. No on-site audit rights.

**Over**: Annual proactive audits (rejected: creates proactive obligation that sole proprietor could breach by inaction). On-site audits (rejected: unrealistic for sole proprietor, no physical infrastructure to inspect).

**Why**: Honest commitments build more trust than aspirational ones. Serverless architecture means there is no "site" to audit.

## D4: Breach Notification Timeline — 48h vs 24h vs 72h

**Chosen**: 48 hours to customers, 72 hours to supervisory authority.

**Over**: 24 hours to customers (rejected: too aggressive for one-person operation, creates legal liability). 72 hours for both (rejected: customer notification should come before authority notification).

**Why**: 48 hours gives the sole proprietor time to assess and draft a meaningful notification while leaving a 24-hour buffer before the GDPR Art. 33 deadline.

## D5: DPA TOMs Language — Outcome vs Implementation

**Chosen**: Outcome language for lawyers (e.g., "credentials stored using one-way cryptographic hashing").

**Over**: Engineering language (e.g., "SHA-256 with timing-safe comparison via crypto.timingSafeEqual"). Rejected by user-docs-minion: DPA annexes are read by legal teams, not engineers.

**Why**: Technical implementation details belong in the whitepaper. The DPA must communicate what controls achieve, not how they work.

## D6: Flat Nav Preserved

**Chosen**: Security pages added as flat entries to the existing `site.js` nav array, with "Security & Compliance" as a visual section header.

**Over**: Grouped nav with template changes to `base.njk` (rejected: YAGNI, margo).

**Why**: 15 items in a flat list is within acceptable density. Template changes introduce complexity for no immediate user benefit.

## D7: Data-Minion Code Changes Deferred

**Chosen**: Document the intended deletion policy without implementing deletion endpoints, schema migrations, or cron jobs.

**Over**: Implementing deletion automation alongside the documentation (rejected: issue #117 scope is "all documents, no code changes").

**Why**: The documentation defines the commitment. Implementation is a separate phase, tracked as a deferred item.

## D8: Privacy Policy Inaccuracy Fixes

**Chosen**: Fix 4 material inaccuracies in privacy.html (OAuth scope, missing processors, email address category, subprocessor page link).

**Over**: Full privacy policy rewrite (rejected: targeted fixes are sufficient and less risky).

**Why**: These are GDPR Art. 13 disclosure requirements. The privacy policy must accurately reflect what the code actually does.
