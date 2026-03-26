# Process: Landing Page Legal Claims and Section Ordering

## TL;DR

Three specialists (ux-strategy, ux-design, product-marketing) planned the landing page section reorder. They agreed unanimously on moving Use Cases above How It Works but split 2-1 on adding a trust bar with legal standard references. Product-marketing won the argument: legal citations serve only 2 of 6 audience segments. The implementation was a single HTML file edit with Lighthouse verification. Six Phase 3.5 reviewers all APPROVED. Total: 1 file changed, performance 100, accessibility 96.

## Phase 1: Meta-Plan

Nefario identified three planning specialists:
- **ux-strategy-minion**: Information hierarchy, cognitive load for dual audiences (developers vs. legal decision-makers)
- **ux-design-minion**: Visual patterns for compliance references (trust badges, strips, shields)
- **product-marketing-minion**: Positioning impact across audience segments

Notable exclusions: frontend-minion (vanilla HTML/CSS, no framework code), seo-minion (scope explicitly excludes SEO metadata), accessibility-minion (deferred to Phase 3.5 review).

One external skill discovered (ops-runbook) — not relevant.

## Phase 2: Specialist Planning

All three agents read the landing page HTML and provided recommendations in parallel.

### Where They Agreed

All three recommended moving Use Cases above How It Works. Their reasoning converged from different angles:
- **ux-strategy**: "How It Works delays the emotional payoff of concrete use cases"
- **ux-design**: "Outcomes section first gives users a reason to care about the mechanism"
- **product-marketing**: "Visitors need to see themselves in the product before they care about the technical approach"

### Where They Disagreed

The trust bar question split the team:

**For trust bar (2 agents)**:
- ux-strategy-minion proposed a lightweight trust bar below the hero: "Ed25519 | RFC 3161 | FRE 901/902 | eIDAS" — progressive disclosure, signal first, detail in the Use Cases card later. Argued legal/compliance decision-makers need to see "vocabulary they recognize" within 5 seconds.
- ux-design-minion proposed a compact trust strip with three horizontal items, each with a shield icon, standard reference, and one-line plain-English descriptor.

**Against trust bar (1 agent)**:
- product-marketing-minion argued legal standard references are segment-specific proof points, not universal value signals. "Only 2 of 6 priority segments respond positively to FRE citations. For journalism, AI agents, OSINT, and compliance segments, legal rule numbers signal 'this is not for me.'" Proposed at most a subtle credibility line below the hero CTAs.

## Phase 3: Synthesis

Nefario sided with product-marketing-minion on the trust bar question. The deciding factors:

1. **Audience math**: FRE/eIDAS citations resonate with 2 of 6 segments. A trust bar with rule numbers creates cognitive overhead for the majority.
2. **The reorder solves the timing problem**: Moving Use Cases above How It Works means the Legal Evidence card (with its FRE/eIDAS references) becomes the first content section after the hero. Legal readers find their vocabulary quickly — no dedicated trust element needed.
3. **Category risk**: product-marketing's argument about narrowing WRL's perceived positioning from "web evidence infrastructure" to "legal compliance tool" was compelling. The trust bar pattern works for universally-recognized credentials (SOC 2, ISO 27001); FRE rule numbers are not universally recognized.

The synthesis also rejected ux-design-minion's proposal to simplify the Legal Evidence card to narrative-only. The detailed bullet list with specific standards is the card's core value for legal professionals.

Final plan: 2 tasks (section reorder + Lighthouse), 0 approval gates.

## Phase 3.5: Architecture Review

Six reviewers (5 mandatory + accessibility-minion discretionary) all returned APPROVE:
- **security-minion**: "No security implications. No new inputs, endpoints, auth changes."
- **test-minion**: "Verification steps adequate. Lighthouse covers accessibility regressions."
- **ux-strategy-minion**: "Section reorder is correct. Trust bar rejection holds up."
- **lucy**: "Plan aligns with issue #207. Scope boundaries respected."
- **margo**: "Zero complexity budget spend. No scope creep."
- **accessibility-minion**: "Both sections are sibling h2 elements — swapping DOM order creates no heading hierarchy violations."

No revision rounds needed.

## Phase 4: Execution

The section reorder was implemented directly (no subagent needed for a well-defined HTML edit):
1. Swapped nav link order in header
2. Moved Use Cases section above How It Works
3. Swapped background classes (white ↔ muted) to maintain visual alternation

Lighthouse verification: Performance 100, Accessibility 96.

## What Was Deliberately Left Alone

- **Hero copy**: No changes. The hero tagline ("Capture any web page and get a signed, timestamped evidence bundle...") already implies legal/evidentiary value without explicit rule references.
- **Legal Evidence card content**: FRE/eIDAS bullet list preserved exactly as-is despite ux-design-minion's simplification proposal.
- **Use case card ordering within the grid**: product-marketing-minion noted that if the primary growth segment is developers (AI Agent Grounding), that card might be better positioned first. This is a separate business strategy decision, explicitly out of scope.

## Where to Read More

- Specialist contributions: `docs/history/nefario-reports/2026-03-26-040037-landing-legal-section-ordering/`
- Synthesis and conflict resolution: `phase3-synthesis.md` in the companion directory
- Reviewer verdicts: `phase3.5-*.md` files in the companion directory
