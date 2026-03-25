# Outcome: Phase 0069 — Compliance Documentation

## What Was Produced

Six compliance documents published on the docs site (`site/content/security/`),
one trust page on the landing site (`landing/public/security.html`), and four
targeted fixes to the existing privacy policy.

### New Documents

| Document | Path | Purpose |
|----------|------|---------|
| Security & Compliance hub | `site/content/security/index.md` | Entry point with executive summaries linking to full docs |
| Security Whitepaper | `site/content/security/whitepaper.md` | 13-section technical whitepaper with 4 Mermaid diagrams, 18-control inventory |
| Data Processing Agreement | `site/content/security/dpa.md` | GDPR Art. 28 DPA template with 15 clauses + 4 annexes |
| Subprocessor List | `site/content/security/subprocessors.md` | 8 third-party services with data categories, locations, transfer mechanisms |
| Incident Response | `site/content/security/incident-response.md` | Detection, severity classification, containment, GDPR notification procedures |
| Data Retention & Deletion | `site/content/security/data-retention.md` | 14 data categories with retention periods, 6-step deletion procedure |

### Landing Site

| Artifact | Path | Purpose |
|----------|------|---------|
| Trust page | `landing/public/security.html` | 30-second evaluation page for enterprise buyers with links to full docs |

### Modified Files

| File | Change |
|------|--------|
| `site/_data/site.js` | 6 nav entries added under "Security & Compliance" section header |
| `site/content/authentication.md` | Cross-link to security whitepaper |
| `site/content/legal-evidence.md` | Cross-link to whitepaper encryption section |
| `site/content/index.md` | Security & Compliance card added to "What's next" grid |
| `landing/public/privacy.html` | 4 GDPR Art. 13 disclosure fixes (see below) |
| `landing/public/index.html` | Security link in footer |
| `landing/public/terms.html` | Security link in footer |
| `landing/public/refund-policy.html` | Security link in footer |
| `landing/public/content-policy.html` | Security link in footer |
| `landing/public/404.html` | Security link in footer |

### Privacy Policy Fixes (D8)

1. OAuth scope corrected: `read:user` → `read:user user:email`
2. Added missing processors: Resend (email delivery), Google Web Risk (content screening), Sectigo (qualified timestamps)
3. Added email address as collected data category
4. Added link to subprocessor list page

## What Deviated from Plan

- **No code changes**: All deliverables are documentation. The synthesis explicitly scoped out deletion endpoint implementation, schema migrations, and cron jobs (Decision D7).
- **Landing trust page added**: Not in the original issue scope but recommended by user-docs-minion during planning as a 30-second evaluation entry point for enterprise buyers. Approved at execution plan gate.
- **Privacy policy fixes**: Discovered during planning that the existing privacy.html had 4 material inaccuracies. Fixed as Task 7 (targeted patches, not a rewrite).

## GDPR Compliance Checklist

Per issue #117 success criteria: DPA and privacy policy reviewed against GDPR requirements.

### DPA (GDPR Art. 28 Compliance)

| Requirement | Art. 28 Ref | Status | Location in DPA |
|-------------|-------------|--------|-----------------|
| Written form | Art. 28(9) | Done | Document itself is the written agreement |
| Subject matter and duration | Art. 28(3) | Done | Clause 2 (Scope) |
| Nature and purpose of processing | Art. 28(3) | Done | Clause 2 + Annex A |
| Type of personal data | Art. 28(3) | Done | Annex A (Data Categories) |
| Categories of data subjects | Art. 28(3) | Done | Annex A |
| Controller obligations and rights | Art. 28(3) | Done | Clauses 3-15 |
| Process only on documented instructions | Art. 28(3)(a) | Done | Clause 4 |
| Confidentiality obligation | Art. 28(3)(b) | Done | Clause 5 |
| Security measures (Art. 32) | Art. 28(3)(c) | Done | Clause 6 + Annex B (TOMs) |
| Sub-processor conditions | Art. 28(3)(d) | Done | Clause 7 + Annex C |
| Data subject rights assistance | Art. 28(3)(e) | Done | Clause 8 |
| Deletion/return after termination | Art. 28(3)(g) | Done | Clause 10 |
| Audit rights | Art. 28(3)(h) | Done | Clause 11 (questionnaire model) |
| Breach notification | Art. 28(3)(f) | Done | Clause 9 (48h customer, 72h authority) |
| International transfers | Art. 28(3) | Done | Clause 12 + Annex C (SCCs where applicable) |

### Privacy Policy (GDPR Art. 13/14 Compliance)

| Requirement | Art. 13 Ref | Status | Notes |
|-------------|-------------|--------|-------|
| Identity and contact of controller | Art. 13(1)(a) | Done | Footer on all pages |
| Purposes of processing | Art. 13(1)(c) | Done | Privacy policy sections |
| Legal basis | Art. 13(1)(c) | Done | Per-purpose legal basis |
| Recipients/categories of recipients | Art. 13(1)(e) | Fixed | Added Resend, Google Web Risk, Sectigo |
| International transfers | Art. 13(1)(f) | Done | Subprocessor list has transfer mechanisms |
| Retention periods | Art. 13(2)(a) | Done | Data retention page |
| Data subject rights | Art. 13(2)(b) | Done | Privacy policy rights section |
| Right to lodge complaint | Art. 13(2)(d) | Done | Privacy policy |
| Categories of personal data | Art. 14(1)(d) | Fixed | Added email address category |

**Note**: DPA and privacy policy are templates requiring legal counsel review before binding use. This checklist confirms structural GDPR coverage, not legal sufficiency.

## Surface Consistency

| Surface | Path(s) | Action |
|---------|---------|--------|
| **OpenAPI spec** | `openapi.yaml` | No update needed — no endpoint changes |
| **Docs site** | `site/content/security/*.md` | Updated — 6 new pages, nav entries, cross-links |
| **Landing page** | `landing/public/security.html`, footer on all pages | Updated — new trust page, Security link in footer |
| **MCP server** | `src/mcp.js` | No update needed — no API changes |
| **Legal pages** | `landing/public/privacy.html` | Updated — 4 targeted fixes for GDPR accuracy |

## Backlog Changes

No changes to `docs/backlog.md`. Issue #117 (R39) is tracked as a roadmap issue,
not a parking lot item. The compliance documentation work was fully delivered
within this phase — no items were deferred to backlog.

Deletion automation (endpoints, schema migrations, cron jobs) is documented as
a commitment in the retention policy but implementation is out of scope per D7.
This is a future phase item, not a backlog parking lot entry — it will be tracked
via a new issue when implementation is prioritized.
