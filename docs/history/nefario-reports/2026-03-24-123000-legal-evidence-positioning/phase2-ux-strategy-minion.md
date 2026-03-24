## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. The Landing Page Must Not Become a Legal Product Page

The current landing page has a clean, audience-neutral value proposition. The hero says "Web evidence you can prove" -- this works for all four verticals because "evidence" and "proof" are universal concepts. FRE rule numbers, by contrast, are insider language. Putting "FRE 901(b)(9)" in the hero or in a prominent feature section would be the equivalent of putting a database schema on the homepage of a CRM. It signals "this is for lawyers" to the 75% of visitors who are not lawyers, and it signals nothing useful to the lawyers either -- a rule citation without context is not persuasive to legal professionals, who know how to read rules and want to understand *how* the product satisfies them, not just that someone claims it does.

**Recommendation**: The landing page should add legal specificity to the existing Legal Evidence card (lines 155-158) but keep it at the *signal* level, not the *argument* level. The card's job is to say: "We understand your world well enough to name the specific rules that matter to you" and then point to the full argument. The signal is the FRE/eIDAS reference. The argument is the docs guide page.

Concretely, the Legal Evidence card should:
- Name the FRE rules and eIDAS article by number (to signal domain credibility)
- Describe what they mean in one plain sentence each (to make the signal useful to non-lawyers scanning)
- Link to the dedicated docs guide page for the full analysis

This is progressive disclosure applied to audience-specific content: reveal enough to establish credibility and prompt the click, defer the depth to where it can be presented properly.

The hero, the How It Works section, and the other three use-case cards should remain untouched. Adding legal-rule references to any of these sections would break the current audience balance.

#### 2. Legal Professional Journey Mapping

The critical insight is that legal professionals and developers arrive at WRL through fundamentally different channels and evaluate it with fundamentally different criteria. Mapping both journeys reveals where content must live.

**Developer journey (current, well-served)**:
1. Discovery: GitHub, Hacker News, MCP server registry, search for "web capture API"
2. Landing page: scans hero, clicks "Read the docs" or "Get started free"
3. Docs: Getting Started -> first API call within 5 minutes
4. Evaluation: "Does the API do what I need? Is the DX good?"
5. Adoption: starts building

The developer's evaluation is hands-on. They want to *try it*, not *read about it*. The current site serves this journey well.

**Legal professional journey (underserved, R42 target)**:
1. Discovery: Google search for "web page evidence for litigation", "alternative to screenshots for court", "FRE 901 web evidence", peer recommendation, or a verification URL they received
2. First touch: could be landing page OR docs guide page OR a verification URL -- all three are realistic entry points
3. Evaluation: "Does this meet the evidentiary standard I need? Can I defend it to opposing counsel? Is the integrity chain independent?" This is a *reading* evaluation, not a hands-on one
4. Trust calibration: verification page (they want to see the proof chain work)
5. Adoption: convinces their firm's IT or a paralegal to set up the API, or uses the web UI directly

Three things distinguish the legal journey:

**A. Multiple entry points, not a linear funnel.** A lawyer searching "FRE 901 web page authentication" will land on the docs guide page directly, not the landing page. A lawyer who receives a verification URL from opposing counsel will land on the verification page. A lawyer referred by a colleague may land on the landing page. All three entry points need to orient the user and provide a clear path to the next step. The docs guide page *must* work as a standalone entry point -- it cannot assume the user has seen the landing page.

**B. Reading-heavy evaluation, not try-it-first.** A developer's trust comes from "I ran the API call and it worked." A lawyer's trust comes from "I read the methodology and it's sound." The legal evidence guide page is the evaluation step, not a reference doc to consult after adoption. It needs to be written for a reader who is deciding whether to adopt, not a user who has already adopted and needs help.

**C. The proof is the product.** For developers, the API is the product. For lawyers, the verification page is the product -- it's what they'll show the judge. The legal evidence guide should link directly to the public verification page (with a sample capture) so the lawyer can see exactly what opposing counsel or the court will see. This closes the evaluation loop: "Here's the standard, here's how we meet it, here's what the proof looks like."

#### 3. The Docs Guide Page Must Work as a Standalone Entry Point

