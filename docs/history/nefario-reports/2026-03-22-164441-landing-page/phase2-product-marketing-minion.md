## Domain Plan Contribution: product-marketing-minion

### Positioning Analysis

Before proposing copy, here is the analytical foundation that produced it.

**Competitive Alternatives** (what the target audiences use today):
1. Wayback Machine / Internet Archive -- free, widely known, but no cryptographic proof, no API control, no SLA, captures may be delayed or incomplete
2. Screenshot + timestamp (manual) -- anyone can take a screenshot, but it proves nothing to a third party. No chain of custody.
3. Forensic capture tools (Hunchly, Page Vault, Stillio) -- purpose-built for legal/compliance, but expensive, desktop-bound, no API, no AI agent integration
4. "Build it yourself" with Puppeteer/Playwright -- full control but no signing, no verification infrastructure, no evidence chain
5. Do nothing -- rely on "it was there when I checked" and hope nobody disputes it

**Unique Attributes** (facts, not claims):
- Ed25519-signed WACZ bundles with embedded public key
- RFC 3161 independent timestamps (Sectigo TSA) -- temporal proof from a third party
- Dual screenshots (before/after cookie consent dismissal)
- MCP server for direct AI agent integration
- REST API with async capture lifecycle
- Self-hostable on Cloudflare Workers (your keys, your infrastructure)
- Open-source (Apache 2.0)
- Public verification URL -- anyone can verify, no account needed
- CLI tool for offline verification

**Value Mapping** (attribute -> customer outcome):
- Signed bundles + RFC 3161 -> "Evidence that holds up to scrutiny, not just your word"
- Public verification URL -> "Share proof with anyone -- courts, auditors, editors -- no login required"
- MCP server + REST API -> "Your AI agents can capture and verify evidence programmatically"
- Self-hostable -> "Your captures, your keys, your infrastructure -- full custody"
- Dual screenshots -> "Proves both the consent banner and the content beneath it"

**Target Segments** (ordered by pain acuity):
1. **Legal professionals / litigation support** -- need to prove what a web page said on a specific date. Screenshots are routinely challenged. Evidence must withstand Daubert/admissibility scrutiny.
2. **Compliance and regulatory teams** -- must archive web-facing content for audit. "We checked" is not enough; they need verifiable records with timestamps.
3. **AI agent builders** -- agents that browse the web need to ground their outputs in verifiable sources. "The agent said it saw X" is not evidence. A signed capture is.
4. **Journalists and researchers** -- sources change or disappear. A signed snapshot preserves the source with proof of when it was captured.

**Market Category**: Web evidence preservation service. Not "web archiving" (sets Wayback Machine expectations), not "screenshot tool" (commodity), not "digital forensics platform" (implies desktop software and higher complexity). "Evidence" is the operative word -- it implies proof, not just a copy.

**Core Message**: Web content with cryptographic proof.

This is what people remember when they forget everything else. WRL turns ephemeral web pages into evidence that anyone can independently verify.

---

### Recommendations

#### 1. Hero Section

**Tagline (6 words):**
> Web evidence you can prove.

Rationale: Positions the product around the outcome (provable evidence), not the mechanism (signing, hashing). The word "prove" does the heavy lifting -- it implies both the cryptographic guarantee and the legal/compliance use case. It addresses the core struggle: web content is ephemeral, and claiming "it said X" proves nothing.

Alternative taglines considered and rejected:
- "Capture. Sign. Verify." -- too mechanical, reads like a feature list
- "Proof of what the web said" -- close, but passive
- "Cryptographic proof of web content" -- too technical for the mixed audience
- "The web, on the record" -- clever but vague about what the product does

**Value proposition (one sentence):**
> Capture any web page and get back a signed, timestamped bundle that anyone can independently verify -- no account, no trust required.

Rationale: This sentence covers the three things that matter: what you do (capture), what you get (signed + timestamped bundle), and the differentiator (anyone can verify independently). "No account, no trust required" reinforces that verification is genuinely open, not gated.

**Primary CTA:**
> Read the docs

Rationale: The product is pre-billing, API-first, and developer-oriented. The honest action a visitor can take is to read the documentation and try the API. "Start free" or "Get started" imply a signup flow that does not exist yet. "Read the docs" respects the developer audience and matches the current product state. Links to docs.webresourceledger.com.

**Secondary CTA (optional, smaller):**
> Verify a capture

Rationale: A "show, don't tell" action. Anyone can paste a capture ID and see the verification result. This demonstrates the product's value without requiring commitment. Links to the verification page.

#### 2. How It Works Section

**Section heading:** How it works

Three steps. Each has a short label, one to two sentences, and maps to the actual API lifecycle.

