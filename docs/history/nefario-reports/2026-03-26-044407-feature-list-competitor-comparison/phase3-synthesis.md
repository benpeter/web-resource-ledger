## Delegation Plan

**Team name**: feature-comparison
**Description**: Add feature list section and competitor comparison table to WRL landing page and docs site.

### Conflict Resolutions

Before the task breakdown, here are the key decisions made during synthesis:

**Landing comparison columns**: product-marketing says 4 columns, frontend says 5 columns, ux-strategy says 3-4 columns. **Resolution: 5 columns** (Tool + 4 feature columns). The 4 feature columns from product-marketing are the right ones (Crypto Signing, Independent Timestamps, Public Verification, Standard Format). Adding the tool-name column makes it 5 total, which is what frontend-minion recommended. This fits mobile card-stack at < 768px.

**Landing comparison rows**: product-marketing says 4 competitors (Wayback, PageFreezer, Webrecorder, Manual). ux-strategy says 3-4. **Resolution: 4 competitors + WRL = 5 rows**. These 4 were well-chosen: Wayback (brand recognition), PageFreezer (enterprise), Webrecorder (technical), Manual screenshots (common practice).

**Features section title**: product-marketing proposes "What You Get", ux-strategy doesn't specify. **Resolution: "What You Get"** -- concrete and outcome-oriented, matches the page's honest tone.

**Compare section on landing**: ux-strategy says no "Compare" in nav. **Resolution: Agree.** The comparison summary section on the landing page gets an id but no nav link. Only "Features" gets added to nav.

**Docs page path**: software-docs-minion says `/compare/`, seo-minion doesn't specify. **Resolution: `/compare/`** -- short and linkable.

**Docs page format**: frontend-minion says the comparison page must be `.njk` for `data-label` attributes on mobile. software-docs-minion proposes `.md`. **Resolution: `.njk`** -- the mobile card-stack pattern requires `data-label` attributes on `<td>` elements which Markdown cannot produce.