Because legal professionals are likely to arrive at the docs guide page via search (queries like "web evidence FRE 901 authentication" or "eIDAS qualified timestamp web archiving"), the page needs to be self-contained at the top and reference-rich at the bottom.

Structure recommendation (information architecture, not content):

1. **Opening paragraph**: What WRL is, what it produces, one-sentence value prop. This orients the search-arrival user who has never seen the landing page. Keep it to 2-3 sentences.
2. **Evidence standards section**: FRE 901/902 and eIDAS Article 41(2) with the claims matrix from gru. This is the core content the legal user came for.
3. **How it works (for legal professionals)**: Not a repeat of the landing page "How It Works" -- instead, a methodology description written for someone evaluating evidence admissibility. What is captured, how is it signed, what is the chain of custody, what is independently verifiable. Link to the existing Verification docs page for the cryptographic details.
4. **WRL vs. screenshots + affidavits**: The comparison that makes the product's advantage concrete.
5. **Competitor integrity approaches**: The comparison table, positioned as "how other tools handle evidence integrity" rather than a competitive attack. This naturally follows the WRL-vs-screenshots section because it answers the next question: "OK, but are there other tools that also do this?"
6. **How to use a WRL capture in proceedings**: Brief practical guidance (share the verification URL, download the WACZ, use the CLI for independent verification). Link to Getting Started for API details.
7. **Disclaimer**: Standard "not legal advice" notice.

The competitor comparison table belongs *within* the legal evidence guide, not as a separate page. Reasons:

- The comparison is meaningful primarily in the context of legal evidence evaluation. A developer comparing tools cares about API design, pricing, and DX -- not integrity approach. The table serves the legal reader's evaluation journey.
- A standalone "Compare" page implies WRL has enough competitors and enough differentiation axes to warrant it. For a product at WRL's stage, that risks looking like the company has 12 employees and a marketing department. A comparison section within the evidence guide is honest and contextually appropriate.
- It keeps the docs site navigation lean. The current nav has 8 items. Adding both "Legal Evidence" and "Compare" would be 10 items -- that's getting into territory where Hick's Law starts to hurt scanability.

#### 4. Landing Page Card Update Strategy

The Legal Evidence card (lines 155-158) currently reads:

> Web pages change. Screenshots get challenged. When opposing counsel asks "how do you know this page said that on that date?" -- you need more than a PNG. WRL captures produce cryptographically signed bundles with independent timestamps. The verification link works for anyone, including the court.

This is already strong copy -- it names the user's situation ("opposing counsel asks"), the problem ("you need more than a PNG"), and the solution ("cryptographically signed bundles with independent timestamps"). But it makes no specific evidentiary claims.

The updated card should add one layer of specificity. Not the full argument, but enough to signal credibility. Something like naming FRE 901(b)(9) and eIDAS Article 41(2) by number with a one-line plain-English gloss, then linking to the guide. The card should also link to the docs guide page -- currently none of the four cards have links, which is a missed opportunity for all four verticals, not just legal. Consider adding a "Learn more" link to each card that points to relevant docs content, so the legal card's new link does not look like an inconsistency.

