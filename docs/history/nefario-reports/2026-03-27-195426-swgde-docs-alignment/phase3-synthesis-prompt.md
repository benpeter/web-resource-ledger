MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a final execution plan.

## Original Task
Align WRL's documentation with SWGDE's Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024). Documentation-only task: create a SWGDE compliance mapping page (site/content/swgde-compliance.md) and update existing docs pages with cross-references.

GitHub Issue #259.

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase2-software-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase2-user-docs-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase2-seo-minion.md
- /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase2-ux-strategy-minion.md

## Key consensus across specialists:

1. software-docs-minion: Hybrid format -- summary mapping table + section-by-section walkthrough. Categorize each section as "fully addressed," "addressed differently," or "tenant/examiner responsibility." Place under security/ path. Cross-refs to legal-evidence.md, verification.md, architecture.md.

2. user-docs-minion: Frame automated vs. manual as "alternative approach satisfying same underlying principles." Never use "compliant" or "certified." Map concepts without WRL equivalent to underlying concerns. One-paragraph pointer in legal-evidence.md.

3. seo-minion: "Forensically sound" is highest-value keyword. Target cluster "SWGDE compliant web capture." Weave terms inline into existing pages. TechArticle JSON-LD. Page needs 1500-2500 words of substantive prose.

4. ux-strategy-minion: Place under Security & Compliance at /security/swgde/. The page serves an evaluation job. Cross-link from Legal Evidence and Security overview.

## External Skills Context
No external skills detected relevant to this task.

## Important Context
- The SWGDE standard document itself should be fetched for accurate section references. The PDF is at: https://www.swgde.org/wp-content/uploads/2024/04/2024-03-15-SWGDE-Best-Practices-for-Acquiring-Online-Content-21-F-001-1.1.pdf
- This is docs-only -- no code changes, no tests needed
- Must include legal disclaimer: "This page is for informational purposes only and does not constitute legal advice."
- Must not claim SWGDE certification or endorsement
- Must reference SWGDE 21-F-001 Version 1.1 (3/15/2024) by document number and version

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format with complete, self-contained prompts for each task
5. Ensure every task has a complete, self-contained prompt
6. The plan should have these tasks (adjust as needed):
   - Task 1: Create site/content/security/swgde-compliance.md (the main SWGDE compliance mapping page) -- this is the core deliverable and should have an approval gate
   - Task 2: Update existing docs pages (legal-evidence.md, verification.md, architecture.md) with cross-references and inline SWGDE terminology
   - Task 3: Update site/_data/site.js navigation to include the new page
7. Write your complete delegation plan to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-ubBLmP/swgde-docs-alignment/phase3-synthesis.md