**Step 1: Capture**
> Submit a URL. WRL renders the page in a headless browser, captures a screenshot, the rendered HTML, and HTTP headers -- recording what the page looked like at that moment.

**Step 2: Sign**
> Every artifact is hashed, bundled into a WACZ archive, and signed with Ed25519. An independent RFC 3161 timestamp from a third-party authority anchors the capture to a specific point in time.

**Step 3: Verify**
> Share the verification link with anyone. They can confirm the content has not been altered and the timestamp is authentic -- no account needed, no trust in you required.

Rationale: The three steps map directly to the API flow (POST, poll, GET verify) but are expressed in terms of what happens to the evidence, not the HTTP methods. Step 3 is the differentiator -- it emphasizes that verification is open and trustless.

#### 3. Use Cases Section

**Section heading:** Built for teams who need proof, not promises.

Rationale: This heading reframes the use cases around the common struggle (needing proof) rather than listing industries.

**Legal Evidence**
> Web pages change. Screenshots get challenged. When opposing counsel asks "how do you know this page said that on that date?" -- you need more than a PNG. WRL captures produce cryptographically signed bundles with independent timestamps. The verification link works for anyone, including the court.

**Compliance Archiving**
> Regulatory audits require evidence that your web-facing content met requirements on specific dates. WRL provides timestamped, tamper-evident records of any public web page. Each capture is independently verifiable -- your auditor can check it without trusting your internal systems.

**AI Agent Grounding**
> When an AI agent reports what a web page contains, the claim is only as good as the source. WRL's MCP server and REST API let agents capture pages and produce signed evidence of what they observed. Ground agent outputs in verifiable snapshots, not ephemeral browser sessions.

**Journalism and Research**
> Sources go offline. Pages get edited. WRL preserves the original with cryptographic proof of when it was captured. Share the verification link with editors, fact-checkers, or readers -- the evidence speaks for itself.

#### 4. Pricing Section

**Section heading:** Pricing

**Important framing note:** Billing is not yet implemented (backlog item: "[consider] Billing and quotas -- When monetization actively planned"). The pricing section should be clearly marked as illustrative and designed for easy replacement when billing ships. I recommend a light-touch approach that establishes the tier structure without committing to specific numbers.

**Free tier: "Explore"**
> Get started with the API. Includes rate-limited captures and full verification access. No credit card required.

Rationale: "Explore" signals evaluation/trial without implying a crippled product. "No credit card required" removes friction. The free tier maps to the current state -- rate-limited API access with an API key.

**Pro tier: "Evidence"**
> For teams that need reliable capture volume, priority processing, and extended retention. Usage-based pricing, billed monthly.

Rationale: "Evidence" reinforces the core value proposition in the tier name itself. Usage-based pricing aligns with the API-first model. Details are deliberately vague because billing is not yet designed.

**Enterprise: "On-Premise"**
> Deploy WRL on your own infrastructure. Your keys, your storage, your evidence chain. Custom SLAs and volume pricing available.

Rationale: "On-Premise" (used loosely to include self-hosted cloud) speaks to the self-hostable, open-source nature of WRL. This is a genuine differentiator -- most forensic capture tools are SaaS-only. "Your keys, your storage, your evidence chain" echoes the README language.

**CTA for all tiers:** "Coming soon" badge on Explore and Evidence. "Contact us" on Enterprise.

**Implementation note:** Wrap the pricing section in a clearly identified container (e.g., `data-section="pricing"`) with tier data in a structured format (CSS custom properties or a small JS object) so swapping in real numbers later requires editing one data source, not scattered HTML.

#### 5. Footer

**Footer copy:** Minimal. The brand personality is restraint, not chattiness.

**Elements:**
- Wordmark ("Web Resource Ledger" in the brand font weight)
- Link row: Docs | API Reference | GitHub | Terms | Content Policy
- Single line of body text: "Open source under Apache 2.0. Independently verifiable by design."
- Copyright line: "(c) 2026 Web Resource Ledger"

Rationale: "Independently verifiable by design" is the one-line brand statement that belongs in the footer -- it is the philosophical anchor. The footer should not repeat the value proposition. Links cover the four things a landing page visitor might want next: learn more (docs), build with it (API reference), inspect the code (GitHub), understand the terms (legal).

No newsletter signup, no social media icons, no "trusted by" logos (there is no evidence for that claim yet). Restraint.

---

### Additional Messaging Notes

**Tone calibration:** The copy above is written at the intersection of the brand's institutional register and the developer audience's bullshit detector. Specific choices:

