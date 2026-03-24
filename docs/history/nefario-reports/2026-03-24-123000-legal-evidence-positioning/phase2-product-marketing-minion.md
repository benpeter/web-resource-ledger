# Domain Plan Contribution: product-marketing-minion

## Recommendations

### 1. Landing Page Structure: Problem-First, Rule-Specific, Audience-Layered

The central question is how to serve two audiences -- legal professionals evaluating WRL for litigation/compliance, and technical users who need to understand the evidence chain -- without alienating either. The answer is a layered approach that keeps the hero universally resonant, concentrates legal specificity in the use-case card, and defers rule-by-rule detail to a dedicated docs page.

#### Hero (lines 101-113): DO NOT add FRE/eIDAS references here.

The current hero -- "Web evidence you can prove." -- is strong. It passes the "who is this for?" test for every target segment: legal, OSINT, compliance, journalism, developers. Adding FRE 901/902 citations to the hero would narrow the aperture to US federal litigation and immediately alienate:

- EU-based compliance teams (different legal framework)
- OSINT researchers and journalists (don't think in FRE terms)
- Technical users evaluating the product (care about the chain, not the rule number)

The hero's job is to communicate the core value proposition in one sentence. It does that. Leave it.

**One change to the hero tagline** (line 105): tighten the language to emphasize independence and standards. Current:

> Capture any web page and get back a signed, timestamped bundle that anyone can independently verify -- no account, no trust required.

Proposed:

> Capture any web page and get a signed, timestamped evidence bundle that anyone can independently verify -- no account, no trust in us required.

Two changes: "evidence bundle" reinforces the legal framing without citing rules. "no trust in us required" is more precise and more provocative -- it positions WRL against competitors who require you to trust their proprietary systems.

#### "Legal Evidence" Use-Case Card (lines 155-158): Upgrade with specific rule references.

This is the right place for FRE/eIDAS specificity. The card already speaks to legal professionals. Visitors self-select by reading it. Non-legal users will scan the heading and move to the next card. The current copy is good but vague -- "cryptographically signed bundles with independent timestamps" is a technical description, not a legal-evidence claim.

**Proposed replacement copy for the Legal Evidence card:**

```
<article class="card use-case-card" aria-labelledby="use-case-legal">
  <h3 id="use-case-legal">Legal Evidence</h3>
  <p>Web pages change. Screenshots get challenged. WRL captures produce signed, timestamped evidence bundles designed to support authentication under the Federal Rules of Evidence:</p>
  <ul class="use-case-details">
    <li><strong>FRE 901(b)(9)</strong> -- automated process producing accurate results, no human in the chain of custody</li>
    <li><strong>FRE 902(14)</strong> -- SHA-256 hash integrity, independently verifiable</li>
    <li><strong>eIDAS Art. 41(2)</strong> -- optional qualified timestamps with legal presumption of accuracy across all EU member states</li>
  </ul>
  <p class="use-case-cta">The verification link works for anyone, including opposing counsel. <a href="https://docs.webresourceledger.com/guides/legal-evidence/">How WRL supports legal admissibility &rarr;</a></p>
</article>
```

Key decisions in this copy:

1. **List format, not paragraph.** Legal professionals scan for specific rule numbers. A bulleted list with bold rule citations is how they consume this information. It also differentiates this card visually from the other prose-based cards, signaling "this is the serious one."

2. **FRE 902(13) is deliberately omitted.** R41 (certification document) has not shipped. Including 902(13) with a "coming soon" note on the landing page is a positioning mistake -- it signals an incomplete product and invites the question "so it doesn't actually do this yet?" Legal professionals are trained to notice qualifications and caveats. A "coming soon" next to a federal rule of evidence citation undermines the authority of the claims next to it. Better to launch with 901(b)(9) and 902(14) -- both fully supported today -- and add 902(13) when R41 ships. The claims will be stronger for being complete.

3. **eIDAS framing as "optional" with benefit.** The word "optional" signals this is a feature you turn on, not a default. The benefit -- "legal presumption of accuracy across all EU member states" -- is the specific, defensible legal claim. R40 is shipped, so this is claimable.

4. **"Designed to support authentication" not "legally admissible."** This is the critical framing distinction from the FRCP research. Admissibility is a judicial determination. "Designed to support authentication" is a factual product claim about what the tool was built to do. The R42 spec calls this out explicitly and the research confirms "FRCP compliant" is meaningless marketing. We should be the ones who refuse to use it.

5. **CTA links to docs guide.** The landing page creates interest; the docs page closes it. Legal professionals who see rule numbers they recognize will want the full treatment. A clear link to the admissibility guide is the conversion path.

#### New Section: "Evidence Standards" -- DO NOT add a separate landing page section.

The R42 spec suggests placing evidence-grade positioning in the "hero or feature section." I recommend against a standalone "Evidence Standards" section on the landing page for two reasons:

- It would be the only section targeting a single audience segment. The landing page currently has four use-case cards serving four segments equally. An "Evidence Standards" section would make legal the dominant positioning, which conflicts with the product's multi-vertical nature.
- The information belongs on the docs site where depth is expected. A landing page section deep enough to be credible to legal professionals would be too long; one shallow enough for the landing page would not be credible.

The use-case card upgrade above is sufficient for the landing page. The detailed treatment goes in the new docs guide.

### 2. Documentation: New "Legal Evidence" Guide Page

This is where the full FRE/eIDAS treatment lives. The docs site is where legal professionals do due diligence. The page should be structured to answer the questions a paralegal, IP attorney, or compliance officer would ask, in the order they would ask them.

**Proposed page structure:**

```
# Legal Evidence

WRL captures are designed to support evidence authentication under the
Federal Rules of Evidence (US) and eIDAS (EU). This page explains how
each component of a WRL capture maps to specific evidentiary requirements.

> **This page is not legal advice.** Admissibility is determined by courts
> on a case-by-case basis. Consult qualified counsel for your jurisdiction
> and circumstances.

## The Problem with Screenshots

[2-3 paragraphs: why screenshots fail as evidence. Cite Vayner (2d Cir.
2014) and Linscheid. Establish the pain point in legal terms. End with:
"WRL was built to address these gaps."]

## How WRL Supports FRE Authentication

### FRE 901(b)(9): Process or System

[Explain how WRL's automated capture process -- server-side headless
browser, no human intervention, SSRF protection, deterministic pipeline --
satisfies the "process that produces accurate results" standard. Be
specific about what the process does and does not include.]

### FRE 902(14): Hash Value Verification

[Explain the SHA-256 hash chain: individual artifact hashes in
datapackage.json, bundle hash over the manifest, Ed25519 signature over
the bundle hash. Show how this satisfies 902(14)'s "identical hash
values" standard. Link to the verification docs page for the technical
walkthrough.]

### FRE 902(13): Self-Authenticating Certification
**Status: Planned**

[Brief explanation of what 902(13) requires -- a written certification
describing the process and attesting to accuracy. Explain that WRL is
building a certification document generator (R41) that will produce a
downloadable PDF suitable for 902(13) submission. Do not promise a date.
Frame as "designed to support" not "will enable."]

## eIDAS Qualified Timestamps (EU)

[Explain eIDAS Article 41(2) and the legal presumption of accuracy.
Explain WRL's dual-timestamp architecture: standard RFC 3161 (DigiCert)
on every capture, qualified RFC 3161 (Sectigo) as account-level opt-in.
Explain what "qualified" means in eIDAS terms and why it matters for EU
proceedings. This section can be assertive -- R40 is shipped.]

## WRL vs. Traditional Approaches

| Approach | Integrity | Time Proof | Verifiable By | Cost |
|----------|-----------|------------|---------------|------|
| Screenshot + affidavit | None (pixel data) | Witness testimony | Only with testimony | $200-500/notarization |
| Wayback Machine | None (institutional trust) | Archive's database | Internet Archive staff | Free |
| PageFreezer/PageVault | Proprietary hash/signing | Vendor's timestamp | Vendor only | $$$, enterprise |
| **WRL** | Ed25519 + SHA-256 (open standard) | RFC 3161 independent TSA | Anyone, no account | Per-capture, usage-based |

[Narrative paragraph below the table explaining the key differentiator:
WRL's verification is independent of WRL. Anyone with the WACZ bundle can
verify the signature and timestamp without contacting WRL or trusting WRL's
servers. This is the "no trust in us required" claim made concrete.]

## Key Case Law References

[Brief citations of Lorraine, Vayner, Gasperini, Tienda -- not full
analyses, just enough for a legal professional to recognize the cases
and see that WRL's approach addresses the authentication gaps these
cases identify. Link to Cornell LII for each rule.]

## Verification for Proceedings

[How to present WRL evidence: share the verification URL, download the
WACZ bundle, run offline verification with the CLI. Explain that offline
verification is available so evidence can be verified in an air-gapped
environment if required by the court.]
```

**Key framing decisions for the docs guide:**

1. **"Designed to support" language throughout.** Never claim admissibility. Always claim the product was designed to satisfy specific elements of specific rules. This is both more accurate and more credible -- legal professionals will respect the precision and distrust anyone who claims "admissible" as a product feature.

2. **Case law citations establish credibility.** Naming Lorraine, Vayner, and Gasperini signals that the product team has done the legal research. A legal professional who sees these citations knows they are talking to people who understand the landscape, not marketers who googled "digital evidence."

3. **The comparison table must include competitor strengths.** PageVault's affidavit service is genuinely valuable -- some courts want it. Wayback Machine's institutional credibility matters. Acknowledging these strengths and positioning WRL's advantage as "independent verifiability" (not "we're better at everything") builds trust. Developer and legal audiences both penalize claims of universal superiority.

4. **902(13) as "Planned" not "Coming Soon."** "Coming soon" on a docs page has no expiration and creates expectation debt. "Planned" with a one-paragraph explanation of what it will contain is honest and does not promise a timeline. When R41 ships, this section gets upgraded to a full treatment.

### 3. Competitor Comparison: "Integrity Approach" Column

The R42 spec calls for an "integrity approach" column in the competitor comparison. This column needs to position WRL's open-standard approach against proprietary formats without being dismissive.

**Proposed framing: "How Verification Works" instead of "Integrity Approach."**

"Integrity approach" is vendor language -- it describes a product attribute. "How verification works" is user language -- it describes the user's experience when they need to verify a capture. This reframes the comparison around the job-to-be-done (verify this evidence) rather than a product feature (integrity mechanism).

**Proposed column values:**

| Service | How Verification Works |
|---------|----------------------|
| WRL | Open standards (Ed25519 + SHA-256 + RFC 3161). Verify with any tool that reads WACZ. No vendor contact needed. |
| Wayback Machine | Trust Internet Archive's database. No cryptographic proof. May require Archive staff testimony. |
| PageFreezer | Proprietary SHA-256 signing. Verification requires PageFreezer's system. |
| Page Vault | Process-based trust. Verification via Page Vault's expert testimony service. |
| Hanzo | Proprietary integrity chain. Verification through Hanzo's platform. |
| Webrecorder | WACZ format (same standard), no cryptographic signing. |
| Manual screenshot | None. Requires witness testimony to authenticate. |

The pattern in this table is clear without being stated: WRL is the only service where verification is independent of the vendor. Every other row ends with "requires [vendor's] system/staff/platform." This is more effective than calling competitors "proprietary" -- it lets the reader draw the conclusion from the evidence.

**Do NOT say:** "Unlike competitors who lock you into proprietary formats..."
**DO say:** "WRL captures can be verified by anyone with the WACZ bundle -- no vendor contact, no account, no proprietary tools needed."

The first version attacks competitors. The second version states WRL's capability and lets the reader make the comparison. Legal professionals and developers both respond better to this pattern.

### 4. Handling R41 (Certification Document) Across Surfaces

**Landing page:** Omit 902(13) entirely. Do not mention "coming soon" or "planned." The three claims that ARE on the card (901(b)(9), 902(14), eIDAS 41(2)) are strong enough. Adding a qualified claim weakens the set.

**Docs guide:** Include 902(13) as a "Planned" section with a brief explanation of what the certification document will contain and how it maps to the rule. This is appropriate for a docs page because the audience is doing due diligence and expects to see the full picture, including what is not yet available.

**Competitor comparison:** Do not include 902(13)/certification as a comparison dimension until R41 ships. Including it as "planned" in a comparison table invites readers to count it as a gap.

### 5. Meta-Description and Structured Data Updates

The landing page meta description (line 7) should be updated to include the evidence positioning:

Current:
> Capture web pages with Ed25519 signatures and RFC 3161 timestamps. Screenshots, rendered HTML, and signed WACZ bundles anyone can independently verify. Free tier available.

Proposed:
> Web evidence you can prove. Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Signed WACZ bundles anyone can independently verify.

Changes: leads with the tagline (consistent branding), adds eIDAS mention for EU search visibility, removes "Free tier available" (pricing belongs on the page, not in SEO meta -- and the pricing page says "Coming soon" which contradicts "available").

The `featureList` in structured data (lines 59-66) should add:
- "RFC 3161 independent timestamps"
- "eIDAS-qualified timestamps (optional)"
- "FRE 901/902 authentication support"

### 6. Copy Principles for All Legal-Evidence Content

These principles should govern all copy produced in this phase:

1. **"Designed to support" not "ensures" or "guarantees."** The product does not make evidence admissible. Courts do. The product is designed so that its output supports the authentication requirements of specific rules.

2. **Rule numbers are proof points, not positioning.** The positioning is "web evidence you can prove." The rule numbers are evidence that the product was built with specific legal frameworks in mind. Lead with the value ("prove what was on a webpage, when"), follow with the mechanism ("Ed25519 + SHA-256 + RFC 3161"), support with the legal mapping ("supports FRE 901(b)(9), 902(14), eIDAS Art. 41(2)").

3. **Comparison through capability, not criticism.** Never describe a competitor's approach as "weak," "outdated," or "inadequate." Describe WRL's approach and let the contrast emerge. "Verification requires no vendor contact" implicitly contrasts with competitors who require it, without naming or criticizing them.

4. **The disclaimer is non-negotiable and must be prominent.** "This is not legal advice. Admissibility is determined by courts on a case-by-case basis." This belongs at the top of the docs guide, not buried in a footer. Placing it prominently signals honesty and legal sophistication -- the opposite of a vendor trying to hide caveats.

5. **All legal references must be to actual rules/articles.** Every FRE or eIDAS citation must reference a real rule number. The gru claims matrix is the authority on what can be claimed. No creative interpretation of rules.

## Proposed Tasks

### T1: Update landing page Legal Evidence use-case card
- Replace current paragraph copy (lines 155-158) with rule-specific list format
- Include FRE 901(b)(9), FRE 902(14), eIDAS Art. 41(2) -- omit 902(13)
- Add link to docs guide page
- Add minimal CSS for `use-case-details` list styling within the card
- Update meta description (line 7) and structured data featureList (lines 59-66)

### T2: Update landing page hero tagline
- "evidence bundle" instead of "bundle"
- "no trust in us required" instead of "no trust required"
- Minor copy change, high positioning impact

### T3: Create "Legal Evidence" docs guide page
- New page at `site/content/legal-evidence.md` (or `guides/legal-evidence.md` depending on docs site structure)
- Structure: disclaimer, problem statement (with case law), FRE 901(b)(9) section, FRE 902(14) section, 902(13) planned section, eIDAS section, comparison table, case law references, verification for proceedings
- Add to docs site navigation
- All claims bounded by gru's claims matrix

### T4: Add "How Verification Works" column to competitor comparison
- Location: docs site (new page or section within existing comparison content)
- Cover: WRL, Wayback Machine, PageFreezer, Page Vault, Hanzo, Webrecorder, manual screenshots
- Frame as user experience ("how do you verify?"), not vendor attribute ("integrity approach")

### T5: Update Open Graph / Twitter meta tags
- Align OG description with updated meta description
- Ensure Twitter card description matches

## Risks and Concerns

### R1: Overclaiming risk with FRE references
FRE 901(b)(9) claims require that WRL's process "produces accurate results." This is a factual claim about the capture pipeline's accuracy. If a capture produces garbled HTML due to a rendering bug, or a consent dialog obscures content, the "accurate results" claim is undermined. The docs guide should explicitly acknowledge capture limitations (JavaScript-heavy sites, consent dialogs, rendering fidelity) and explain how WRL addresses them (dual screenshots, consent dismissal, render quality metadata). Transparency about limitations strengthens the overall claim more than silence.

### R2: eIDAS qualified TSA not yet provisioned for production
R40 code is shipped but the backlog notes that the Sectigo qualified endpoint URL has not been verified and QUALIFIED_TSA_AUTH secrets have not been provisioned for production. Claims about eIDAS qualified timestamps on the landing page must be conditioned on this actually working in production. If production eIDAS is not yet operational, the eIDAS bullet should say "available" only if it is, or be deferred. The implementation team should confirm production readiness before the landing page ships.

### R3: Legal professionals will verify every claim
Unlike developer marketing where vague claims are ignored, legal marketing where vague claims are ignored differently -- lawyers will check whether FRE 901(b)(9) actually says what you claim it says. Every rule reference in the docs guide must link to the actual rule text (Cornell LII). Any paraphrasing must be defensibly accurate. The gru claims matrix must be the accuracy boundary, as specified in the planning question.

### R4: Competitor comparison fairness
If the comparison table mischaracterizes a competitor's capabilities, it damages WRL's credibility with exactly the audience it is trying to reach. Legal professionals are trained to spot unfair characterizations. Every competitor capability described in the table should be verifiable from the competitor's own public documentation. Where information is uncertain ("no public info on cryptographic approach"), say so explicitly.

### R5: 902(13) "Planned" creates expectation
Even on the docs page, mentioning 902(13) as planned creates an implicit promise. If R41 is deprioritized or substantially delayed, the docs page becomes misleading. The "Planned" section should be minimal -- explain what 902(13) is and that WRL intends to support it, but do not describe the certification document in detail until R41 is in active development.

## Additional Agents Needed

### gru (Legal/Research)
Must produce the claims matrix before any copy is written. The matrix should specify:
- Which FRE rules can be cited and with what language
- Which eIDAS articles can be cited given R40's production status
- Whether case law citations (Lorraine, Vayner, Gasperini) can be used in marketing context
- Any claims from the R42 spec that should be modified or withdrawn based on legal analysis
- Exact paraphrasing of rule text that is defensibly accurate

### software-docs-minion
Will implement the docs guide page. Needs the page structure and content from this plan, adapted to the docs site's template system (11ty). Should handle navigation integration, cross-linking to the existing verification page, and ensuring the disclaimer formatting is consistent with docs site patterns.

### ux-strategy-minion (optional, advisory)
The legal evidence card is getting more complex (list format vs. paragraph). If the card needs to accommodate the list without breaking the use-case grid layout, ux-strategy may need to advise on whether all four cards should get a consistent treatment or whether the legal card can be visually distinct.

### frontend-minion (implementation)
Landing page HTML/CSS changes for the updated use-case card and meta tags. The CSS for `use-case-details` within the card grid needs to work within the existing design system constraints.
