# Process: R42 Legal-Evidence Positioning

## TL;DR

Three specialist agents (user-docs-minion, seo-minion, gru) planned the legal-evidence positioning. gru's claims accuracy analysis was the critical contribution -- it classified each legal reference by evidence strength (STRONG/SUPPORTIVE/FUTURE) and caught that FRE 901(b)(9) "accurate result" language would overclaim WRL's capabilities. The implementation used three tasks executed by frontend-minion and user-docs-minion, with all changes being content/CSS only (zero runtime code). Lucy and margo reviewed with 1 APPROVE and 1 ADVISE (no blocking issues). 11ty build confirmed 10 pages render cleanly.

## Team composition

### Planning team (Phase 2)

The initial meta-plan proposed user-docs-minion, seo-minion, frontend-minion, and gru. Lucy reviewed and recommended:

- **Remove frontend-minion**: The task is HTML text replacement and CSS styling, not frontend engineering. A user-docs-minion can handle the HTML changes alongside the content.
- **Keep gru**: Legal accuracy validation is the highest-risk aspect. gru's technology assessment expertise was needed to validate whether FRE/eIDAS claims were accurate.

After team adjustment, the planning team was: **user-docs-minion, seo-minion, gru**.

### Execution team (Phase 4)

- **frontend-minion** (Task 1): Landing page HTML/CSS changes. Despite being removed from planning, it was assigned for execution because the CSS additions needed proper styling attention.
- **user-docs-minion** (Tasks 2, 3): Legal Evidence docs guide page, navigation integration, and cross-references.

### Reviewers (Phase 5)

- **lucy**: ADVISE -- flagged docs baseUrl mismatch (pre-existing) and CTA link scope expansion (minor, justified by visual parity)
- **margo**: APPROVE -- all NITs, clean pass on YAGNI/KISS compliance

## Key specialist arguments

### gru: Claims accuracy matrix

gru produced the most consequential planning artifact -- a three-tier classification of every legal reference:

| Reference | Strength | Reasoning |
|-----------|----------|-----------|
| FRE 902(14) | STRONG | Advisory Committee Notes explicitly cite hash value comparison. WRL's SHA-256 hashes are the textbook use case. |
| eIDAS Art. 41(2) | STRONG | Statutory presumption -- if qualified TSA is used, the law does the heavy lifting. |
| FRE 901(b)(9) | SUPPORTIVE | The rule says "accurate result" but WRL doesn't guarantee page content accuracy. WRL captures what the page shows, not whether it's truthful. Language must be "verifiable results" not "accurate results." |
| FRE 902(13) | FUTURE | Requires certification document generator (R41), not shipped. |

gru also flagged that eIDAS qualified timestamps may not be fully production-verified (Sectigo endpoint URL is a placeholder). Mitigation: all copy uses "optional" and "supported."

### user-docs-minion: Audience-first structure

Argued that the docs page must work as a standalone entry point for legal professionals arriving via search. Key structural decisions:
- WACZ expanded on first use (legal professionals won't know the acronym)
- Evidence foundation checklist as a practical Q&A table separate from the rule analysis
- Disclaimer at bottom (not top -- placing it at top signals defensiveness)

### seo-minion: Search intent alignment

Recommended updating meta descriptions with specific rule numbers (FRE 901, eIDAS) to match legal professional search queries. Structured data featureList expanded to surface evidence-grade claims in rich snippets.

## Conflict resolutions

### "accurate results" vs. "verifiable results"

gru argued against using 901(b)(9)'s literal "accurate result" language because WRL doesn't guarantee page content accuracy. user-docs-minion initially drafted using the rule's exact wording for fidelity. The synthesis sided with gru: legal professionals know the difference between "the process produces accurate results" (a factual claim) and "the process produces verifiable results" (a technical capability). The latter is what WRL actually provides.

### 902(13) scope

user-docs-minion proposed including 902(13) with detailed future-state explanation. margo (in review) would have flagged this as YAGNI. The synthesis limited 902(13) to one paragraph on the docs page (clearly marked "Planned") and excluded it entirely from the landing page.

## Human interventions

This was an autonomous execution (no human at approval gates). Lucy agents handled all gate decisions:

- **Team gate**: Lucy approved after adjusting team (−frontend-minion, no change to gru)
- **Reviewer gate**: Auto-approved (mandatory reviewers only, no discretionary)
- **Task 1 gate**: Lucy approved -- all success criteria met
- **Task 2 gate**: Lucy approved -- verified factual claims against codebase (DigiCert in wrangler.toml, signing-key endpoint in src/index.js, eIDAS shipped in R40)
- **Post-execution**: Selected "Run all"

## Where to read more

- Planning contributions: `docs/history/nefario-reports/` (companion directory for this run)
- Claims accuracy matrix: Phase 2 gru contribution in scratch files
- Evolution log: `docs/evolution/0074-legal-evidence-positioning/`
  - `prompt.md`: Original issue briefing
  - `decisions.md`: Key decisions with rationale and rejected alternatives
  - `outcome.md`: What was produced and what deviated from plan
