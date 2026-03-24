# Phase 3: Synthesis -- Legal-Evidence Positioning (R42)

## Delegation Plan

**Team name**: legal-evidence-positioning
**Description**: Update WRL's landing page and docs with precise FRE 901/902 and eIDAS legal-evidence framing. Landing page copy update, new "Legal Evidence" docs guide page, competitor integrity comparison, and cross-references.

### Task 1: Update landing page (hero tagline, Legal Evidence card, meta tags, structured data)

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The landing page is the primary public-facing surface. Legal claim language is hard to reverse once published -- incorrect framing propagates into search results, link previews, and cached pages. Multiple downstream tasks (docs guide) must be consistent with the claims made here.
- **Gate rationale**: |
    Chosen: Upgrade the Legal Evidence use-case card with FRE rule numbers in list format; add "Learn more" links to ALL four cards for visual parity; minor hero tagline tightening; update meta/OG/structured data
    Over: (1) Adding a separate "Evidence Standards" section to the landing page (rejected: breaks multi-audience balance, makes legal the dominant positioning); (2) Adding FRE references to the hero (rejected: narrows aperture to US litigation, alienates 75% of visitors)
    Why: The card is where legal professionals self-select. Rule numbers signal domain credibility without dominating the page. All four cards getting links maintains visual balance.
- **Prompt**: |
    ## Task: Update WRL landing page with legal-evidence positioning

    You are updating the WRL landing page at `landing/public/index.html` with
    precise legal-evidence framing. This is a static HTML file with no JS framework.

    ### Changes required

    **1. Hero tagline (line 105)** -- Two small wording changes:

    Current:
    ```
    Capture any web page and get back a signed, timestamped bundle that anyone can independently verify -- no account, no trust required.
    ```

    Change to:
    ```
    Capture any web page and get a signed, timestamped evidence bundle that anyone can independently verify -- no account, no trust in us required.
    ```

    Changes: "get back a" -> "get a" (tighter), "bundle" -> "evidence bundle"
    (reinforces evidence framing), "no trust required" -> "no trust in us required"
    (more precise, positions against proprietary competitors).

    **2. Legal Evidence use-case card (lines 155-158)** -- Replace the existing
    card content with a rule-specific list format:

    ```html
    <article class="card use-case-card" aria-labelledby="use-case-legal">
      <h3 id="use-case-legal">Legal Evidence</h3>
      <p>Screenshots get challenged. WRL captures produce signed, timestamped
      evidence bundles designed to support authentication under federal and
      EU evidence standards:</p>
      <ul class="use-case-details">
        <li><strong>FRE 901(b)(9)</strong> -- process producing verifiable results, no human in the chain of custody</li>
        <li><strong>FRE 902(14)</strong> -- SHA-256 hash integrity as the digital identification process</li>
        <li><strong>eIDAS Art. 41(2)</strong> -- optional qualified timestamps with legal presumption of accuracy across all EU member states</li>
      </ul>
      <p class="use-case-cta"><a href="https://docs.webresourceledger.com/legal-evidence/">How WRL supports evidence authentication &rarr;</a></p>
    </article>
    ```

    IMPORTANT language rules for the Legal Evidence card:
    - Use "designed to support authentication" NOT "legally admissible" or "court-ready"
    - Use "process producing verifiable results" NOT "accurate results" for 901(b)(9)
      (avoids implying WRL self-certifies accuracy)
    - Do NOT mention FRE 902(13) -- the certification document (R41) has not shipped
    - Do NOT use "FRCP compliant" or "meets legal requirements"
    - The eIDAS bullet must say "optional" because qualified timestamps are an
      account-level opt-in feature

    **3. Add "Learn more" links to the OTHER THREE use-case cards** to maintain
    visual parity with the legal card's new link. Add a similar `<p class="use-case-cta">`
    to each:

    - Compliance Archiving: link to `https://docs.webresourceledger.com/verification/`
      with text "How verification works &rarr;"
    - AI Agent Grounding: link to `https://docs.webresourceledger.com/mcp/`
      with text "MCP server documentation &rarr;"
    - Journalism and Research: link to `https://docs.webresourceledger.com/verification/`
      with text "How verification works &rarr;"

    **4. Add CSS for the new list and CTA elements.** In `landing/public/css/landing.css`,
    add styles for `.use-case-details` and `.use-case-cta` after the existing
    `.use-case-card p` rule (around line 367). The list should:
    - Have no bullet markers (list-style: none) -- the bold rule numbers serve as markers
    - Use compact spacing (margin-bottom on li items)
    - Use the same muted color as card paragraph text
    - The CTA paragraph should be smaller font size and have top margin to separate
      from card body

    **5. Meta description (line 7)** -- Update to:
    ```
    Web evidence you can prove. Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Signed WACZ bundles anyone can independently verify.
    ```

    **6. OG description (line 15)** -- Update to match the new meta description
    (without the tagline lead-in):
    ```
    Capture web pages with Ed25519 signatures, RFC 3161 timestamps, and optional eIDAS-qualified timestamps. Signed WACZ bundles anyone can independently verify.
    ```

    **7. Structured data featureList (lines 59-66)** -- Add three items to the
    existing array:
    - "RFC 3161 independent timestamps"
    - "eIDAS-qualified timestamps (optional)"
    - "FRE 901/902 evidence authentication support"

    ### What NOT to do
    - Do NOT add a separate "Evidence Standards" section to the landing page
    - Do NOT add FRE/eIDAS references to the hero heading
    - Do NOT touch the "How It Works" section or the pricing section
    - Do NOT mention FRE 902(13) anywhere
    - Do NOT use the phrases "legally admissible", "court-ready", "FRCP compliant",
      "meets legal requirements", "certified", or "notarized"
    - Do NOT change the hero heading ("Web evidence you can prove.")

    ### Deliverables
    - Modified `landing/public/index.html`
    - Modified `landing/public/css/landing.css`

    ### Success criteria
    - Legal Evidence card includes FRE 901(b)(9), 902(14), and eIDAS Art. 41(2)
      in list format with proper hedging language
    - All four use-case cards have "Learn more" links
    - Meta/OG descriptions updated with eIDAS mention
    - Structured data featureList includes new items
    - No overclaiming language anywhere on the page
    - FRE 902(13) does NOT appear on the page
