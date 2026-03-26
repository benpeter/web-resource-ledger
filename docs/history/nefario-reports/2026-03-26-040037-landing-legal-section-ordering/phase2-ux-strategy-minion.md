## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### (a) Legal standard references: trust signals near hero vs. current placement

**Recommendation: Do NOT move the legal references into or immediately adjacent to the hero. Instead, add a lightweight trust bar between hero and How It Works, and keep the detailed legal references in Use Cases.**

Rationale by audience segment:

**Decision-makers (legal counsel, compliance officers)** -- These users scan for credibility markers early. They need to know within 5 seconds that this product speaks their language. But they do not need the full FRE/eIDAS citations in the hero. What they need is a trust signal -- a compressed indicator that this product is built for evidentiary standards. The full citations are the proof; the trust signal is the promise.

**Technical integrators (developers, DevOps)** -- Front-loading legal citations creates cognitive overload for this audience. They satisfice on "is this technically sound?" and will bounce if the first screen reads like a legal brief. They need the hero to say "cryptographic proof" (which it does well), not "FRE 901(b)(9)."

**The solution is a trust bar** -- a single horizontal strip of 3-4 compact badges or phrases placed between the hero and How It Works. Think: `Ed25519 Signatures | RFC 3161 Timestamps | FRE 901/902 Compatible | eIDAS Qualified`. No explanations, no bullet points -- just the names. This serves dual duty:

- Legal/compliance decision-makers see the vocabulary they were scanning for and know they are in the right place. Their emotional response: "these people understand my world." This keeps them scrolling.
- Technical integrators register the standards as credibility markers without having to parse legal context. Their reaction: "serious cryptography, not snake oil."

The detailed citations (FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2)) stay in the Legal Evidence use case card where they currently live. That card is doing excellent work -- it explains *what each standard means for the user*. Moving those explanations to the hero would strip them of the context that makes them useful (the contrast with "screenshots get challenged").

This follows progressive disclosure: trust signal early (recognition), detailed explanation later (recall). The trust bar is a Kano "must-be" for the legal audience -- its absence means they have to scroll past How It Works to find evidence the product is legally relevant. Its presence costs zero cognitive load for the technical audience (they skip it as "badges").

#### (b) Section ordering: How It Works placement

**Recommendation: Move Use Cases above How It Works. New order: Hero > Trust Bar > Use Cases > How It Works > Pricing.**

Rationale:

The current order (Hero > How It Works > Use Cases) follows a logical/pedagogical structure: here's what it is, here's how it works, here's who it's for. But landing pages are not textbooks. Users satisfice -- they need to find their reason to care before they invest attention in mechanism.

**Use Cases answer "why should I care?" How It Works answers "how does it work?"** The JTBD framework makes this clear:

- A compliance officer's job: "When I face an audit, I want timestamped evidence of our web content, so I can prove compliance on specific dates."
- A litigation attorney's job: "When opposing counsel challenges a screenshot, I want evidence that meets FRE authentication standards, so it is admissible."
- A developer's job: "When I need to capture web state programmatically, I want a reliable API, so I can integrate it into my workflow."

All three jobs are articulated in Use Cases. None are articulated in How It Works. The three-step process (Capture, Sign, Verify) is mechanism -- it answers "how" after the user already cares about "why."

**For decision-makers**: They are buying outcomes, not processes. "Signed, timestamped evidence bundles designed to support authentication under federal and EU evidence standards" is the sentence that gets them to schedule a demo. That sentence is currently below the fold, behind a section they may not read carefully. Moving Use Cases up means the first content they engage with after the hero speaks directly to their job.

**For technical integrators**: They care about mechanism, but only after they know the product solves a real problem. A developer scanning this page will see the use case cards as "this product does something meaningful" and then read How It Works as "and here's how they pull it off technically." This is a stronger persuasion sequence.

**Heuristic support**: Nielsen's "match between system and the real world" -- users think in terms of problems they have, not processes they don't yet understand. Krug's satisficing principle -- users will grab the first thing that resonates with their need and skip the rest. Use Cases are the resonance point.

**One caveat**: The How It Works section is well-written and concise (3 steps, clean). It does not need to be removed or hidden. It just needs to follow the motivation, not precede it. The ordered list format (1-2-3) will feel even more satisfying after the user already understands why they want this product.

### Proposed Tasks

1. **Add trust bar between hero and first content section** -- A horizontal strip of 3-4 compact standard/technology references (Ed25519, RFC 3161, FRE 901/902, eIDAS). No explanations, just names. Visually understated -- muted text, small type, horizontal layout. This is a recognition aid, not a content section.

2. **Reorder sections: Use Cases before How It Works** -- Move the Use Cases section above How It Works. Update the nav anchor order to match (Use Cases, How It Works, Pricing, Docs). The nav link text and section content remain unchanged.

3. **Update nav link order** -- The header nav currently reads "How It Works | Use Cases | Pricing | Docs". After reordering sections, update to "Use Cases | How It Works | Pricing | Docs" so the nav matches the page flow.

4. **Keep legal citations in the Legal Evidence card unchanged** -- The current FRE/eIDAS detail in the Legal Evidence use case card is well-structured and should not be duplicated, abbreviated, or moved. The trust bar and the card serve different cognitive functions (recognition vs. comprehension).

### Risks and Concerns

1. **Trust bar could feel like empty badging** -- If the trust bar has too many items or uses logos/shields, it risks looking like the "as seen on" strips that users have learned to distrust. Keep it text-only, 3-4 items max, with no visual embellishment beyond typography. The restraint itself communicates confidence.

2. **Section reorder may break existing link shares** -- If anyone has shared links to `#how-it-works` or `#use-cases`, the anchors will still work (they are ID-based, not position-dependent). No risk here, but worth noting that bookmarks and anchor links are stable.

3. **Decision-maker vs. integrator tension on Use Cases card order** -- The four use case cards are currently ordered: Legal Evidence, Compliance, AI Agent, Journalism. For the legal/compliance audience, Legal Evidence first is correct. But if the primary growth segment is developers (AI Agent Grounding), consider whether that card should be first. This is a business strategy question, not a UX question -- the information hierarchy should reflect which audience the business is prioritizing. Current order (legal first) is correct if the primary value proposition is evidentiary trust.

4. **Cognitive load of Use Cases section** -- The Legal Evidence card is significantly denser than the other three (it has a bullet list with bold references). After moving Use Cases up, this card becomes one of the first things users read. The density is justified by the audience it serves, but if analytics show high bounce rates from this section, consider whether the card needs a "summary line + expandable detail" treatment. Do not pre-optimize -- measure first.

### Additional Agents Needed

- **ux-design-minion** -- To design the trust bar's visual treatment (typography scale, spacing, color, layout at different breakpoints). The trust bar must feel like a natural part of the page flow, not a bolted-on element.
- **frontend-minion** -- To implement the section reorder and trust bar HTML/CSS. Straightforward work but the trust bar needs responsive behavior (likely wrapping on mobile).
- **copywriting-minion** (if available) -- The trust bar items need exact phrasing. "FRE 901/902 Compatible" vs. "Federal Rules of Evidence" vs. "US & EU Evidence Standards" -- the word choice matters for both audiences. The current page copy is strong; this is a small but consequential detail.
