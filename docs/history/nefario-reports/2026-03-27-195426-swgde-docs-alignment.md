---
source-issue: 259
source-issue-title: "Align docs with SWGDE Best Practices for Acquiring Online Content"
slug: swgde-docs-alignment
phase: "0103"
date: "2026-03-27"
branch: worktree-compressed-drifting-falcon
task-count: 3
gate-count: 1
mode: execution
---

# Nefario Execution Report: SWGDE Documentation Alignment

## Original Prompt

Align WRL's documentation with SWGDE's Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024). Documentation-only task: map WRL's existing capabilities to SWGDE terminology and recommendations, create a SWGDE compliance mapping page on the docs site, and update existing docs pages to reference the standard where relevant.

## Summary

Created a new SWGDE alignment mapping page at `site/content/security/swgde-compliance.md` (~237 lines, ~3300 words) that maps WRL's automated capture pipeline to 10 sections of SWGDE 21-F-001 v1.1. Added cross-references from three existing docs pages (legal-evidence.md, verification.md, security/index.md) and updated site navigation and LLMs index. No code changes.

The page uses a hybrid format: summary mapping table for quick reference, followed by section-by-section walkthrough for detailed analysis. Three compliance postures classify each mapping: "Fully addressed," "Addressed differently," and "Tenant/examiner responsibility." Gaps are documented honestly -- no configurable geolocation (4.1), no packet capture (7.4), no forensic disk images (9).

## Outcome

- **Branch**: `worktree-compressed-drifting-falcon`
- **Commits**: 2
- **Files changed**: 6 (1 new, 5 modified)

| File | Change |
|------|--------|
| `site/content/security/swgde-compliance.md` | New SWGDE alignment mapping page (237 lines) |
| `site/_data/site.js` | Added "SWGDE Alignment" nav entry under Security & Compliance |
| `site/content/llms.njk` | Added SWGDE Alignment entry with v1.1 version reference |
| `site/content/legal-evidence.md` | Added 1-paragraph SWGDE cross-reference in comparison section |
| `site/content/verification.md` | Added 1-sentence SWGDE cross-reference after trust model summary |
| `site/content/security/index.md` | Added "SWGDE Alignment" section with descriptive paragraph and link |

## Key Design Decisions

### Page title: "SWGDE Alignment" over "SWGDE Compliance"
- **Chosen**: "SWGDE Alignment" in title, nav, and all cross-references
- **Over**: "SWGDE Compliance" (original plan)
- **Why**: Lucy flagged that "SWGDE Compliance" implies a compliance status that SWGDE does not grant. The page's own disclaimer says "SWGDE does not certify tools." The title must match that care. Changed during Task 1 gate review.

### Hybrid format: table + walkthrough
- **Chosen**: Summary mapping table at top, section-by-section walkthrough below
- **Over**: Pure table (too compressed for honest gap identification) or pure narrative (less scannable for practitioners looking up specific sections)
- **Why**: Forensics evaluators scan by section number first (table), then read prose only when they need depth (walkthrough). The three-posture classification reduces cognitive load at the triage scan.

### No inline SEO terms in existing pages
- **Chosen**: Cross-reference paragraphs only; no terminology changes to existing prose
- **Over**: seo-minion recommended weaving "forensically sound" and "NIST-approved" into legal-evidence.md and verification.md
- **Why**: Existing legal-evidence.md and verification.md have carefully calibrated prose for a skeptical legal/forensics audience. Adding SEO-motivated terminology risks the tone for marginal search benefit. The dedicated page is the right concentration point.

### No architecture.md cross-reference
- **Chosen**: Exclude architecture.md from cross-reference updates
- **Over**: Issue #259 and two specialists recommended it
- **Why**: architecture.md serves developers and API consumers, not compliance evaluators. Cross-references follow reader intent. Three discovery paths (legal-evidence, verification, security overview) cover the forensics/legal audience.

### Meta description without "forensically sound"
- **Chosen**: Description uses "maps to" language without claiming WRL captures are "forensically sound"
- **Over**: Original description said "forensically sound web capture"
- **Why**: Lucy flagged that applying "forensically sound" as a WRL attribute in SEO-facing metadata is an overclaim. The body text only uses the term when quoting SWGDE.

## Phases

### Phase 1: Meta-Plan
Identified 4 specialists for planning: software-docs-minion (mapping structure), user-docs-minion (legal/evidence positioning), seo-minion (SWGDE terminology strategy), ux-strategy-minion (navigation placement). No external skills relevant.

### Phase 2: Specialist Planning
All 4 specialists contributed. Key consensus: hybrid format, place under Security & Compliance, honest gap framing as "alternative approach" not "limitation," "forensically sound" is highest-value SEO keyword. No additional agents requested.

### Phase 3: Synthesis
Consolidated into 3 tasks with 1 approval gate. Key synthesis decisions: rejected inline SEO terms in existing pages, rejected JSON-LD (YAGNI), rejected architecture.md cross-reference (wrong audience), chose /security/swgde-compliance/ URL path.

### Phase 3.5: Architecture Review
6 reviewers (5 mandatory + seo-minion discretionary). Results: 4 APPROVE, 2 ADVISE, 0 BLOCK. Security-minion advised staying within verifiable claims and proper tenant-responsibility framing. Lucy advised on evolution log requirement.

### Phase 4: Execution
Batch 1 (parallel): Task 1 (create SWGDE page) + Task 3 (update nav/llms). Lucy reviewed Task 1 deliverable at gate and raised 3 terminology fixes (title, description, table header) -- all applied. Batch 2: Task 2 (cross-reference updates).

### Phases 5-8
Code review: not applicable (docs-only changes). Tests: not applicable (docs-only). Documentation assessment: 0 additional items (this IS the documentation task).

## Verification

Verification: tests not applicable (docs-only changes). Code review: not applicable (docs-only changes).

## Agent Contributions

### Planning Agents
- **software-docs-minion**: Recommended hybrid table+walkthrough format, section-by-section content strategy, cross-reference placement decisions
- **user-docs-minion**: Defined honest gap framing ("alternative approach" not "limitation"), audience-appropriate tone guidance
- **seo-minion**: Identified "forensically sound" as highest-value keyword, recommended keyword cluster targeting, advised against inline term insertion in existing pages
- **ux-strategy-minion**: Recommended Security & Compliance placement over Guides or new section, identified evaluation-job user journey

### Review Agents
- **security-minion** (ADVISE): Stay within verifiable claims for 3.4, proper tenant-responsibility framing
- **test-minion** (APPROVE): Testing correctly excluded
- **ux-strategy-minion** (APPROVE): Journey coherence confirmed
- **lucy** (ADVISE): Evolution log requirement, title overclaim flagged at gate
- **margo** (APPROVE): Proportional to problem, YAGNI applied correctly
- **seo-minion** (APPROVE): Frontmatter and heading structure adequate

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` -- orchestration

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-27-195426-swgde-docs-alignment/`

Files: phase1-metaplan.md, phase2-software-docs-minion.md, phase2-user-docs-minion.md, phase2-seo-minion.md, phase2-ux-strategy-minion.md, phase3-synthesis.md, phase3.5-security-minion.md, phase3.5-lucy.md, phase3.5-margo.md, phase3.5-seo-minion.md, phase4 prompts

</details>

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update needed -- no API changes |
| Docs site | Updated -- new page + 3 cross-references + nav entry + llms index |
| Landing page | No update needed -- no pricing/capability changes |
| MCP server | No update needed -- no API changes |
| Legal pages | No update needed -- no new data collection or services |