- **Deliverables**: Modified `landing/public/index.html`, modified `landing/public/css/landing.css`
- **Success criteria**: Legal Evidence card uses precise rule references with hedging language; all four cards have links; meta/OG/structured data updated; no overclaiming; 902(13) absent

### Task 2: Create "Legal Evidence" docs guide page

- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This page contains specific legal rule references and claims about WRL's capabilities. Inaccurate framing could create legal liability. The page also serves as a standalone entry point for search-arriving legal professionals, so its structure determines whether WRL converts this audience. High blast radius: the landing page links to it, verification.md cross-references it, and the Getting Started page will reference it.
- **Gate rationale**: |
    Chosen: Single page with anchor sections, following existing docs pattern (flat nav, no sub-pages); disclaimer at bottom as styled blockquote; competitor comparison embedded in guide (not standalone)
    Over: (1) Multi-page hierarchy with sub-pages per rule (rejected: breaks existing flat nav pattern, fragments the evaluation reading flow); (2) Standalone comparison page (rejected: looks like marketing, adds nav clutter, comparison is meaningful only in legal-evidence context); (3) Disclaimer at top of page (rejected: signals defensiveness before reader has context)
    Why: Legal professionals evaluate by reading one complete argument. Single page with anchors supports both top-to-bottom reading and direct-link sharing of specific sections. Pattern matches all existing docs pages.
