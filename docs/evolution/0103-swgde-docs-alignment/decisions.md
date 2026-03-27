# Phase 0103: SWGDE Documentation Alignment -- Decisions

## Page Title: "SWGDE Alignment" over "SWGDE Compliance"

Lucy flagged at the Task 1 approval gate that "SWGDE Compliance" in the title implies a compliance status that SWGDE does not grant. The page's own disclaimer says "SWGDE does not certify tools." Changed to "SWGDE Alignment" in title, nav, and all cross-references.

## Hybrid Format: Table + Walkthrough

software-docs-minion recommended a hybrid approach over pure table or pure narrative. Forensics evaluators scan by section number first (table), then read prose when they need depth (walkthrough). Three compliance postures (Fully addressed / Addressed differently / Tenant/examiner responsibility) reduce cognitive load.

## No Inline SEO Terms in Existing Pages

seo-minion recommended weaving "forensically sound" and "NIST-approved" into legal-evidence.md and verification.md. Rejected in synthesis: existing pages have carefully calibrated prose for a skeptical legal/forensics audience. Adding SEO-motivated terminology risks the tone. Cross-reference paragraphs provide link equity without altering established copy.

## No JSON-LD Structured Data

seo-minion recommended TechArticle JSON-LD. Deferred as YAGNI: no page-level structured data exists on the site, and adding a mechanism for one page is scope creep.

## No architecture.md Cross-Reference

Issue #259 and two specialists recommended updating architecture.md. Excluded because architecture.md serves developers, not compliance evaluators. Cross-references follow reader intent -- three discovery paths via legal-evidence, verification, and security overview cover the forensics/legal audience.

## Meta Description Without "Forensically Sound"

Lucy flagged that the original meta description said "forensically sound web capture" -- applying the term as a WRL attribute. Changed to mapping language: "How WRL's automated capture pipeline maps to SWGDE..."

## Page Placement: /security/swgde-compliance/

All specialists agreed the page belongs under Security & Compliance, not Guides. The page serves an evaluation job ("does this tool meet my professional standards?"), not a usage job. ux-strategy-minion recommended /security/swgde/ but synthesis chose the more descriptive /security/swgde-compliance/ to match the nav title.
