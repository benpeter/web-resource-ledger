# Process: Segment-Targeted FAQ Expansion

**TL;DR**: Five specialists planned a 12-question FAQ expansion targeting
four market segments. The team agreed on nearly everything -- flat list,
generic TSA naming, hedging standards -- but split on question count (10 vs
12 vs 13), accordion vs static display, question ordering, and two specific
questions. Synthesis chose 12 questions with `<details>`/`<summary>` in
cognitive-progression order, deferred the DMCA question, and included
"defensible web collection." Architecture reviewers approved unanimously
(3 APPROVE, 2 ADVISE). Margo's task-merge recommendation eliminated one
agent spawn. One implementation agent wrote all HTML, JSON-LD, and CSS.
Code review found one dead CSS rule (removed). Three files changed, ~160
lines net addition. No JavaScript, no dependencies.

## Phase 1: Meta-Plan

Nefario identified five planning specialists for this content + SEO +
frontend task:

- **seo-minion**: keyword targets, JSON-LD structure, question count,
  meta description, GEO extraction strategy
- **product-marketing-minion**: segment-specific answer copy, claims
  hedging register, competitive positioning in answers
- **frontend-minion**: `<details>`/`<summary>` implementation plan, CSS
  spec, accessibility assessment, no-JS confirmation
- **ux-strategy-minion**: question ordering, cognitive load assessment,
  accordion vs static display, developer audience fit
- **software-docs-minion**: docs page adequacy as link targets, anchor
  stability, claims consistency risks (TSA naming, FRE overclaims,
  SWGDE terminology)

## Phase 2: Specialist Planning

All five specialists ran in parallel. Key outputs:

**seo-minion** recommended 12 questions, detailed JSON-LD guidelines (plain
text answers, 40-80 words for GEO extraction), and flagged that Google
restricted FAQ rich results in Aug 2023 -- the primary value is now AI
Overview citation, not SERP rich snippets.

**product-marketing-minion** produced 13 questions with a claims hedging
register covering FRE 902(14), SWGDE terminology, and chain of custody
scoping. Flagged the existing overclaim ("meets the technical requirements")
and proposed "provides the technical foundation." Created a full register
mapping every claim to its safest phrasing.

**frontend-minion** provided the complete CSS spec for `<details>`/`<summary>`,
confirmed zero JavaScript needed, confirmed native accessibility (no ARIA
required), estimated 20 lines of CSS additions.

**ux-strategy-minion** argued for 10 questions (dropping defensible capture,
OSINT preservation, audit trail, and DMCA) and static display (no accordion
at 10 items -- "scroll cost < click cost"). Proposed cognitive-progression
ordering: objection handlers first, education, then action questions.

**software-docs-minion** audited every proposed link target page. Found:
(a) Sectigo still referenced in whitepaper despite AlfaSign switch,
(b) FRE 902(14) overclaim in existing FAQ, (c) chain of custody scoped only
to capture-through-signing in docs. Provided heading-to-anchor mappings for
all docs pages but warned about Eleventy slug fragility.

## Phase 3: Synthesis

Five conflicts required resolution:

**Question count (12 vs 10 vs 13)**: Chose 12. ux-strategy's 10 drops
OSINT and defensible collection -- both high-value GTM keywords.
product-marketing's 13th (screenshot admissibility) overlaps too heavily
with the reworded Q1.

**Accordion vs static**: Chose `<details>`/`<summary>`. ux-strategy's static
argument holds at 10 items but at 12, ~1400px of vertical space pushes
the footer CTA far below fold. The `<details>` pattern is zero-JS and
natively accessible.

**Question ordering**: Chose ux-strategy's cognitive progression (objection
-> education -> action) with seo-minion's segment priority as tiebreaker.
Rejected product-marketing's segment clustering (creates implied groupings
contradicting the flat-list consensus).

**DMCA question**: Deferred per product-marketing. No supporting docs page
exists -- the answer would be generic. Replaced with audit trail question.

**Defensible web collection**: Included with product-marketing's phrasing
("collection" not "capture"). "Defensible collection" is the canonical
e-discovery search term.

## Phase 3.5: Architecture Review

Five mandatory reviewers:

| Reviewer | Verdict | Key finding |
|----------|---------|-------------|
| security-minion | APPROVE | No attack surface; JSON-LD is inert data |
| test-minion | APPROVE | Correctly skips tests for CSS/copy changes |
| ux-strategy-minion | APPROVE | Accepted 12-question decision; noted Q4-Q6 educational cluster density |
| lucy | ADVISE | Include verbatim Q3/Q12 answer text in execution prompt |
| margo | ADVISE | Merge Task 2 (CSS) into Task 1 to reduce orchestration overhead |

Both ADVISE recommendations were accepted. Lucy's prevents accidental
answer rewrites. Margo's eliminates one agent spawn for 20 lines of CSS.

## Phase 4: Execution

Single agent invocation (frontend-minion, sonnet) handled all three files:
HTML restructuring, 12 question/answer pairs, JSON-LD expansion, meta
description, sitemap update, and CSS additions. The merged task approach
(Margo's recommendation) avoided a second context load and approval gate.

## Post-Execution Verification

Three reviewers in parallel:

**code-review-minion**: APPROVE. Found one dead CSS rule (`transition:
transform` on `::after` that swaps via `content`, not transform). Removed.
Noted JSON-LD/HTML text divergence on Q2, Q5, Q6 as intentional (JSON-LD
is compressed plain-text summary per design decision).

**lucy**: BLOCK (overridden). Four findings: (1-2) evolution log
incomplete -- these are wrap-up tasks, not implementation bugs. (3) DMCA
question absent -- deliberate planning decision documented in synthesis.
(4) JSON-LD/HTML text divergence -- intentional per the "faithful summary"
design decision. All resolved without code changes.

**margo**: APPROVE. Confirmed proportional implementation. Noted redundant
`margin: 0` / `margin-left: auto` on `.faq__list` as non-blocking.

## Where to read more

- Full specialist contributions: `docs/history/nefario-reports/` (when
  report is copied from scratch directory)
- Conflict resolution rationale: `docs/evolution/0104-segment-faq-landing-page/decisions.md`
- Implementation outcome: `docs/evolution/0104-segment-faq-landing-page/outcome.md`
- GTM Language Gap analysis: referenced in issue #255 motivation section