- **Prompt**: |
    ## Task: Create the "Legal Evidence" docs guide page

    You are creating a new documentation page at `site/content/legal-evidence.md`
    for the WRL docs site. This page explains how WRL captures map to specific
    legal evidence standards (FRE and eIDAS).

    ### Audience

    The primary audience is legal professionals (paralegals, IP attorneys,
    compliance officers) evaluating WRL for litigation or compliance use.
    Secondary audience is developers who need legal context for what they are
    building with WRL.

    **Critical**: This page must work as a standalone entry point. Legal
    professionals will arrive via search queries like "FRE 901 web page evidence"
    or "eIDAS qualified timestamp web archiving". They may never have seen the
    landing page. The opening paragraph must orient them: what WRL is (a capture
    API/service), what it produces (signed WACZ bundles), and what this page covers.

    ### File structure

    Use the same frontmatter pattern as other docs pages:

    ```yaml
    ---
    layout: layouts/doc.njk
    title: Legal Evidence
    description: How WRL captures map to FRE 901/902 authentication requirements and eIDAS Article 41(2) qualified timestamps.
    ---
    ```

    ### Section outline (follow this order)

    #### 1. Opening (2-3 sentences)
    What WRL is, what it produces, what this page covers. Do NOT repeat the
    landing page hero. Keep it factual: "WRL captures web pages and produces
    cryptographically signed, independently timestamped evidence bundles.
    This guide explains how those bundles map to specific legal standards
    for evidence authentication."

    #### 2. What a WRL capture proves
    Brief summary of what the evidence chain establishes: existence,
    integrity, and timing of web content at a specific moment. Frame in
    evidence language, not crypto language. Link to the
    [Verification](/verification/) page for the full trust model rather
    than duplicating it. Use phrasing like: "For the complete cryptographic
    trust model, see [Verification](/verification/)."

    #### 3. Federal Rules of Evidence: Authenticating web evidence
    Brief intro explaining that electronically stored information must be
    authenticated under Rule 901(b) before admission.

    ##### Rule 901(b)(9): Process or system
    Map WRL's automated capture process to this rule. Key points:
    - WRL's capture pipeline (headless browser, no human intervention,
      deterministic process) is the "process or system"
    - Ed25519 signatures prove the output has not been modified
    - RFC 3161 timestamps prove temporal accuracy via independent authority
    - Public verification enables any party to confirm the results
    - IMPORTANT framing: "WRL provides the technical foundation that
      supports a 901(b)(9) authentication argument." Do NOT say "satisfies"
      or "meets" the rule. The proponent still needs to describe the system
      to the court.

    ##### Rule 902(14): Data authenticated by digital identification
    Map WRL's SHA-256 hash chain to this rule. Key points:
    - SHA-256 hash comparison is the canonical "process of digital identification"
      contemplated by 902(14)
    - The Advisory Committee Notes explicitly cite hash value comparison
    - WRL computes and records SHA-256 hashes for every artifact
    - Any party can recompute hashes and compare
    - IMPORTANT: 902(14) still requires a certification from a qualified
      person, but WRL provides the infrastructure that makes the
      certification straightforward

    ##### Rule 902(13): Self-authenticating certification (planned)
    Brief explanation. Key points:
    - 902(13) requires a written certification from a qualified person
    - WRL is building a certification document generator (the technical
      infrastructure exists; the document template is planned)
    - Mark clearly as **Planned** -- do not imply this is available today
    - Keep this section SHORT (one paragraph). Do not describe the
      certification document in detail.
    - Do NOT use "coming soon" -- use "planned"

    ##### Evidence foundation checklist
    A table with two columns: "What opposing counsel will ask" and
    "How WRL addresses it". Rows:
    - Who captured it? -> Automated process, no human intervention
    - When was it captured? -> RFC 3161 timestamp from independent TSA
    - Has it been altered? -> SHA-256 hashes + Ed25519 signature
    - How do I verify independently? -> Public verification URL, CLI, or API
    - Is the process reliable? -> Open-source verifier, deterministic pipeline

    #### 4. eIDAS: Qualified electronic timestamps
    Explain eIDAS Article 41(2) and the legal presumption. Key points:
    - Quote or closely paraphrase Art. 41(2): "presumption of the accuracy
      of the date and the time it indicates and the integrity of the data
      to which the date and time are bound"
    - Explain this is a rebuttable presumption (shifts burden of proof)
    - Explain WRL's dual-timestamp architecture: standard RFC 3161
      (DigiCert, on every capture) vs. qualified RFC 3161 (account-level
      opt-in)
    - Art. 41(3): qualified timestamps recognized across all EU Member States
    - IMPORTANT: Standard (DigiCert) timestamps are NOT eIDAS-qualified.
      Only the optional qualified timestamp from a Qualified Trust Service
      Provider triggers Art. 41(2). Be precise about this distinction.

    Brief EU vs. US comparison (can be a small table):
    - US (FRE): authentication via judge as gatekeeper
    - EU (eIDAS): legal presumption via qualified trust services

    #### 5. WRL vs. traditional evidence preservation
    Comparison table. Columns: Approach, Integrity Proof, Time Proof,
    Independent Verification, Scalability.

    Rows:
    - Screenshot + affidavit: None (pixels editable) | Witness testimony |
      Only with testimony | Manual
    - Wayback Machine: Institutional trust | Archive's database |
      Internet Archive staff | Free but limited
    - WRL: Ed25519 + SHA-256 (open standard) | RFC 3161 independent TSA |
      Anyone, no account | API, per-capture

    After the table, a brief paragraph explaining the key differentiator:
    WRL's verification is independent of WRL. Anyone with the WACZ bundle
    can verify without contacting WRL.

    Optional `<details>` block: "Why screenshots and affidavits fall short"
    with expanded discussion.

    #### 6. How verification compares across capture services
    Table comparing how verification works across different approaches.
    Column header: "How Verification Works" (NOT "Integrity Approach").

    Use DESCRIPTIVE PATTERNS, not competitor brand names:
    - Open-standard signed archives (WRL)
    - Web archive services (Wayback Machine pattern)
    - Enterprise capture platforms (PageFreezer/Page Vault pattern)
    - Browser extension tools
    - Manual screenshots

    For each, describe: what standards are used, whether verification is
    independent of the vendor, and whether the format is open.

    IMPORTANT rules for this table:
    - Do NOT name competitors by brand name
    - Do NOT say competitors are "weak" or "inadequate"
    - Frame as "how verification works" for each approach
    - Let the reader draw conclusions from the facts
    - Where you are uncertain about a competitor's approach, say "varies by vendor"

    #### 7. Disclaimer (bottom of page)
    Styled as a blockquote (use `>` markdown prefix). Content:

    > **This page is for informational purposes only and does not constitute
    > legal advice.** The applicability of any legal standard depends on your
    > jurisdiction, the specific proceeding, and the rules of the tribunal.
    > Consult qualified legal counsel to evaluate how WRL evidence applies
    > to your matter.

    Do NOT place the disclaimer at the top. Do NOT use `<details>` for it.

    ### Writing rules (non-negotiable)

    1. **"Designed to support" not "satisfies" or "meets"** -- WRL does not
       make evidence admissible. Courts do. The product is designed so its
       output supports specific authentication requirements.

    2. **Every FRE/eIDAS reference must cite a real rule number.** Do not
       invent or misstate rule numbers. The actual rules are:
       - FRE 901(b)(9): "Evidence About a Process or System"
       - FRE 902(13): "Certified Records Generated by an Electronic Process or System"
       - FRE 902(14): "Certified Data Copied from an Electronic Device, Storage Medium, or File"
       - eIDAS Article 41(1), 41(2), 41(3): "Legal effects of electronic time stamps"

    3. **No marketing language.** No superlatives, no "industry-leading",
       no "best-in-class". The facts are sufficient.

    4. **Cross-reference verification.md, do NOT duplicate it.** Link to
       the Verification page for trust model details. Use phrases like
       "see [Verification](/verification/) for the full trust model."

    5. **FRE 902(13) must be clearly marked as Planned.** One short paragraph.
       Do not describe what the certification document will contain in detail.

    6. **Distinguish standard vs. qualified timestamps.** DigiCert timestamps
       are standard RFC 3161, not eIDAS-qualified. Only the opt-in qualified
       TSA triggers eIDAS Art. 41(2).

    7. **No case law citations.** While case law (Lorraine, Vayner, etc.)
       would add credibility, verifying the accuracy of case law summaries
       is beyond our scope. Omit case law to avoid mischaracterization.
       The FRE/eIDAS rule references are sufficient.

    ### What NOT to do
    - Do NOT create sub-pages or nested navigation
    - Do NOT duplicate the verification trust model (link to it)
    - Do NOT name competitors by brand name in the comparison
    - Do NOT claim WRL evidence is "admissible" or "court-ready"
    - Do NOT mention 902(13) as "coming soon" -- use "planned"
    - Do NOT place the disclaimer at the top of the page
    - Do NOT add case law citations (Lorraine, Vayner, etc.)

    ### Deliverables
    - New file: `site/content/legal-evidence.md`

    ### Success criteria
    - Page follows `layout: layouts/doc.njk` frontmatter pattern
    - All FRE/eIDAS references are to real rules with proper hedging language
    - 902(13) clearly marked as "Planned" (not "coming soon")
    - Competitor comparison uses descriptive patterns, not brand names
    - Disclaimer at bottom as blockquote
    - Cross-references verification.md without duplicating it
    - Works as standalone entry point (opening paragraph orients new visitors)