**Docs site SEO improvements** (canonical tags, OG tags, BreadcrumbList, TechArticle): seo-minion wants template-level fixes. **Resolution: Defer all except self-canonical on the compare page itself.** Template-level SEO improvements are out of scope for this task (issue #144 is about feature list + comparison, not docs site SEO infrastructure). Add a backlog item.

**Feature list visual treatment**: frontend-minion proposes cards with badges. ux-strategy-minion says "not cards -- cards create visual weight, page already uses cards for Use Cases." **Resolution: Lightweight list, not cards.** Use a definition-list-style pattern (heading + description) without `.card` borders. This creates visual contrast with the Use Cases card section above it and stays within ux-strategy's word budget.

**Docs features page**: product-marketing proposes expanding the 8 landing features with technical detail on docs. software-docs-minion says the comparison table IS the feature list. **Resolution: No separate features page on docs.** The docs compare page covers capabilities through its full matrix + notes. The landing feature list links to the compare page, not to a separate features page. This keeps scope tight.

### Task 1: Landing page -- features section and comparison summary
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This task produces 2 new sections on the public landing page and modifies the nav. The content claims about WRL capabilities and the competitor data must be reviewed for accuracy before going live. Multiple downstream tasks (docs comparison page, SEO updates) depend on the landing page content being approved.
- **Gate rationale**: |
    Chosen: Features section with lightweight list (not cards) + comparison summary with 5-column table (4 competitors)
    Over: Card-based feature grid (rejected: visual conflict with Use Cases cards above), full comparison table on landing (rejected: too dense per ux-strategy)
    Why: Lightweight list creates visual contrast with Use Cases section. Summary table communicates core differentiation without overwhelming mobile users.
- **Prompt**: |
    ## Task: Add Features Section and Comparison Summary to WRL Landing Page

    You are modifying the WRL landing page (`landing/public/index.html`) and its stylesheet (`landing/public/css/landing.css`). Do NOT modify `design-system.css`.

    ### What to Build

    **Two new sections** inserted into the existing page:

    1. **Features section** ("What You Get") -- placed AFTER the Use Cases section, BEFORE How It Works
    2. **Comparison summary** -- placed AFTER How It Works, BEFORE Pricing

    Plus: **Update the header nav** to add a "Features" link.

    ### Section 1: Features ("What You Get")

    **Section structure:**
    - `id="features"`, class `landing-section landing-section--muted` (alternating bg: Use Cases is white, so Features is muted)
    - Section header: `<h2>What You Get</h2>`
    - Content: 8 feature items in 2 groups

    **Visual treatment: Lightweight list, NOT cards.** Do not use `.card` class. Use a simple grid of feature items with heading + one-line description. No borders, no box shadows, no badges as icons. This must visually contrast with the card-heavy Use Cases section above it.

    **Layout:**
    ```css
    .features-grid {
      display: grid;
      gap: var(--space-6);
    }

    .feature-item h3 {
      margin: 0 0 var(--space-1);
      font-size: var(--text-md);
      font-weight: var(--weight-bold);
      color: var(--color-text);
    }

    .feature-item p {
      margin: 0;
      color: var(--color-text-muted);
      font-size: var(--text-sm);
      line-height: var(--leading-relaxed);
    }

    @media (min-width: 768px) {
      .features-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 1024px) {
      .features-grid { grid-template-columns: repeat(4, 1fr); }
    }
    ```

    **Feature content (2 categories, 4 items each):**

    Group label (use a `<p>` with a small, uppercase, muted style -- similar to `.pricing-section-label`):

    **Evidence Integrity**

    1. **Ed25519 Digital Signatures** -- Every capture is cryptographically signed. Proves who captured it and that nothing was altered.
    2. **Independent Timestamps** -- A third-party authority records when the capture happened. No one -- not even WRL -- can backdate it.
    3. **Public Verification** -- Share a link. Anyone can confirm authenticity -- no account, no trust required.
    4. **eIDAS Qualified Timestamps** -- Optional EU-standard timestamps with legal presumption of accuracy across all member states.

    **Developer Experience**

    5. **REST API** -- One POST, one signed evidence bundle. Batch captures, webhooks, scheduled captures.
    6. **MCP Server** -- AI agents can capture and verify web pages with cryptographic proof.
    7. **WACZ Standard Format** -- Open archive format. Not locked to any vendor.
    8. **Self-Hostable** -- Deploy on your infrastructure. Your keys, your storage, your evidence chain.

    After the feature grid, add a link: `<p class="features-more"><a href="https://docs.webresourceledger.com/compare/">Full feature comparison across 9 tools &rarr;</a></p>` -- style this like `.use-case-cta`.

    Total word count for this section should be roughly 120 words (excluding heading and link).

    ### Section 2: Comparison Summary

    **Section structure:**
    - `id="compare"`, class `landing-section landing-section--white` (How It Works is muted, so Compare is white)
    - Section header: `<h2>How WRL Compares</h2>`

    **Content: A 5-column summary table.**

    Use a real `<table>` element with proper semantics:
    - `<caption class="sr-only">Comparison of WRL with other web evidence tools</caption>`
    - `scope="col"` on all `<th>` in thead
    - `scope="row"` on the first cell of each body row (the tool name)
    - `data-label` attributes on every `<td>` for the mobile card-stack pattern

    **Table data:**

    | | Crypto Signing | Independent Timestamps | Public Verification | Open Format |
    |---|---|---|---|---|
    | **WRL** | Ed25519 (every capture) | RFC 3161 (default) | Yes (no account) | WACZ |
    | **Wayback Machine** | No | No | Public access (no crypto) | WARC |
    | **PageFreezer** | SHA-256 | Proprietary clock | No | PDF |
    | **Webrecorder** | Spec exists (not default) | In spec (not default) | Validator tools | WACZ + WARC |
    | **Manual + Notary** | Notary attestation | Notary timestamp | Via notary records | N/A |

    Use `.badge--pass` for "Yes" / clear positive values, `.badge--fail` for "No", `.badge--skip` for partial/qualified values. **Every badge must contain visible text** (not just color). For example: `<span class="badge badge--pass">Yes (no account)</span>`, `<span class="badge badge--fail">No</span>`, `<span class="badge badge--skip">Spec exists (not default)</span>`.

    The WRL row should be visually highlighted. Add a `.comparison-highlight` class to WRL's `<tr>` with `background: var(--color-surface-muted);`.

    After the table: `<p class="compare-more"><a href="https://docs.webresourceledger.com/compare/">Full comparison of 9 tools across 7 criteria &rarr;</a></p>`

    **Responsive: Card-stack pattern at < 768px.**

    Each row becomes a stacked card. Hide `thead` with `.sr-only`. Each `td` renders its column header via `data-label` attribute and `::before` pseudo-element:

    ```css
    @media (max-width: 767px) {
      .comparison-table thead {
        position: absolute; width: 1px; height: 1px;
        overflow: hidden; clip: rect(0,0,0,0);
      }
      .comparison-table tr {
        display: block;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
        margin-bottom: var(--space-4);
        background: var(--color-surface);
      }
      .comparison-table td {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--color-border-subtle);
      }
      .comparison-table td::before {
        content: attr(data-label);
        font-weight: var(--weight-medium);
        font-size: var(--text-xs);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted);
        flex-shrink: 0;
        margin-right: var(--space-3);
      }
      .comparison-table td:last-child { border-bottom: none; }
      .comparison-table td:first-child {
        font-weight: var(--weight-bold);
        font-size: var(--text-md);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-3);
        margin-bottom: var(--space-2);
      }
      .comparison-table td:first-child::before { display: none; }
    }
    ```

    ### Navigation Update

    Update the `<nav>` in the header to add "Features" between "Use Cases" and "How It Works":

    ```html
    <a href="#use-cases">Use Cases</a>
    <a href="#features">Features</a>
    <a href="#how-it-works">How It Works</a>
    <a href="#pricing">Pricing</a>
    ```

    Do NOT add "Compare" to the nav. 6 items + Sign in button is fine.

    ### What NOT to Do

    - Do NOT modify `design-system.css`
    - Do NOT add JavaScript
    - Do NOT add SVG icons or images
    - Do NOT create a separate comparison page (that is a different task)
    - Do NOT add more than 4 competitors to the landing summary table
    - Do NOT add cards with borders/shadows for the feature list
    - Do NOT add the full 7-column comparison table to the landing page
    - Do NOT add "Compare" to the navigation

    ### Files to Modify

    - `landing/public/index.html` -- add the two new sections and update nav
    - `landing/public/css/landing.css` -- add CSS for `.features-grid`, `.feature-item`, `.feature-group-label`, `.comparison-table`, `.comparison-highlight`, `.compare-more`, `.features-more`, and the mobile card-stack media query

    ### Verification

    - Page loads without errors
    - Section order is: Hero > Use Cases > Features > How It Works > Compare > Pricing
    - Features section has muted background, Compare section has white background (alternating rhythm maintained)
    - Nav links scroll to correct sections
    - Table is accessible: proper `<caption>`, `scope` attributes, `data-label` on all `<td>`
    - Badges have visible text content
    - Mobile (< 768px): features are single column, comparison table becomes card stack
    - Tablet (768px+): features are 2-column grid
    - Desktop (1024px+): features are 4-column grid
- **Deliverables**: Modified `landing/public/index.html` and `landing/public/css/landing.css`
- **Success criteria**: Two new sections visible on landing page in correct order, responsive on mobile, accessible table markup, nav updated

### Task 2: Docs site -- comparison page
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: The full comparison table has 63 data points about competitors. Factual accuracy of every cell must be verified before publishing. This is the most legally sensitive deliverable in the plan.
- **Gate rationale**: |
    Chosen: Single `/compare/` page as .njk file with full 7-column matrix, per-competitor notes, and methodology section
    Over: Separate features page + comparison page (rejected: maintenance burden, table IS the feature list), Markdown file (rejected: cannot produce data-label attributes for responsive cards)
    Why: .njk format enables proper responsive card-stack pattern. Single page keeps evaluation content unified.
- **Prompt**: |
    ## Task: Create Full Comparison Page on WRL Docs Site

    Create a new comparison page at `site/content/compare.njk` with the complete competitor matrix, add it to the docs nav, add responsive CSS to `site/css/docs.css`, and update the `featureList` in the landing page structured data.

    ### File 1: `site/content/compare.njk`

    **Frontmatter:**
    ```
    ---
    layout: layouts/doc.njk
    title: How WRL Compares
    description: Feature comparison of WRL with Wayback Machine, PageFreezer, Webrecorder, and 6 other web archiving and evidence tools. Last verified March 2026.
    ---
    ```

    **Page structure:**

    1. **H1**: "How WRL Compares"

    2. **Lead paragraph** (2-3 sentences): "A factual comparison of WRL with other web archiving and evidence tools. Each cell reflects publicly documented capabilities as of March 2026. If something has changed, <a href="https://github.com/benpeter/web-resource-ledger/issues">open an issue</a>."

    3. **Full comparison table** -- use a real `<table>` element (not Markdown). This is why the file must be `.njk`.

    Table semantics:
    - `<caption class="sr-only">Feature comparison of web evidence and archiving tools</caption>`
    - `scope="col"` on all `<th>` in `<thead>`
    - `scope="row"` on the first `<th>` in each `<tbody>` row (the tool name)
    - `data-label` attribute on every `<td>` matching the column header text
    - Wrap the table in `<div class="comparison-table-wrapper">`
    - Apply class `comparison-table` to the `<table>` element

    **7 columns:**
    1. Tool (row header)
    2. Cryptographic Signing
    3. Independent Timestamps
    4. Public Verification
    5. API Access
    6. Standard Format
    7. eIDAS Qualified
    8. Open Source

    **10 rows (including WRL):**

    Use `.badge--pass` for clear yes/positive, `.badge--fail` for clear no, `.badge--skip` for partial/qualified. **Every badge must contain visible text.**

    Here is the exact cell content for each row:

    **WRL:**
    - Crypto Signing: `<span class="badge badge--pass">Ed25519 (every capture)</span>`
    - Independent Timestamps: `<span class="badge badge--pass">RFC 3161 (DigiCert TSA)</span>`
    - Public Verification: `<span class="badge badge--pass">Yes (no account needed)</span>`
    - API Access: `<span class="badge badge--pass">REST API, MCP</span>`
    - Standard Format: `<span class="badge badge--pass">WACZ</span>`
    - eIDAS Qualified: `<span class="badge badge--pass">Optional</span>`
    - Open Source: `<span class="badge badge--pass">Apache 2.0</span>`

    **Wayback Machine:**
    - Crypto Signing: `<span class="badge badge--fail">No</span>`
    - Independent Timestamps: `<span class="badge badge--fail">Crawl timestamps only</span>`
    - Public Verification: `<span class="badge badge--skip">Public access (no crypto)</span>`
    - API Access: `<span class="badge badge--skip">Yes (rate-limited)</span>`
    - Standard Format: `<span class="badge badge--pass">WARC</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--skip">Partial (some tools)</span>`

    **PageFreezer:**
    - Crypto Signing: `<span class="badge badge--skip">SHA-256 signing</span>`
    - Independent Timestamps: `<span class="badge badge--skip">Stratum-1 clock (not RFC 3161)</span>`
    - Public Verification: `<span class="badge badge--fail">No (platform-only)</span>`
    - API Access: `<span class="badge badge--skip">Partner API</span>`
    - Standard Format: `<span class="badge badge--fail">PDF</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **Hanzo:**
    - Crypto Signing: `<span class="badge badge--skip">Not documented</span>`
    - Independent Timestamps: `<span class="badge badge--skip">Not documented</span>`
    - Public Verification: `<span class="badge badge--fail">No</span>`
    - API Access: `<span class="badge badge--fail">No</span>`
    - Standard Format: `<span class="badge badge--pass">WARC</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **Page Vault:**
    - Crypto Signing: `<span class="badge badge--skip">SHA-256 hashing</span>`
    - Independent Timestamps: `<span class="badge badge--skip">Internal timestamps</span>`
    - Public Verification: `<span class="badge badge--skip">Expert witness service</span>`
    - API Access: `<span class="badge badge--fail">No</span>`
    - Standard Format: `<span class="badge badge--fail">Proprietary / PDF</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **MirrorWeb:**
    - Crypto Signing: `<span class="badge badge--skip">SHA-1 per docs</span>`
    - Independent Timestamps: `<span class="badge badge--skip">Timestamped (not RFC 3161)</span>`
    - Public Verification: `<span class="badge badge--fail">No (platform-only)</span>`
    - API Access: `<span class="badge badge--skip">Limited API</span>`
    - Standard Format: `<span class="badge badge--pass">WARC</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **Stillio:**
    - Crypto Signing: `<span class="badge badge--fail">No</span>`
    - Independent Timestamps: `<span class="badge badge--fail">Metadata only</span>`
    - Public Verification: `<span class="badge badge--fail">No</span>`
    - API Access: `<span class="badge badge--skip">Basic API</span>`
    - Standard Format: `<span class="badge badge--fail">PNG / JPEG</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **Archive-It:**
    - Crypto Signing: `<span class="badge badge--fail">Checksums only</span>`
    - Independent Timestamps: `<span class="badge badge--fail">Crawl timestamps</span>`
    - Public Verification: `<span class="badge badge--skip">Public access (no crypto)</span>`
    - API Access: `<span class="badge badge--pass">Yes (WASAPI)</span>`
    - Standard Format: `<span class="badge badge--pass">WARC</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--fail">No</span>`

    **Webrecorder:**
    - Crypto Signing: `<span class="badge badge--skip">WACZ-Auth spec (not default)</span>`
    - Independent Timestamps: `<span class="badge badge--skip">RFC 3161 in spec (not default)</span>`
    - Public Verification: `<span class="badge badge--skip">Validator tools exist</span>`
    - API Access: `<span class="badge badge--pass">Browsertrix API</span>`
    - Standard Format: `<span class="badge badge--pass">WACZ + WARC</span>`
    - eIDAS Qualified: `<span class="badge badge--fail">No</span>`
    - Open Source: `<span class="badge badge--pass">Yes</span>`

    **Manual Screenshots + Notarization:**
    - Crypto Signing: `<span class="badge badge--skip">Notary attestation</span>`
    - Independent Timestamps: `<span class="badge badge--skip">Notary timestamp</span>`
    - Public Verification: `<span class="badge badge--skip">Via notary records</span>`
    - API Access: `<span class="badge badge--fail">No</span>`
    - Standard Format: `<span class="badge badge--fail">N/A</span>`
    - eIDAS Qualified: `<span class="badge badge--skip">Separate framework</span>`
    - Open Source: `<span class="badge badge--fail">N/A</span>`

    Highlight the WRL row with class `comparison-highlight` on the `<tr>`.

    4. **Notes section** -- H2 "Notes", then one H3 per competitor with 3-5 sentences of nuance. Include these specific notes:

    **Wayback Machine**: Massive scale (850B+ pages archived) and institutional credibility accepted by some courts. Captures have no cryptographic signatures -- integrity relies on trust in the Internet Archive as an institution. Rate-limited public API (15 req/min). The de facto reference for "what did this page look like" but not designed as an evidence tool.

    **PageFreezer**: Enterprise-grade compliance platform (FedRAMP authorized, SOC 2). SHA-256 digital signatures with their own timestamping infrastructure (Stratum-1 atomic clock, ESIGN Act compliant). Timestamps are not from an independent third-party TSA per RFC 3161. Strong in social media archiving (Teams, Workplace) which WRL does not offer. Verification is internal to their platform.

    **Hanzo**: Focused on dynamic content capture (SPAs, interactive elements) and eDiscovery workflows. SOC 2 Type 2 certified. No public API (confirmed by multiple review sources). Integrity approach is proprietary and not publicly documented. Note: Hanzo (hanzo.co) the web archiving company is distinct from Hanzo AI (hanzo.ai).

    **Page Vault**: Purpose-built for US litigation. Provides expert witness testimony and affidavit services for court admissibility under FRE 901(b)(9) and FRE 902(13)/902(14). SHA-256 hashing with internal timestamps. No API -- browser extension and managed capture service. WRL provides machine-verifiable proof; Page Vault provides human-verifiable expert testimony.

    **MirrorWeb**: Financial services compliance focus (SEC 17a-4, FINRA 2210, FCA COBS 4). Documentation references SHA-1 digital signatures, though this may have been updated (SHA-1 is cryptographically deprecated). SOC 2 certified. Multi-channel archiving including social media and SMS.

    **Stillio**: Screenshot scheduling service, not an evidence tool. No integrity proofs, no cryptographic signing. Useful for visual monitoring and brand tracking. Starting at $29/month. Including Stillio illustrates the gap between screenshot services and evidence services.

    **Archive-It**: Internet Archive's subscription archiving service for institutions. WARC format with MD5 and SHA-1 checksums via WASAPI (data integrity, not cryptographic authenticity). Strong in academic, government, and cultural heritage sectors. Public access to archives but no cryptographic verification.

    **Webrecorder**: Created the WACZ format and authored the WACZ-Auth specification that defines signing for WACZ files. WRL implements signing as a default on every capture; Webrecorder provides the specification and tooling. Browsertrix (hosted service) does not appear to sign WACZ files by default. Open source, self-hostable via Kubernetes. Different primary use case: site-wide preservation vs. WRL's point-in-time evidence.

    **Manual Screenshots + Notarization**: Legally established with centuries of precedent. Entirely manual, no automation possible. Notary attestation is broadly accepted by courts. Cost scales linearly with volume. WRL is faster, scalable, and cheaper but has less legal track record.

    5. **Methodology section** -- H2 "Methodology". Text: "All claims are based on publicly available documentation, product pages, and review platforms as of March 2026. Where a capability could not be confirmed from public sources, the cell reads 'Not documented' rather than 'No'. We do not have accounts with every listed service -- claims reflect what each service publicly represents, not hands-on testing of every feature. If any information is outdated or incorrect, please <a href='https://github.com/benpeter/web-resource-ledger/issues/new'>open an issue</a>."

    ### File 2: `site/_data/site.js`

    Add the comparison page to the nav array at position 11 (after Architecture, before Security & Compliance):

    ```js
    { title: "Architecture", url: "/architecture/" },
    { title: "Compare", url: "/compare/" },
    // Security & Compliance
    { title: "Security & Compliance", url: "/security/" },
    ```

    ### File 3: `site/css/docs.css`

    Add these styles at the end of the file:

    **Breakout wrapper** for the wide comparison table:
    ```css
    /* ------------------------------------------------------------------ */
    /* Comparison table                                                     */
    /* ------------------------------------------------------------------ */

    .comparison-table-wrapper {
      overflow-x: auto;
      margin: var(--space-6) calc(-1 * var(--space-6));
      padding: 0 var(--space-6);
    }

    .comparison-table {
      width: 100%;
      min-width: 800px;
      border-collapse: collapse;
    }

    .comparison-table th {
      background: var(--color-surface-muted);
      font-weight: var(--weight-medium);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--space-2) var(--space-3);
      text-align: left;
      border-bottom: 1px solid var(--color-border);
      white-space: nowrap;
    }

    .comparison-table td {
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-border-subtle);
      vertical-align: middle;
      font-size: var(--text-sm);
    }

    .comparison-table th[scope="row"] {
      font-weight: var(--weight-bold);
      white-space: nowrap;
    }

    .comparison-highlight {
      background: var(--color-surface-muted);
    }

    .comparison-highlight td {
      font-weight: var(--weight-medium);
    }
    ```

    **Mobile card-stack** (same pattern as landing, scoped to docs):
    ```css
    @media (max-width: 767px) {
      .comparison-table-wrapper {
        margin: var(--space-6) 0;
        padding: 0;
        overflow-x: visible;
      }

      .comparison-table {
        min-width: 0;
      }

      .comparison-table thead {
        position: absolute; width: 1px; height: 1px;
        overflow: hidden; clip: rect(0,0,0,0);
      }

      .comparison-table tbody { display: block; }

      .comparison-table tr {
        display: block;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        padding: var(--space-4);
        margin-bottom: var(--space-4);
        background: var(--color-surface);
      }

      .comparison-table td {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-2) 0;
        border-bottom: 1px solid var(--color-border-subtle);
      }

      .comparison-table td::before {
        content: attr(data-label);
        font-weight: var(--weight-medium);
        font-size: var(--text-xs);
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-text-muted-docs);
        flex-shrink: 0;
        margin-right: var(--space-3);
      }

      .comparison-table td:last-child { border-bottom: none; }

      .comparison-table td:first-child {
        font-weight: var(--weight-bold);
        font-size: var(--text-md);
        border-bottom: 1px solid var(--color-border);
        padding-bottom: var(--space-3);
        margin-bottom: var(--space-2);
      }

      .comparison-table td:first-child::before { display: none; }
    }
    ```

    ### File 4: `landing/public/index.html` -- structured data update

    Update the `featureList` array in the SoftwareApplication JSON-LD (around line 59) to:

    ```json
    "featureList": [
      "Ed25519 digital signatures",
      "RFC 3161 timestamps",
      "WACZ evidence bundles",
      "Public verification URLs",
      "REST API and MCP server",
      "Cookie consent dismissal",
      "eIDAS-qualified timestamps (optional)",
      "FRE 901/902 evidence authentication support",
      "Batch capture API",
      "Webhook notifications",
      "Screenshot and rendered HTML capture",
      "HTTP header recording",
      "Self-hostable (Apache 2.0)"
    ]
    ```

    Also add to the SoftwareApplication schema, after `isAccessibleForFree`:
    ```json
    "applicationSubCategory": "Web Evidence",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "EUR",
      "description": "Free tier: 200 captures/month"
    }
    ```

    ### What NOT to Do

    - Do NOT add canonical tags, OG tags, or BreadcrumbList to the docs site template (out of scope, deferred)
    - Do NOT add TechArticle structured data to the compare page (deferred)
    - Do NOT create a separate features page on the docs site
    - Do NOT modify `design-system.css`
    - Do NOT add JavaScript
    - Do NOT include pricing in the comparison table
    - Do NOT include screenshots of competitor UIs
    - Do NOT use subjective language ("better", "best", "superior")

    ### Verification

    - `compare.njk` renders correctly in Eleventy (`cd site && npx @11ty/eleventy --serve`)
    - Compare page appears in docs sidebar nav between Architecture and Security & Compliance
    - Table is accessible: proper `<caption>`, `scope` attributes, `data-label` on all `<td>`
    - Badges have visible text content
    - Mobile card-stack works (test at 375px viewport)
    - Desktop table scrolls horizontally if needed
    - All competitor names link to their websites in the notes section
    - Methodology section includes the "last verified" date and issue link
    - `featureList` in landing page structured data is updated
- **Deliverables**: `site/content/compare.njk`, modified `site/_data/site.js`, modified `site/css/docs.css`, modified `landing/public/index.html` (structured data only)
- **Success criteria**: Full comparison page with 10 rows x 8 columns, responsive card-stack on mobile, per-competitor notes, methodology section, nav entry added

### Task 3: Evolution log
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1, Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create Evolution Log Entry for Feature List and Comparison Table

    Create the evolution log directory and files for this phase. Determine the next sequence number by looking at existing directories in `docs/evolution/`.

    ### Files to Create

    **`docs/evolution/NNNN-feature-comparison/prompt.md`**:
    Document that this phase implements GitHub issue #144: "Feature list and competitor comparison table for WRL landing page and docs site."

    **`docs/evolution/NNNN-feature-comparison/decisions.md`**:
    Key decisions:
    1. Feature list uses lightweight list pattern (not cards) to contrast with Use Cases section
    2. Landing comparison shows 4 competitors x 4 feature columns (summary), docs shows 9 competitors x 7 columns (full)
    3. Docs comparison page is `.njk` not `.md` because responsive card-stack requires `data-label` attributes
    4. Single `/compare/` page on docs (no separate features page) -- the table IS the feature list
    5. "Features" added to landing nav, "Compare" not added (keeps nav to 6 items)
    6. Docs SEO infrastructure improvements deferred (out of scope for this task)
    7. Competitor data verified from public sources only, with methodology disclosure and "last verified" date

    **`docs/evolution/NNNN-feature-comparison/outcome.md`**:
    Write after reviewing what was actually built. Summarize:
    - What was added to the landing page (2 sections, nav update, structured data)
    - What was added to the docs site (compare page, nav entry, CSS)
    - Backlog items created (docs site SEO infrastructure)

    **Update `docs/evolution/README.md`**: Add the new entry.

    **Update `docs/backlog.md`**: Add a deferred item for docs site SEO infrastructure (canonical tags, OG tags, BreadcrumbList structured data, TechArticle schema). Reference seo-minion's recommendations from this phase.

    ### What NOT to Do
    - Do NOT modify any source code files
    - Do NOT create process.md (that is written by the orchestrator after PR creation)
- **Deliverables**: Evolution log directory with prompt.md, decisions.md, outcome.md; updated README.md and backlog.md
- **Success criteria**: Complete evolution log entry following the project's established pattern

### Cross-Cutting Coverage

- **Testing**: No dedicated test task. The deliverables are static HTML/CSS pages. Visual verification is sufficient per project rules ("For UI-only changes, visual verification is sufficient"). Phase 6 will run lint/build checks.
- **Security**: No security concerns. Static content pages with no user input, no auth, no API surface. Competitor claims are the reputational risk, mitigated by methodology disclosure and "last verified" date.
- **Usability -- Strategy**: Covered by incorporating ux-strategy-minion's recommendations directly into Task 1 prompt: section ordering, word budget (~200 words), progressive disclosure (summary on landing, full on docs), nav item selection.
- **Usability -- Design**: No separate design task. ux-strategy-minion's visual treatment recommendations (lightweight list, no cards for features; card-stack for mobile tables) are incorporated into Task 1 and Task 2 prompts. accessibility-minion concerns are addressed via table semantics (caption, scope, data-label, visible badge text).
- **Documentation**: Covered by Task 3 (evolution log). The comparison page itself IS documentation. software-docs-minion's recommendations on structure and nav placement are incorporated into Task 2.
- **Observability**: Not applicable. Static content pages, no runtime components.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - accessibility-minion: Both tasks produce HTML tables that end users interact with. The mobile card-stack pattern with visually-hidden thead needs review for screen reader compatibility.
    Review focus: Table semantics, badge text content, card-stack pattern a11y, color independence.
  - seo-minion: Landing page structured data is being modified and a new public-facing page is created.
    Review focus: featureList accuracy, canonical handling between landing and docs, meta description quality.
- **Not selected**:
  - ux-design-minion: The visual treatment follows existing design-system.css patterns with no new components. ux-strategy-minion's guidance on lightweight list vs. cards is sufficient.
  - sitespeed-minion: Static HTML/CSS additions with no new assets, scripts, or runtime components. No performance budget impact.
  - observability-minion: No runtime components.
  - user-docs-minion: The comparison page itself is the user-facing documentation. software-docs-minion's structure recommendations are incorporated.

### Decisions

- **Feature list visual treatment**
  Chosen: Lightweight grid items (heading + description, no borders)
  Over: Card-based grid with `.card` class and badge icons (frontend-minion's recommendation)
  Why: ux-strategy-minion correctly identified that the page already uses cards heavily in Use Cases. Using cards again creates "card fatigue" and no visual contrast between sections. The lightweight treatment lets the content breathe.

- **Docs page format**
  Chosen: Nunjucks template (`.njk`)
  Over: Markdown (`.md`) per software-docs-minion
  Why: The mobile responsive card-stack pattern requires `data-label` attributes on `<td>` elements. Markdown tables cannot produce custom HTML attributes. The `api-reference.njk` precedent confirms `.njk` is an established pattern for structured content in this docs site.

- **No separate features page on docs**
  Chosen: Single `/compare/` page serves both features and comparison
  Over: Separate `/features/` + `/compare/` pages (product-marketing-minion's implicit structure)
  Why: software-docs-minion's argument is compelling: the comparison table already implies feature coverage. A separate features page would duplicate information and create a maintenance burden with no clear user benefit.

- **Docs SEO infrastructure deferred**
  Chosen: Defer canonical tags, OG tags, BreadcrumbList, TechArticle schema to a separate task
  Over: Including template-level docs site SEO fixes in this task (seo-minion's recommendation)
  Why: Issue #144 scope is feature list + comparison table. Template-level SEO changes affect all 15+ docs pages and deserve their own review cycle. The self-referencing canonical on the compare page alone would be inconsistent if no other docs page has one. Better to do it properly in a dedicated task.

- **Landing comparison competitor selection**
  Chosen: Wayback Machine, PageFreezer, Webrecorder, Manual + Notary (4 competitors)
  Over: Including all 9 competitors on landing (rejected: too dense for landing page)
  Why: These 4 maximize recognition (Wayback), enterprise credibility (PageFreezer), technical respect (Webrecorder), and common practice (Manual). Each illustrates a different dimension of WRL's advantage.

### Risks and Mitigations

1. **Competitor accuracy** (HIGH risk): Every claim is verifiable by competitors, customers, and journalists. One factual error undermines the entire comparison.
   - Mitigation: Methodology section with "last verified" date and issue link. Use "Not documented" rather than "No" when uncertain. product-marketing-minion flagged specific uncertainties (PageFreezer signing algorithm, MirrorWeb SHA-1 status, Webrecorder default signing) -- all are reflected with qualified language in the table cells.

2. **Staleness** (MEDIUM risk): 63 data points that can go stale within months.
   - Mitigation: Visible "last verified" date. Invitation to report inaccuracies via GitHub issues. Backlog item for quarterly review.

3. **Webrecorder relationship** (MEDIUM risk): WRL implements a specification that Webrecorder authored. The web archiving community will scrutinize how WRL positions itself relative to Webrecorder.
   - Mitigation: The notes section explicitly acknowledges Webrecorder's authorship of the WACZ-Auth spec. The table says "WACZ-Auth spec (not default)" rather than implying Webrecorder lacks the capability.

4. **Word budget on landing** (LOW risk): Adding 2 sections risks making the page too long.
   - Mitigation: Feature list is ~120 words, comparison summary is ~80 words. Combined ~200 words is within ux-strategy's budget. Both sections link to docs for full content.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Landing page features + comparison (frontend-minion)
  Task 2: Docs site comparison page (frontend-minion)

  [GATE: Review Task 1 -- landing page content and layout]
  [GATE: Review Task 2 -- docs comparison data accuracy]

Batch 2 (sequential, after both gates approved):
  Task 3: Evolution log (software-docs-minion)
```

### Verification Steps

After all tasks complete:
1. Landing page loads without errors, sections appear in correct order
2. Nav scrolls to correct sections (Features, not Compare in nav)
3. Landing comparison table is responsive (card-stack at mobile)
4. Docs comparison page renders in Eleventy
5. Docs sidebar shows "Compare" between Architecture and Security & Compliance
6. Docs comparison table is responsive (card-stack at mobile)
7. All badge elements contain visible text
8. Structured data validates (test with Google's Rich Results Test)
9. Cross-links work: landing "Full comparison" links to docs, docs "last verified" date is present
10. Evolution log entry exists with correct structure