**Important constraint**: The four cards are currently equal in visual weight (all are `<article class="card use-case-card">` with one `<h3>` and one `<p>`). The legal card should not become visually heavier than the others. If the legal card gets a link and more text, the other three should get comparable treatment (even if it's just adding a link) to maintain visual balance. Otherwise, the page reads as "this is a legal product that also does three other things."

#### 5. Competitor Comparison Table: Kano Analysis

The competitor comparison table is an Excitement feature (Kano) for legal evaluators and an Indifferent feature for developers. This classification matters because:

- It should be presented as supplementary evidence within the guide, not given top-level navigation prominence
- It should not consume significant landing page real estate
- It provides disproportionate delight for the legal reader who is actively comparing tools (the "I've been Googling for an hour" user), and zero value for the developer who just wants an API

This reinforces the recommendation to embed it in the guide rather than create a standalone page.

### Proposed Tasks

1. **Update the Legal Evidence use-case card** on the landing page to include FRE/eIDAS rule references by number with plain-English glosses, and add a link to the docs guide page. Keep the card within the existing visual pattern (no structural HTML/CSS changes).

2. **Add "Learn more" links to all four use-case cards**, not just the legal one, to maintain visual parity and provide clear paths to relevant docs content for each vertical. Links should point to the most relevant docs page (legal -> legal evidence guide, compliance -> verification, AI -> MCP server, journalism -> verification or getting started).

3. **Create the Legal Evidence guide page** (`site/content/legal-evidence.md`) with the standalone-entry-point structure described above. Must include an opening orientation paragraph for search-arrival users, the FRE/eIDAS claims mapping (from gru's matrix), the WRL-vs-screenshots comparison, the competitor integrity table, practical guidance, and the disclaimer.

4. **Add the Legal Evidence guide to docs navigation** (`site/_data/site.js`). Position it after Verification in the nav -- this is the natural reading order for a legal evaluator who goes Verification (how the trust model works) -> Legal Evidence (what legal standards it supports). Do not position it first or second; the docs site should still lead with Getting Started and Authentication for the primary developer audience.

5. **Link the guide page to a sample verification URL** so legal evaluators can see exactly what the proof output looks like. If a stable demo capture exists, use its verification URL. If not, flag this as a dependency -- the guide's persuasive power drops significantly without a concrete example of the verification page.

6. **Review meta description and page title for the new guide page** to target legal-professional search queries (e.g., "FRE 901 web page evidence", "web evidence authentication litigation", "eIDAS qualified timestamp web archiving"). This is not full SEO work, but the page title and meta description are the search snippet, and search is the primary discovery channel for the legal audience.

### Risks and Concerns

1. **Visual parity break on the landing page.** If the legal card gets substantially more text or a link while the other three cards stay as-is, the landing page will visually signal "legal product first, everything else second." This undermines the multi-audience positioning. Mitigation: update all four cards in parallel with comparable depth and links.

2. **The guide page as standalone entry point is harder to write.** It must orient a user who has never heard of WRL *and* satisfy a reader who has already scanned the landing page. This is a real writing challenge. If the orientation paragraph is too long, returning visitors find it tedious. If it's too short, search-arrival visitors are lost. Mitigation: keep the orientation to 2-3 sentences that do not repeat the landing page hero -- state what WRL is (an API/service), what it produces (signed WACZ bundles), and what this page covers (legal evidence standards). That's enough to orient without patronizing.

3. **The "not legal advice" disclaimer, if poorly placed, undermines the page.** A large bold disclaimer at the top says "we're not confident in what follows." A hidden disclaimer at the bottom is irresponsible. Mitigation: place the disclaimer at the end of the page in a visually distinct but not alarming format (e.g., a note block, not a warning banner). The content itself should demonstrate confidence through precision; the disclaimer handles the professional-liability concern, not the content-quality concern.

4. **Competitor comparison risks becoming stale.** Competitors change their integrity approaches. Unlike code, a comparison table does not trigger CI failures when it becomes outdated. Mitigation: keep the comparison factual (what standards they use, what format they produce, whether verification is independent) rather than subjective (quality judgments). Factual claims are easier to verify and slower to become wrong.

5. **FRE scope limitation.** FRE applies only to US federal courts. State rules (some states have different evidence rules), international jurisdictions, and administrative proceedings are out of scope. The guide must make this scope explicit without making it feel like a limitation. Framing: "This analysis covers the US Federal Rules of Evidence. Many state rules follow FRE. For other jurisdictions, consult local counsel." One sentence, not a paragraph.

6. **R41 (certification document) not shipped.** The 902(13) claims cannot be made in present tense. The guide must handle this without making WRL look incomplete. Framing: present 901(b)(9) as the primary authentication path (which works today), note that 902(13) self-authentication is on the roadmap, and explain what it will add. Do not dwell on what is missing; lead with what is shipped.

### Additional Agents Needed

None. The four-agent team (gru, product-marketing-minion, user-docs-minion, ux-strategy-minion) covers the necessary perspectives. The key dependency is gru's claims matrix -- nothing downstream should be finalized until that matrix is reviewed and approved. My recommendations here are structural (where content goes, how journeys flow); they do not depend on the specific legal claims, only on the assumption that there *are* specific claims to make.