- **Deliverables**: New file `site/content/legal-evidence.md`
- **Success criteria**: Accurate rule references with hedging language; standalone entry point; 902(13) as "Planned"; no brand names in competitor comparison; bottom disclaimer

### Task 3: Update docs navigation and cross-references

- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update docs navigation and cross-references for Legal Evidence page

    Three files need small updates to integrate the new Legal Evidence page
    into the docs site.

    ### 1. Update `site/_data/site.js`

    Add the Legal Evidence page to the nav array. Position it after
    Verification and before Batch Captures:

    ```js
    export default {
      title: "WRL Documentation",
      baseUrl: "https://webresourceledger.com",
      nav: [
        { title: "Getting Started", url: "/" },
        { title: "Authentication", url: "/authentication/" },
        { title: "Verification", url: "/verification/" },
        { title: "Legal Evidence", url: "/legal-evidence/" },  // NEW
        { title: "Batch Captures", url: "/batch/" },
        { title: "Limits & Quotas", url: "/limits/" },
        { title: "Webhooks", url: "/webhooks/" },
        { title: "MCP Server", url: "/mcp/" },
        { title: "API Reference", url: "/api-reference/" },
      ],
    };
    ```

    ### 2. Update `site/content/verification.md`

    Add a cross-reference at the end of the "What each check confirms"
    section (after line 100, after the paragraph "When all checks pass,
    you know..." and before the `---` divider on line 102). Add:

    ```markdown
    For how these verification checks map to legal evidence standards
    like FRE 901/902 and eIDAS Article 41(2), see
    [Legal Evidence](/legal-evidence/).
    ```

    ### 3. Update `site/content/index.md`

    Add a "Legal Evidence" card to the "What's next" card grid (the
    `<div class="card-grid">` section). Add it after the Verification
    card and before the MCP Server card:

    ```markdown
    **[Legal Evidence](/legal-evidence/)**
    How WRL captures map to FRE 901/902 authentication and eIDAS qualified timestamps.
    ```

    ### What NOT to do
    - Do NOT modify any other docs pages
    - Do NOT change the nav order of existing pages
    - Do NOT add Legal Evidence as the first nav item

    ### Deliverables
    - Modified `site/_data/site.js`
    - Modified `site/content/verification.md`
    - Modified `site/content/index.md`

    ### Success criteria
    - Legal Evidence appears in nav between Verification and Batch Captures
    - Verification page has cross-link to Legal Evidence page
    - Getting Started "What's next" grid includes Legal Evidence card
- **Deliverables**: Modified `site/_data/site.js`, `site/content/verification.md`, `site/content/index.md`
- **Success criteria**: Nav placement correct; cross-references added; no existing content disrupted

### Cross-Cutting Coverage

- **Testing**: Excluded. This task produces only static HTML, CSS, and Markdown content. No executable code, no configuration, no infrastructure. The docs site build (11ty) will be tested by building locally (Phase 6 can run `npm run build` in the site directory to catch template errors), but no custom test code is needed.
- **Security**: Excluded. No authentication, authorization, user input processing, secrets, or new dependencies. The content is static public documentation and a static landing page.
- **Usability -- Strategy**: Covered by ux-strategy-minion's Phase 2 contribution (embedded in Task 1 and Task 2 prompts). Key recommendations adopted: legal depth on docs site, signal-level on landing page, all four cards get links for parity, guide as standalone entry point.
- **Usability -- Design**: Not applicable. No new UI components, no interaction patterns. The landing page changes use existing card patterns with minimal CSS additions (list styling within existing card, CTA link styling). Visual balance maintained by updating all four cards.
- **Documentation**: This task IS documentation. Task 2 is the primary docs deliverable. Task 3 handles integration. No additional documentation agent needed.
- **Observability**: Excluded. No runtime components, no APIs, no background processes. Static content only.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - user-docs-minion: The legal evidence guide is the core deliverable. user-docs-minion should review the final page structure and content accuracy, particularly the legal framing language and disclaimer placement.
    Review focus: Content accuracy, standalone entry point quality, framing language ("designed to support" vs. overclaiming)
- **Not selected**:
  - ux-design-minion: No new UI components or interaction patterns. Card list styling is minimal CSS within existing patterns.
  - accessibility-minion: Changes are text content within existing semantic HTML patterns (article, h3, ul, li, a). No new interactive elements.
  - sitespeed-minion: No new assets, scripts, or runtime code. Static HTML/CSS changes only.
  - observability-minion: No runtime components.
  - product-marketing-minion: Already contributed to planning. Landing page copy is specified precisely in Task 1; no additional marketing review needed beyond what gru and product-marketing-minion already provided.

### Decisions

- **Hero heading unchanged**
  Chosen: Keep "Web evidence you can prove." as-is
  Over: Changing "prove" to "verify" (recommended by gru as lower overclaiming risk)
  Why: product-marketing-minion argued the hero works for all four verticals and "prove" in a general/cryptographic context (not legal) is defensible. ux-strategy-minion agreed the hero should remain audience-neutral. gru rated the risk as MEDIUM, not HIGH. The tagline immediately below ("evidence bundle that anyone can independently verify") grounds the claim. The legal card is where precision matters, and it uses hedged language.

- **No case law citations in the docs guide**
  Chosen: Omit case law references (Lorraine, Vayner, Gasperini)
  Over: Including case law citations for legal credibility (recommended by product-marketing-minion)
  Why: Verifying the accuracy of case law summaries requires legal expertise we cannot guarantee. Mischaracterizing a case to the exact audience trained to spot mischaracterizations is worse than omitting citations entirely. The FRE/eIDAS rule references provide sufficient legal credibility. Case law can be added later with proper legal review.

- **Competitor comparison uses descriptive patterns, not brand names**
  Chosen: Describe verification approaches by pattern ("enterprise capture platforms", "web archive services")
  Over: Naming competitors directly (PageVault, PageFreezer, Hanzo) as product-marketing-minion's plan suggested
  Why: user-docs-minion recommended avoiding brand names to reduce staleness risk and potential backlash. ux-strategy-minion reinforced that a docs-embedded comparison should feel like documentation, not a sales tool. Descriptive patterns are slower to become outdated and harder to challenge as unfair characterization.

- **902(13) on docs page but not landing page**
  Chosen: Include 902(13) as a brief "Planned" section in the docs guide; omit entirely from the landing page
  Over: (a) Including 902(13) with "coming soon" on the landing page (b) Omitting 902(13) from all surfaces
  Why: All four specialists agreed 902(13) should not appear on the landing page (product-marketing-minion: "signals an incomplete product"; gru: "overclaiming without the certification document"). On the docs page, user-docs-minion and product-marketing-minion agreed that legal professionals doing due diligence expect to see the full picture, including what is not yet available. One paragraph marked "Planned" is honest without creating timeline expectations.

- **Disclaimer at bottom, not top**
  Chosen: Disclaimer as styled blockquote at bottom of the docs guide page
  Over: Disclaimer at top of page (recommended by product-marketing-minion)
  Why: user-docs-minion and ux-strategy-minion both argued that a top-of-page disclaimer signals defensiveness and undermines confidence before the reader has context. A bottom disclaimer is standard legal-document hygiene. The content itself demonstrates precision; the disclaimer handles liability, not quality.

### Risks and Mitigations

1. **eIDAS qualified timestamps may not be production-live.** R40 code is shipped but the Sectigo endpoint URL is unverified and QUALIFIED_TSA_AUTH secrets may not be provisioned. Mitigation: All copy uses "optional" for eIDAS qualified timestamps and frames it as an account-level opt-in feature. The docs guide distinguishes standard (DigiCert) from qualified timestamps. If production deployment is not confirmed, the claims are still accurate because they describe the capability as optional/available, not as default.

2. **Overclaiming with FRE references.** Legal professionals will verify every rule citation. Mitigation: All claims bounded by gru's claims matrix. Language uses "designed to support" not "satisfies". Every rule number references an actual rule. No case law citations (avoids mischaracterization risk). product-marketing-minion's copy principles enforced in all task prompts.

3. **Competitor comparison becomes stale.** Competitor capabilities change. Mitigation: Using descriptive patterns instead of brand names reduces staleness. Framing around verifiable technical properties (open format, independent verification, RFC 3161) rather than subjective quality judgments. Properties change slowly.

4. **Legal card breaks visual parity on landing page.** The legal card becomes more complex (list + link) than the other three. Mitigation: All four cards get "Learn more" links. The list adds visual differentiation for the legal card, but the overall card structure (article > h3 > p > link) remains consistent.

5. **902(13) "Planned" creates expectation debt.** Even on the docs page, mentioning 902(13) as planned implies a commitment. Mitigation: Keep the section minimal (one paragraph), use "planned" not "coming soon", do not describe the certification document in detail, do not promise a timeline.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Landing page update (frontend-minion)
    -> APPROVAL GATE
  Task 2: Legal Evidence docs guide page (user-docs-minion)
    -> APPROVAL GATE

Batch 2 (after Task 2 approved):
  Task 3: Docs navigation and cross-references (user-docs-minion)
```

Task 1 and Task 2 can run in parallel because they modify different files
(landing page vs. docs site) and are self-contained. Task 3 depends on
Task 2 because it adds the navigation entry and cross-references for the
new page.

### External Skills

No external skills detected in project.

### Verification Steps

After all tasks complete:

1. **Build the docs site** -- Run the 11ty build (`npm run build` in the
   site directory) to confirm the new page compiles without errors and
   appears in the navigation.

2. **Visual check** -- Open the landing page locally and verify:
   - All four use-case cards have "Learn more" links
   - Legal Evidence card displays the rule list correctly
   - Card grid layout is not broken by the list content
   - Meta/OG descriptions are updated (inspect page source)

3. **Content audit** -- Read the legal evidence docs guide and confirm:
   - No instance of "legally admissible", "court-ready", "FRCP compliant",
     "meets legal requirements", "certified", or "notarized"
   - 902(13) appears only once, clearly marked as "Planned"
   - Disclaimer is at the bottom as a blockquote
   - All FRE/eIDAS rule numbers are real
   - Cross-link to verification.md works

4. **Navigation check** -- Verify Legal Evidence appears in the docs nav
   between Verification and Batch Captures.

5. **Cross-reference check** -- Verify verification.md links to
   legal-evidence, and Getting Started "What's next" includes the new card.
