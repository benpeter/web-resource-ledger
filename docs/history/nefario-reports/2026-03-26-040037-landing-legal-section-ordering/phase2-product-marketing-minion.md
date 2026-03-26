## Domain Plan Contribution: product-marketing-minion

### Recommendations

#### (a) Legal standard references in the hero: Do not promote them

Legal standard references (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)) should **not** move into the hero or become more prominent at the page level. Here is why, segment by segment:

**For the Legal/E-discovery audience:** These references are powerful proof points, but they are *supporting evidence*, not the core message. The job-to-be-done for a lawyer is "prove what was on a webpage at a specific time in a way that survives a challenge." The FRE references validate that WRL can do this job -- they do not *define* the job. A lawyer scanning the page needs to see "evidence that survives challenges" before they need to see which specific rules it satisfies. The current placement inside the Legal Evidence use case card is correct positioning: the references appear exactly when the legal reader is evaluating whether WRL meets their specific requirements. Moving them higher would front-load specifics before establishing relevance.

**For non-legal audiences (Journalism, AI Agents, Compliance):** FRE rule numbers are opaque jargon. A journalist sees "FRE 901(b)(9)" and thinks "this is not for me." An AI agent developer sees it and assumes the product is a legal niche tool. The GTM plan explicitly identifies six priority segments, only two of which (Legal/E-discovery and Digital Forensics) would respond positively to FRE references. Leading with legal citations narrows perceived audience at the exact moment when the page needs to cast the widest net.

**Recommendation:** Keep legal standard references in the Legal Evidence use case card. Do not surface them in the hero, subhead, or any section header. The hero's job is to communicate the universal value proposition ("prove what was online, when") and let each segment self-select into their use case card for segment-specific proof points.

One exception worth considering: a subtle credibility signal like "Designed for FRE and eIDAS evidence standards" as a small trust badge or fine-print line beneath the hero CTAs could work. It signals legal seriousness to lawyers without requiring non-lawyers to parse rule numbers. But this is a secondary optimization, not a priority change.

#### (b) Risk of leading with legal jargon: Real and measurable

Yes, there is a concrete risk. The GTM plan's Language Gap table already documents it: the landing page's vocabulary does not match what OSINT, compliance, or brand protection segments search for. Adding more legal jargon at the top of the page would widen this gap further.

The specific risk model:

1. **Narrowing effect on perceived audience.** When a product's first impression includes specialized legal citations, visitors who do not identify as "legal users" bounce. The journalism and AI agent segments are particularly vulnerable because their job-to-be-done ("preserve what I saw" / "ground agent claims in evidence") maps to the same product capabilities but uses entirely different language.

2. **SEO signal confusion.** The meta description already mentions "FRE 901/902 evidence authentication support" in the structured data. Promoting legal citations in visible page copy would further weight the page toward legal search intent, potentially at the expense of terms like "forensic web capture," "OSINT capture tool," or "AI agent web evidence" that the GTM plan identifies as underserved.

3. **Category perception risk.** WRL is executing a new-category play ("web evidence infrastructure"). The category is defined by the *outcome* (proof anyone can verify), not by the *compliance framework* it satisfies. Leading with FRE/eIDAS references repositions WRL as a "legal compliance tool" -- a smaller, more competitive category where PageFreezer, Page Vault, and Hanzo are established incumbents with enterprise sales teams.

**Recommendation:** The legal standards should be discoverable, not dominant. The current use case card placement plus a future FAQ section (already in the GTM plan) is the right approach. FAQ entries like "Does WRL meet FRE 901(b)(9) requirements?" let legal searchers find what they need via SEO without imposing that language on the page's primary narrative.

#### (c) Section ordering: Lead with Use Cases, not How It Works

**Move Use Cases above How It Works.** Here is the positioning rationale:

The current order (Hero > How It Works > Use Cases) follows a *product-out* narrative: "Here is what we built, here is how it works, here is who it is for." The problem is that visitors do not care how it works until they believe it solves their problem. The messaging hierarchy should be:

1. **Core message** (Hero): "Web evidence you can prove." -- establishes the value.
2. **"Is this for me?"** (Use Cases): Let each segment see themselves in the product. This is the moment of self-selection where a visitor decides to invest more attention.
3. **"How does it actually work?"** (How It Works): Now that the visitor believes the product addresses their job-to-be-done, the mechanism becomes interesting and credibility-building.

