---
task: "R42: Legal-evidence positioning (landing + docs)"
date: 2026-03-24
source-issue: 142
slug: legal-evidence-positioning
mode: execution
task-count: 3
gate-count: 2
---

## Summary

Updated WRL's landing page and documentation site with precise FRE 901/902 and eIDAS Article 41(2) legal-evidence framing. Replaced vague compliance claims with specific rule references and proper hedging language ("designed to support authentication" not "legally admissible"). Created a new Legal Evidence docs guide page as a standalone entry point for legal professionals.

## Original Prompt

GitHub Issue #142: R42 Legal-evidence positioning (landing + docs). Shift positioning from "tamper-evident web archival" to "web evidence with FRE 901/902 authentication support and eIDAS-qualified timestamps."

## Execution

### Task 1: Landing page update (frontend-minion)
- Hero tagline refined: "evidence bundle" + "no trust in us required"
- Legal Evidence use-case card replaced with FRE rule-specific list
- CTA links added to all 4 use-case cards for visual parity
- Meta/OG descriptions updated, structured data featureList expanded
- Files: `landing/public/index.html` (+21/-5), `landing/public/css/landing.css` (+36)

### Task 2: Legal Evidence docs guide (user-docs-minion)
- New page: `site/content/legal-evidence.md` (131 lines)
- Covers FRE 901(b)(9), 902(14), 902(13) (Planned), eIDAS Art. 41(2)
- Evidence foundation checklist, comparison tables, disclaimer
- Standalone entry point for legal professionals

### Task 3: Docs navigation and cross-references (user-docs-minion)
- Nav entry in `site/_data/site.js`
- Card in `site/content/index.md` What's next grid
- Cross-reference from `site/content/verification.md`

## Key Design Decisions

1. **Claims accuracy framework**: Three-tier classification (STRONG/SUPPORTIVE/FUTURE) for each legal reference. 901(b)(9) classified as SUPPORTIVE -- changed "accurate results" to "verifiable results" to avoid overclaiming.
2. **902(13) omitted from landing page**: R41 (certification document) hasn't shipped. Docs page includes it as "(Planned)" in heading.
3. **Language discipline**: "Designed to support authentication" throughout. Never "legally admissible" or "court-ready."
4. **eIDAS phrasing**: Every reference says "optional" -- only qualified TSA (account opt-in) triggers Art. 41(2), not standard DigiCert timestamps.
5. **Competitor comparison**: Descriptive patterns ("enterprise capture platforms") not brand names.

## Verification

Code review passed (1 APPROVE margo, 1 ADVISE lucy -- docs baseUrl mismatch pre-existing, CTA scope expansion minor). Tests passed (11ty build: 10 pages, 0 errors). (Code review: not applicable for docs-only assessment -- docs ARE the feature.)

## Agent Contributions

### Planning (Phase 2)
- **user-docs-minion**: Page structure, audience-first design, standalone entry point requirements
- **seo-minion**: Meta descriptions with rule numbers, structured data featureList expansion
- **gru**: Claims accuracy matrix (STRONG/SUPPORTIVE/FUTURE), eIDAS production readiness concern

### Review (Phase 3.5)
- **lucy**: APPROVE -- intent alignment verified
- **margo**: APPROVE -- minimal implementation for stated scope
- **security-minion**: APPROVE
- **test-minion**: APPROVE
- **ux-strategy-minion**: ADVISE -- minor notes on journey coherence

### Code Review (Phase 5)
- **lucy**: ADVISE -- 2 non-blocking advisories (docs baseUrl, CTA scope)
- **margo**: APPROVE -- zero complexity cost

## Working Files

Companion directory: `docs/history/nefario-reports/2026-03-24-123000-legal-evidence-positioning/`

Resolves #142