- No superlatives ("best," "fastest," "most secure")
- No vague modifiers ("blazingly," "powerful," "seamless")
- Every claim is backed by a mechanism (Ed25519, RFC 3161, WACZ) or an observable action (share the link, check the verification)
- Technical terms are used when they add precision (WACZ, Ed25519, RFC 3161) but always alongside plain-language outcomes
- The word "evidence" appears throughout -- it is the market category word and the value anchor

**What the copy does NOT promise:**
- Legal admissibility (WRL provides evidence-grade captures; admissibility is a jurisdiction-specific legal determination)
- Completeness of capture (the product captures screenshots, rendered HTML, and headers -- not full HTTP archives)
- Guaranteed uptime or SLA (the product is pre-1.0)

**Messaging hierarchy summary:**

| Layer | Content |
|-------|---------|
| Core message | Web evidence you can prove. |
| Supporting message 1 | Cryptographically signed captures with independent timestamps |
| Supporting message 2 | Open verification -- anyone can check, no account needed |
| Supporting message 3 | API-first with MCP server for AI agent integration |
| Supporting message 4 | Self-hostable, open source, full custody of your evidence |
| Proof: signing | Ed25519 signatures, WACZ bundles, public key archive at /.well-known/signing-keys |
| Proof: timestamps | RFC 3161 timestamps from Sectigo TSA, verifiable against TSA certificate |
| Proof: verification | Public verification URL, CLI offline verification tool (@w-r-l/verify) |
| Proof: openness | Apache 2.0 license, self-hostable on Cloudflare Workers |

---

### Proposed Tasks

1. **Implement hero section** -- Tagline, value proposition, primary CTA ("Read the docs" linking to docs.webresourceledger.com), optional secondary CTA ("Verify a capture" linking to verification page). Use the brand's dark ink-blue palette and restrained typography from the style guide.

2. **Implement how-it-works section** -- Three-step layout (Capture, Sign, Verify) with the copy above. Consider a minimal visual treatment for each step (numbered circles or simple icons in brand colors, not illustrations). Each step should feel like a document annotation, not a marketing graphic.

3. **Implement use cases section** -- Four cards or blocks for Legal, Compliance, AI Agents, Journalism. Copy as provided. Consider using the section heading "Built for teams who need proof, not promises." as an anchor. Cards should use the surface/border tokens from the design system.

4. **Implement pricing section** -- Three tiers (Explore, Evidence, On-Premise) with "Coming soon" badges on the first two and "Contact us" on Enterprise. Structure the tier data for easy future updates. Include a note or footnote: "Pricing is coming. The API is available now."

5. **Implement footer** -- Wordmark, link row, tagline, copyright. No newsletter, no social icons. Restrained.

6. **Copy review pass** -- After implementation, review the rendered page for copy coherence. Check that the messaging hierarchy reads naturally from hero to footer. Ensure no claim is made without a mechanism or proof point nearby.

### Risks and Concerns

1. **Mixed audience tension.** The landing page serves both developers (who want API docs, code examples, and technical specifics) and non-technical audiences (legal, compliance, journalism -- who want outcomes and credibility signals). The copy above leans toward accessible language with technical terms as credibility anchors, but the page design must reinforce this balance. If the layout looks like a developer tool page (dark theme, terminal aesthetic), non-technical visitors will bounce. If it looks like a generic SaaS marketing page, developers will distrust it. The brand's "notarial seal" register should bridge this gap, but it needs deliberate visual execution.

2. **Pricing placeholders risk setting expectations.** Even with "Coming soon" badges, showing three tiers implies a pricing model that may not materialize as shown. If billing ships with a different structure (e.g., single tier, pay-per-capture), the landing page will need a rewrite. Mitigation: keep the pricing section lightweight and clearly labeled as illustrative. An alternative approach: omit pricing entirely and replace with a single "Currently free while in development. API access available now." statement.

3. **"Evidence" claim without legal disclaimers.** The word "evidence" carries legal weight. The copy carefully avoids promising admissibility, but the landing page should include a brief disclaimer (footer or pricing section) noting that WRL provides evidence-grade captures and that legal admissibility depends on jurisdiction and use case. The Terms of Service already cover this, but a landing page visitor may not read the ToS.

4. **Pre-1.0 status.** The README explicitly says "Early development, single-operator deployment. The API is functional and deployed but pre-1.0." The landing page should not hide this. Consider a small status indicator (e.g., "Beta" badge near the logo or in the hero) that is honest about the product's maturity without undermining confidence.

5. **CTA destination.** "Read the docs" sends visitors to docs.webresourceledger.com, which must be live, complete, and functioning well. If the docs site has gaps or broken links, the CTA undermines the landing page's credibility. Verify docs site health before or during this work.

### Additional Agents Needed

None expected.
