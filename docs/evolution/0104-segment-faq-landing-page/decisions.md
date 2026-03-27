# Decisions: Segment-Targeted FAQ Expansion

## Question count: 12

Chose 12 questions (4 existing refined + 8 new) over ux-strategy's 10 and
product-marketing's 13. At 10, we'd lose "defensible web collection" and
the OSINT preservation question -- both high-value keyword targets per the
GTM Language Gap analysis. At 13, the screenshot admissibility question
overlaps too heavily with the reworded Q1. 12 is the SEO-recommended ceiling
for GEO extraction and within the issue spec range (10-12).

## Accordion pattern: `<details>`/`<summary>`

Chose native HTML disclosure elements over static display (ux-strategy
preferred static at 10 items). At 12 items with all answers visible, the
section adds ~1400-1600px of vertical space, pushing the footer CTA below
fold. `<details>`/`<summary>` is zero-JS, natively accessible (keyboard,
screen reader), and keeps the FAQ compact (~600px collapsed). Questions
remain scannable as a list of labels.

Rejected: JS-powered accordion (violates Helix Manifesto), CSS-only toggle
hacks (fragile, inaccessible).

## Question ordering: cognitive progression

Chose ux-strategy's cognitive progression (objection -> education -> action)
with GTM segment priority as tiebreaker within tiers. Q1-Q3 are universal
objection handlers serving all segments. Q4-Q6 are educational concept
questions. Q7-Q10 are action-oriented segment queries. Q11 bridges
compliance/education. Q12 is product-specific evaluation.

Rejected: pure segment clustering (product-marketing -- creates implied
groupings that contradict the flat-list consensus), pure general-first
ordering (seo-minion -- less principled tiebreaking within tiers).

## DMCA takedown question: deferred

Chose to defer "How to collect evidence for DMCA takedowns?" per
product-marketing's recommendation. WRL has no DMCA-specific documentation
or workflow -- the answer would be generic and indistinguishable from the
trademark infringement answer (Q10). Better to add after creating a
DMCA/takedown evidence docs page. Replaced with "What is an audit trail
for web content?" which serves the compliance segment and has a distinct
link target (/verification/).

The issue's scope listed DMCA as a candidate question; 12 questions are
still within the 10-12 acceptance criterion range. All four segments are
represented.

## "Defensible web collection" vs "defensible web capture"

Chose product-marketing's "What is defensible web collection?" over
seo-minion's "What is defensible web capture?". "Defensible collection"
is the canonical e-discovery search term per the GTM Language Gap analysis.
The e-discovery audience searches "defensible collection" not "defensible
capture". The answer bridges to WRL's capture terminology.

## "Screenshots admissible" folded into Q1

Chose to fold the screenshot admissibility angle into Q1 ("Why is a
screenshot not enough for digital evidence?") rather than as a standalone
question. Both seo-minion and product-marketing proposed it standalone, but
Q1 already addresses screenshot weakness. Two adjacent screenshot questions
would create substantial answer overlap. The evidence framing in Q1 captures
the same search terms.

## Docs page links: page-level only, no anchors

Chose to link to docs page roots (e.g., `/legal-evidence/`) without
`#anchor` fragments, despite software-docs-minion providing excellent
anchor targets. Anchors in Eleventy's markdown-it slug generation are
fragile -- heading changes break them silently (scrolls to page top with
no error). No CI safety net exists for anchor drift (deferred). Page-level
links are stable and land users on the correct content.

## JSON-LD answers: faithful summaries, not verbatim copies

Chose JSON-LD answers as plain-text faithful summaries (40-80 words) of
visible HTML answers, not character-identical copies. Visible answers include
link CTAs ("Learn more about...") that don't belong in JSON-LD plain text.
As long as JSON-LD text is a faithful subset with no claims absent from the
visible answer, Google's guidelines are satisfied.

## FRE 902(14) hedging fix

Changed existing FAQ answer from "meet the technical requirements of FRE
902(14)" to "provides the technical foundation" / "support
self-authentication under FRE 902(14)". The docs page is more careful:
902(14) still requires a written certification from a qualified person -- WRL
provides the infrastructure, not the certification.

## Question rephrasing: removed WRL brand name

Reworded Q1 from "How does WRL differ from a screenshot or PDF?" to "Why
is a screenshot not enough for digital evidence?" and Q2 from "Is WRL
evidence admissible in court?" to "Is web capture evidence admissible in
court?". Informational queries perform better without brand names in the
question -- matches how buyers actually search.

## Merged Task 1 and Task 2

Accepted margo's Phase 3.5 ADVISE recommendation to merge the CSS task
into the HTML/content task. The CSS changes are ~20 lines mechanically
determined by the HTML structure. One agent invocation eliminates
orchestration overhead (second agent spawn, second context load).

## Dead CSS transition removed

Code review identified `transition: transform 0.2s ease` on
`.faq__question::after` as dead CSS -- the +/- indicator changes via
`content` swap, not CSS transform. Removed.
