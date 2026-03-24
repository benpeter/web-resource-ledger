# Decisions: R42 Legal-Evidence Positioning

## Claims accuracy framework

**Decision**: Use a three-tier claims framework (STRONG / SUPPORTIVE / FUTURE) to classify every legal reference on the page.

- **STRONG**: FRE 902(14) — SHA-256 hash comparison is explicitly cited in the Advisory Committee Notes as the paradigmatic "process of digital identification." eIDAS Art. 41(2) — qualified timestamps carry a statutory presumption of accuracy.
- **SUPPORTIVE**: FRE 901(b)(9) — WRL's automated pipeline supports a process-or-system argument, but the rule says "accurate result" and WRL doesn't guarantee page content accuracy. Changed wording to "verifiable results" on the landing page.
- **FUTURE**: FRE 902(13) — requires R41 (certification document generator), which hasn't shipped. Marked as "Planned" in heading.

**Why**: gru flagged that 901(b)(9) is weaker than it looks — the rule refers to "accurate results" but WRL captures what the page shows, not whether the page is truthful. Overclaiming here would undermine credibility with legal professionals who know the difference.

**Rejected alternative**: Using "accurate results" verbatim from the rule text. Rejected because it could imply WRL guarantees the captured page's content is accurate, which it does not.

## 902(13) omitted from landing page

**Decision**: Omit FRE 902(13) from the landing page entirely. Include it only on the docs guide page, clearly marked "(Planned)" in the heading.

**Why**: R41 (certification document generator) has not shipped. Mentioning 902(13) on the landing page would imply current capability. The docs page can provide nuanced context; the landing page cannot.

## Language discipline

**Decision**: Use "designed to support authentication" throughout. Never "legally admissible," "court-ready," "FRCP compliant," "meets legal requirements," "certified," or "notarized."

**Why**: Admissibility is a court determination, not a product feature. Legal professionals will immediately distrust any product that claims its output is "admissible" — that's not how evidence law works. The product provides technical infrastructure; the legal argument is the attorney's job.

## eIDAS phrasing: "optional" and "supported"

**Decision**: Every eIDAS reference explicitly says "optional" because qualified timestamps are an account-level opt-in. Standard DigiCert timestamps are NOT eIDAS-qualified.

**Why**: gru flagged that conflating standard and qualified timestamps would be a material misrepresentation. Standard timestamps are strong evidence but don't carry the Article 41(2) statutory presumption.

## Competitor comparison: descriptive patterns, not brand names

**Decision**: Use descriptive categories ("web archive services," "enterprise capture platforms," "browser extension tools") instead of naming competitors.

**Why**: Brand names create maintenance burden (competitors rebrand, pivot, shut down) and risk backlash. Descriptive patterns let the reader map to whatever services they know. The comparison focuses on verification mechanisms, not vendors.

## Team adjustment: frontend-minion removed, gru added

**Decision**: Removed frontend-minion from the planning team (HTML text replacement doesn't need a frontend specialist). Added gru for legal accuracy validation.

**Why**: Lucy flagged that the task is content/copy work, not frontend engineering. gru's technology assessment expertise was needed to validate whether the legal claims were accurate and properly hedged.

## Hero tagline changes

**Decision**: Two small changes: "get back a" → "get a" (tighter), "no trust required" → "no trust in us required" (more precise).

**Why**: "no trust required" is vague — trust in what? "no trust in us required" is the actual differentiator: verification doesn't depend on WRL's infrastructure. Positions against proprietary competitors whose verification requires trusting the vendor.