This follows the Jobs-to-be-Done principle: lead with the progress the customer is trying to make, then explain the mechanism that enables it.

**Evidence from the competitive landscape:** PageFreezer, Hanzo, and Page Vault all lead their landing pages with use cases / outcomes before explaining their technical approach. The visitors WRL is competing for are trained to scan for "does this solve my problem" before "how does it work." The "How It Works" section is excellent content -- the three-step Capture/Sign/Verify narrative is clear and compelling -- but it is *credibility content*, not *discovery content*.

**For developer-heavy segments (AI Agents, technical users):** Even developers evaluate "what does this do for me" before "how does it do it." The How It Works section will still appear on the page and in the nav. Developers who want to understand the mechanism first will click "How It Works" in the nav. But the default scroll-through experience should prioritize self-identification over mechanism.

**Proposed section order:** Hero > Use Cases > How It Works > Pricing

**Nav should update accordingly:** Use Cases | How It Works | Pricing | Docs

### Proposed Tasks

1. **Reorder sections: Use Cases above How It Works** -- Move the `#use-cases` section to appear directly after the hero, before `#how-it-works`. Update nav link order to match. Low risk, high impact on conversion for non-technical segments.

2. **Update nav order** -- Change nav from "How It Works | Use Cases | Pricing | Docs" to "Use Cases | How It Works | Pricing | Docs" to match the new section order.

3. **Keep legal references in current position** -- No change to FRE/eIDAS references. They stay in the Legal Evidence use case card where they serve as proof points for the right audience at the right moment.

4. **Consider adding a subtle legal credibility signal below hero CTAs** (optional, lower priority) -- A single line like "Designed for FRE and eIDAS evidence standards" in smaller text below the "No credit card required" hint. This gives legal-segment visitors an early signal without dominating the hero. Should be evaluated after the section reorder ships.

5. **Do not change the hero copy** -- "Web evidence you can prove" and the tagline work well across all segments. The core message is outcome-oriented and segment-neutral. No change needed.

### Risks and Concerns

1. **Section reorder could affect anchor link traffic.** If any external links point to `#how-it-works` or `#use-cases`, the anchors still work regardless of order -- no breakage risk. But monitor analytics for any change in scroll depth or bounce rate after the reorder.

2. **Legal credibility signal (if added) must not overstate.** The FRCP research document is clear: "FRCP compliant" is a marketing term, not a legal standard. Any credibility signal must be defensible. "Designed for FRE and eIDAS evidence standards" is factual -- WRL was designed with these in mind. "FRE compliant" or "Legally admissible" would be overclaims per the Claims Readiness Ladder. The claims document explicitly lists "Court-admissible" as NOT YET CLAIMABLE.

3. **Missing segments on the page.** The GTM plan identifies OSINT/Investigations and Brand Protection as priority segments that are not represented in the current use case cards. The section reorder makes Use Cases more prominent, which amplifies this gap. Adding OSINT and Brand Protection cards should be a fast follow (the GTM plan already flags this as needed). However, this is a separate task from the ordering question.

4. **eIDAS reference accuracy.** The landing page references "eIDAS Art. 41(2)" in the Legal Evidence card. The Claims Readiness Ladder says eIDAS qualified timestamps are "DEFERRED (2027+)" with implementing acts still pending. The current card text says "optional qualified timestamps" which is accurate for the RFC 3161 upgrade path, but the specific article citation implies a level of eIDAS integration that may not yet be shipped. Verify that the eIDAS opt-in feature is actually live before keeping this reference prominent. If it is live (even as an opt-in), the reference is defensible. If not, it should be softened to "eIDAS-ready" or moved to a roadmap context.

### Additional Agents Needed

- **UX strategy review** -- The section reorder is a positioning decision, but there may be UX considerations (scroll depth, visual rhythm of alternating white/muted sections, CTA placement relative to the fold) that a UX specialist should evaluate. The current white/muted alternation pattern breaks if Use Cases (muted) follows the hero directly without a white section between them.

- **SEO review** -- The meta description and structured data reference FRE 901/902. Keeping legal terms in metadata while removing them from visible above-the-fold copy is a deliberate SEO strategy (target legal search intent in metadata, keep page copy segment-neutral). An SEO-aware agent should verify this is optimal and check whether the heading hierarchy change (Use Cases h2 now appearing before How It Works h2) has any crawl/ranking implications.
