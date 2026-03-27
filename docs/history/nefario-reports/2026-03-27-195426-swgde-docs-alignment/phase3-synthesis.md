## Delegation Plan

**Team name**: swgde-docs-alignment
**Description**: Create a SWGDE compliance mapping page and update existing WRL documentation with cross-references, aligning with SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024). Documentation-only: no code changes, no runtime tests.

### Task 1: Create SWGDE Compliance Mapping Page

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: This page establishes WRL's public compliance posture relative to a forensic standard. The framing choices ("fully addressed" vs. "addressed differently" vs. "tenant responsibility") carry implicit weight with forensics evaluators and attorneys. Getting the honest-but-not-self-undermining tone wrong would be difficult to reverse once published and indexed. All downstream cross-references depend on the content and anchor structure of this page.
- **Gate rationale**: |
    Chosen: Hybrid format -- summary mapping table at top, section-by-section walkthrough below, with a "How to read this mapping" bridge section explaining the automated-vs-manual paradigm difference.
    Over: (1) Pure mapping table without prose -- too compressed to honestly distinguish compliance postures; (2) Narrative essay without structured table -- less scannable for evaluators looking up specific sections by number.
    Why: The hybrid approach serves both quick-reference scanning (table) and deep evaluation (walkthrough). The bridge section prevents the two failure modes all specialists identified: overclaiming compliance with a standard written for manual examiners, and dismissing requirements as inapplicable when WRL actually addresses the intent through different mechanisms.
- **Prompt**: |
    You are creating a SWGDE compliance mapping page for the WRL documentation site.

    ## What to create

    Create the file `site/content/security/swgde-compliance.md` -- a page that maps WRL's automated web capture capabilities to the requirements in SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024).

    ## Context

    SWGDE (Scientific Working Group on Digital Evidence) publishes best practices for digital forensics. Document 21-F-001 covers how forensic examiners should acquire online content. It assumes a human examiner manually operating tools on a forensic workstation. WRL is a fully automated, API-driven capture pipeline. The page must bridge this paradigm difference honestly.

    The SWGDE PDF is available at: https://www.swgde.org/wp-content/uploads/2024/04/2024-03-15-SWGDE-Best-Practices-for-Acquiring-Online-Content-21-F-001-1.1.pdf

    Fetch and read this PDF before writing the page. The exact wording of SWGDE requirements matters for accurate mapping.

    ## Existing docs to read first

    Read these files to understand WRL's current documentation style, technical claims, and tone:

    - `site/content/legal-evidence.md` -- the closest existing page in tone and audience. Match its careful, qualified register exactly. Note how it uses phrases like "supports the argument that" and "designed to support a 902(13) foundation" rather than claiming compliance outright.
    - `site/content/verification.md` -- covers SHA-256 hashing, Ed25519 signatures, and RFC 3161 timestamps. Cross-reference this page for hashing details (SWGDE 7.3).
    - `site/content/architecture.md` -- covers the capture pipeline, browser rendering, and WACZ packaging. Cross-reference for pipeline/contamination discussion (SWGDE 3.4, 4.1).
    - `site/content/security/whitepaper.md` -- covers encryption, SSRF prevention, tenant isolation. Cross-reference for security implementation details.
    - `site/content/security/index.md` -- the Security & Compliance overview page. Match the tone: "honest disclosure over marketing claims" and "technical evidence, not sales material."

    ## Page structure

    Use this structure:

    ### Frontmatter
    ```yaml
    ---
    layout: layouts/doc.njk
    title: SWGDE Compliance
    description: How WRL's automated capture pipeline maps to SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024) -- forensically sound web capture with SHA-256 hashing, automated collection documentation, and RFC 3161 timestamps.
    ---
    ```

    ### Content sections (in order)

    1. **Title and introduction** (2-3 paragraphs):
       - What SWGDE is (one sentence for attorneys who may not know; examiners will skip it)
       - What this page does: maps WRL's capabilities to the specific requirements of SWGDE 21-F-001, Version 1.1 (March 2024)
       - Full citation of the document: "SWGDE Best Practices for Acquiring Online Content, 21-F-001, Version 1.1 (March 15, 2024)"
       - Link to the canonical SWGDE URL: https://www.swgde.org/documents/published-complete-listing/21-f-001-best-practices-for-acquiring-online-content/
       - Explicit statement: SWGDE does not certify tools or grant compliance status. This page demonstrates alignment, not certification.
       - Note that readers should verify they are using the current version at swgde.org.

    2. **"How to read this mapping"** (2-3 paragraphs):
       - SWGDE assumes a human forensic examiner manually operating tools on a forensic workstation. WRL is an automated API service.
       - Where SWGDE says "the examiner should," WRL's equivalent is the automated pipeline design. The examiner's judgment is replaced by deterministic process decisions made at design time, not capture time.
       - Where SWGDE requires examiner-specific actions that cannot be automated (e.g., assessing legal authority, selecting VPNs for covert investigation), those remain the tenant's or examiner's responsibility.
       - SWGDE Section 8.1.1 explicitly identifies API-based acquisition as the most inclusive method and ranks it above browser capture and screenshots. WRL is an implementation of this preferred acquisition method.
       - The mapping uses three compliance postures:
         - **Fully addressed**: WRL's automated pipeline directly satisfies the requirement
         - **Addressed differently**: WRL achieves the same evidentiary goal through a different mechanism than the manual process SWGDE describes
         - **Tenant/examiner responsibility**: The requirement involves judgment or action that falls outside an automated capture tool's scope

    3. **Summary mapping table**:
       - Columns: SWGDE Section | Title | Compliance Posture | Details
       - The "Details" column contains a one-sentence summary linking to the corresponding anchor in the walkthrough below
       - Cover these 10 sections: 3.1, 3.4, 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1.1, 9
       - Use a brief "Sections not mapped" note after the table listing the sections NOT covered (3.2, 3.3, 3.5, 5, 6, 7.1, 7.4, 8.1.2, 8.1.3) with one-line explanations of why they are excluded from this mapping

    4. **Section-by-section walkthrough** (one H2 per SWGDE section):
       - Use consistent pattern for each section:
         1. Paraphrase the SWGDE requirement (with section number and version reference on first quote/paraphrase)
         2. State how WRL addresses it (or doesn't)
         3. Where the approach differs, explain why the automated approach achieves the same evidentiary goal
         4. Where it genuinely doesn't apply, say so and note it as a tenant responsibility
       - Cross-reference existing docs rather than duplicating content, EXCEPT when the mapping requires novel analysis not in existing docs (see content strategy below)

       Per-section content strategy:

       **3.1 Principles** (relevance, reliability, sufficiency, reproducibility): Self-contained with cross-ref to /verification/. The mapping of "auditable and repeatable" to WRL's deterministic pipeline is novel analysis. Address examiner qualification: WRL shifts it from "examiner who operated the tool" to "system whose process is documented, deterministic, and independently verifiable." Cross-reference the certification PDF and verification report.

       **3.4 Evidence Contamination**: Self-contained. SWGDE's concern is browser plugins, cached data, or network artifacts contaminating acquisition. WRL's captures run in Cloudflare's Browser Rendering environment -- a fresh, ephemeral browser instance with no plugins, no cache, no cookies, no browsing history. State this directly.

       **4.1 Configuration**: Self-contained with cross-ref to /architecture/. SWGDE wants pre-documented device/browser config. WRL's equivalent is the deterministic pipeline config (headless Chromium version, no extensions, no cookies). Be honest: WRL captures from Cloudflare's network with a fixed set of egress IP ranges and standard Chromium user agent. WRL does not currently support configurable geolocation or user agent spoofing. State what WRL does and does not support without treating the limitation as a deficiency.

       **4.2 Content Volatility**: Self-contained with cross-ref to /schedules/ and /batch/. WRL addresses volatility through scheduled captures and batch API.

       **4.3 Tool Validation**: Self-contained with cross-ref to /verification/ and security whitepaper. WRL's approach: source-available verifier, deterministic pipeline, CI test suite. SWGDE references its companion doc "Minimum Requirements for Testing Tools" (18-Q-001).

       **7.2 Format**: Self-contained with cross-ref to /architecture/. SWGDE wants native format preservation. WRL uses WACZ (open standard ZIP archive containing WARC files). SWGDE Section 9 explicitly names zip and gzip as acceptable archive formats.

       **7.3 Hashing**: Cross-reference to /verification/. SHA-256 is NIST-approved. Brief statement here, link to verification page for details on per-artifact and bundle-level hashing.

       **7.5 Collection Documentation**: Self-contained with cross-refs to /legal-evidence/ (certification document) and /verification/ (legal report). Map each SWGDE documentation item (URL, timestamps, examiner identity, etc.) to where WRL records it.

       **8.1.1 Utilities / API**: Self-contained with cross-ref to /api-reference/. This is the strongest alignment point. SWGDE explicitly identifies API-based acquisition as the most inclusive method. WRL is an API-first tool. Position WRL within SWGDE's acquisition hierarchy.

       **9 Preservation**: Self-contained with cross-refs to /security/data-retention/ and /architecture/. Map WRL's R2 storage, hash-addressed bundles, and WACZ structure to SWGDE's preservation requirements. Honestly note: WRL does not produce a forensic disk image -- the WACZ bundle itself is the preservation format.

    5. **Legal disclaimer** (at the very end, after a horizontal rule):
       Use the same disclaimer as legal-evidence.md verbatim:
       > **This page is for informational purposes only and does not constitute legal advice.** The applicability of any legal standard depends on your jurisdiction, the specific proceeding, and the rules of the tribunal. Consult qualified legal counsel to evaluate how WRL evidence applies to your matter.

    ## Tone and language rules

    - NEVER say "SWGDE-compliant," "SWGDE-certified," or "SWGDE-approved." SWGDE does not certify tools.
    - Use "aligns with," "addresses," "maps to," "satisfies the intent of" -- not "complies with."
    - Match the register of legal-evidence.md: careful qualifiers, precise technical mapping, honest disclosure of differences.
    - No marketing language. No "we believe" or "we feel." State facts and mechanisms.
    - The audience (forensics professionals and attorneys) is skeptical by training. They will be persuaded by precision and honesty, not by enthusiasm.
    - When a SWGDE concept genuinely does not apply, explain why without sounding dismissive. "Not applicable because WRL is better" is wrong. "Not applicable because the capture does not run on the examiner's device -- it runs in an ephemeral cloud environment, which eliminates the contamination vector this requirement addresses" is correct.

    ## SWGDE redistribution compliance

    The SWGDE redistribution policy requires:
    - Include version number (1.1) and creation date (March 2024) alongside any reference or quote
    - Do not use the SWGDE logo
    - Do not claim SWGDE endorsement of WRL
    - Paraphrase throughout rather than block-quoting. Cite section numbers for traceability.
    - Include full citation at first mention: "SWGDE Best Practices for Acquiring Online Content, 21-F-001, Version 1.1 (March 15, 2024)"

    ## Target length

    Approximately 2000 words of substantive prose (not counting the mapping table). This is longer than the security overview (~500 words) but comparable to legal-evidence.md (~1500 words) plus the additional per-section walkthrough content. The page must have enough substantive prose to be valuable to both readers and search engines -- a bare mapping table without explanation would be insufficient.

    ## SEO guidance (weave naturally, do not force)

    - Use the phrase "forensically sound" at least once in the introduction, where it fits naturally
    - Use "NIST-approved secure hash algorithms" alongside "SHA-256" in the hashing section
    - Use "digital evidence preservation" or "digital evidence collection" where naturally describing WRL's function
    - These terms should appear because the content warrants them, not because they are being targeted for SEO. The audience will spot inauthentic use immediately.

    ## What NOT to do

    - Do not modify any other files. This task produces only `site/content/security/swgde-compliance.md`.
    - Do not add JSON-LD structured data (this will be evaluated as a follow-up if warranted).
    - Do not add the page to navigation (Task 3 handles this).
    - Do not modify legal-evidence.md, verification.md, or architecture.md (Task 2 handles cross-references).
    - Do not cover SWGDE sections not in the assigned list (3.2, 3.3, 3.5, 5, 6, 7.1, 7.4, 8.1.2, 8.1.3) except in the brief "Sections not mapped" note.
    - Do not add a TechArticle JSON-LD block to this page. The seo-minion recommended it, but the existing site has no page-level structured data and adding a template mechanism for one page is scope creep. If JSON-LD proves valuable, it can be added site-wide later.

    ## TSA provider note

    The qualified eIDAS TSA provider is AlfaSign (replaced Sectigo on 2026-03-27). The standard RFC 3161 TSA is DigiCert. If you reference timestamps, use the current provider names. The subprocessors page (`site/content/security/subprocessors.md`) has the authoritative list.

- **Deliverables**: `site/content/security/swgde-compliance.md`
- **Success criteria**: Page follows the hybrid format (summary table + walkthrough), covers all 10 SWGDE sections with honest gap identification, uses qualified language throughout (never claims SWGDE certification), includes legal disclaimer, includes full SWGDE citation, reads naturally to a forensics professional.

---

### Task 2: Update Existing Docs with Cross-References

- **Agent**: user-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    You are adding lightweight cross-references from three existing WRL documentation pages to the new SWGDE compliance mapping page at `/security/swgde-compliance/`.

    ## Context

    A new SWGDE compliance mapping page has been created at `site/content/security/swgde-compliance.md`. It maps WRL's capabilities to SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024). You need to add brief cross-references from three existing pages so readers can discover the SWGDE mapping from relevant entry points.

    ## Files to modify

    ### 1. `site/content/legal-evidence.md`

    Add ONE paragraph cross-reference. Place it immediately after the "WRL vs. traditional evidence preservation" section heading (around line 151, after the horizontal rule that ends the eIDAS section, before the comparison table). The paragraph should be brief -- 2-3 sentences maximum:

    - What SWGDE is (one clause -- forensics examiners already know)
    - Who the SWGDE page is for (digital forensics examiners evaluating WRL against professional standards)
    - Link to the page: [SWGDE Compliance](/security/swgde-compliance/)

    Example tone (adapt, don't copy verbatim): "For a detailed mapping of WRL's capture process to the requirements in SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1), see [SWGDE Compliance](/security/swgde-compliance/). That page is aimed at digital forensics examiners evaluating whether WRL's automated pipeline aligns with their profession's published acquisition standards."

    Do NOT add the phrase "forensically sound" to existing copy on legal-evidence.md. The SEO-minion recommended weaving SWGDE terms into existing pages, but adding marketing-adjacent terminology to a carefully written legal page risks the tone. The cross-reference paragraph is sufficient.

    ### 2. `site/content/verification.md`

    Add ONE sentence cross-reference. Place it after the "What each check confirms" table or near the end of the "Under the hood" / trust model section. The sentence should note that WRL's SHA-256 hashing and documentation practices align with SWGDE sections 7.3 and 7.5, and link to the SWGDE page for the full mapping.

    Example: "WRL's use of SHA-256 hashing and automated collection documentation also aligns with SWGDE Best Practices for Acquiring Online Content (sections 7.3 and 7.5) -- see the [SWGDE Compliance mapping](/security/swgde-compliance/) for details."

    ### 3. `site/content/security/index.md`

    Add a new section entry following the existing pattern (heading, descriptive paragraph, link). Place it after the "Data Retention and Deletion" section (at the end of the page, before the Privacy Policy section). Follow the exact same format as existing entries: H2 heading, one substantial paragraph describing what the page covers and who it's for, then a link line.

    The paragraph should:
    - Name the SWGDE document and version
    - Describe what the mapping page does (section-by-section walkthrough of how WRL addresses SWGDE requirements)
    - Identify the audience (digital forensics examiners, investigators, and attorneys evaluating WRL against professional evidence acquisition standards)
    - Note the honest-disclosure approach (where WRL addresses requirements differently or where responsibilities fall to the examiner, the page says so)

    End with: `[Read the SWGDE Compliance Mapping](/security/swgde-compliance/)`

    ## Tone rules

    - Match the existing tone of each page exactly. These are carefully written documents for legal and forensics professionals.
    - Cross-references should be brief and informative, not promotional.
    - Never say "SWGDE-compliant" or "SWGDE-certified."
    - Use "aligns with," "maps to," or "addresses" when describing the relationship.

    ## What NOT to do

    - Do not modify architecture.md. software-docs-minion and seo-minion recommended it, but architecture.md serves developers and API consumers, not compliance evaluators. Cross-references should follow the reader's intent.
    - Do not add SWGDE terminology inline to existing prose on legal-evidence.md or verification.md beyond the cross-reference additions described above. The SEO value of weaving "forensically sound" and "NIST-approved" into existing pages is not worth the risk of disrupting carefully calibrated legal prose.
    - Do not modify the compare page, getting-started, or api-reference.
    - Do not create new files.
    - Do not modify the frontmatter of any page.

- **Deliverables**: Modified `site/content/legal-evidence.md`, `site/content/verification.md`, `site/content/security/index.md`
- **Success criteria**: Each cross-reference is brief (1 paragraph or 1 sentence), placed at the right location, uses qualified language, matches the existing page tone, and correctly links to `/security/swgde-compliance/`.

---

### Task 3: Update Navigation and LLMs Index

- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none (parallel with Task 1)
- **Approval gate**: no
- **Prompt**: |
    You are adding the new SWGDE Compliance page to WRL's site navigation and LLMs index.

    ## Files to modify

    ### 1. `site/_data/site.js`

    Add a new entry to the "Security & Compliance" nav section. Place it as the LAST item in the children array, after "Data Retention":

    ```js
    { title: "SWGDE Compliance", url: "/security/swgde-compliance/" }
    ```

    The current children array for "Security & Compliance" is:
    ```js
    [
      { title: "Overview", url: "/security/" },
      { title: "Whitepaper", url: "/security/whitepaper/" },
      { title: "Data Processing (DPA)", url: "/security/dpa/" },
      { title: "Subprocessors", url: "/security/subprocessors/" },
      { title: "Incident Response", url: "/security/incident-response/" },
      { title: "Data Retention", url: "/security/data-retention/" },
    ]
    ```

    Add the new entry after Data Retention. Keep the trailing comma consistent with the existing style.

    ### 2. `site/content/llms.njk`

    Add a new line to the "## Docs" section, after the "Data Retention" entry:

    ```
    - [SWGDE Compliance](https://docs.webresourceledger.com/security/swgde-compliance/): SWGDE 21-F-001 alignment mapping for forensic web capture
    ```

    Place it after the Data Retention line and before the blank line / "## Links" section.

    ## What NOT to do

    - Do not modify any other files.
    - Do not change the nav section name or reorder existing entries.
    - Do not add entries for pages that don't exist yet in other sections.

- **Deliverables**: Modified `site/_data/site.js` and `site/content/llms.njk`
- **Success criteria**: SWGDE Compliance appears as the last item in the Security & Compliance nav section. The llms.njk file includes the new page with its URL and description.

---

### Cross-Cutting Coverage

- **Testing**: EXCLUDED. This is a documentation-only task. No code changes, no runtime components, no executable output. The docs site build can be verified by the calling session if desired, but no test-minion task is warranted.
- **Security**: EXCLUDED. No new attack surface, no auth changes, no user input handling, no new dependencies. The only security-adjacent concern (overclaiming SWGDE compliance) is addressed by the tone and language rules baked into the Task 1 prompt.
- **Usability -- Strategy**: INCLUDED via specialist planning (ux-strategy-minion). Recommendations incorporated: page placed under Security & Compliance (evaluation job, not learning job), cross-linking strategy from legal-evidence and security overview, nav title "SWGDE Compliance" chosen for acronym recognition by target audience.
- **Usability -- Design**: EXCLUDED. No new UI components, no visual layouts, no interaction patterns. This is a markdown content page rendered by the existing doc template.
- **Documentation**: INCLUDED. This IS the documentation task. software-docs-minion (Task 1, Task 3) and user-docs-minion (Task 2) are the primary agents.
- **Observability**: EXCLUDED. No runtime components, no APIs, no background processes.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - seo-minion: Review the final page frontmatter, heading structure, and term usage to confirm the SEO guidance was incorporated where appropriate without keyword stuffing.
    Review focus: Title tag, meta description, heading hierarchy, and whether "forensically sound" and SWGDE terminology appear naturally in the prose.
- **Not selected**:
  - ux-design-minion: No UI components or visual layouts produced; pure markdown content rendered by existing template.
  - accessibility-minion: No new HTML patterns; existing doc template handles accessibility. Pure prose content.
  - sitespeed-minion: No new runtime code, no new assets, no performance impact.
  - observability-minion: No runtime components to monitor.
  - user-docs-minion: Already participating as an execution agent in Task 2; separate review would be redundant.

### Decisions

- **Page URL path: `/security/swgde-compliance/` over `/swgde/` or `/swgde-compliance/`**
  Chosen: `/security/swgde-compliance/` (nested under security)
  Over: `/swgde-compliance/` (flat, top-level) recommended by user-docs-minion; `/security/swgde/` recommended by ux-strategy-minion
  Why: The page belongs in the Security & Compliance section both conceptually and in navigation. A flat URL would be inconsistent with the existing security/* URL structure. Between `/security/swgde/` and `/security/swgde-compliance/`, the longer form is more descriptive and matches the nav title. The difference is minor.

- **Inline SEO term integration in existing pages: rejected**
  Chosen: Cross-reference paragraphs only; no inline terminology changes to existing prose
  Over: seo-minion's recommendation to weave "forensically sound," "NIST-approved secure hash algorithms," and "evidence contamination" into legal-evidence.md, verification.md, and architecture.md
  Why: The existing legal-evidence.md and verification.md have carefully calibrated prose for a skeptical legal/forensics audience. Adding SEO-motivated terminology risks disrupting the tone for marginal search benefit. The dedicated SWGDE compliance page is the right place for these terms. Cross-references from existing pages provide internal link equity without altering established copy.

- **JSON-LD structured data: deferred**
  Chosen: No TechArticle JSON-LD on the new page
  Over: seo-minion's recommendation for page-level TechArticle structured data
  Why: The existing site has no page-level structured data. Adding a template mechanism or one-off script block for a single page is scope creep (YAGNI). The page will be discoverable through standard indexing, sitemap inclusion, and internal linking. JSON-LD can be added site-wide as a separate initiative if search performance data warrants it.

- **architecture.md cross-reference: excluded**
  Chosen: Do not add cross-references to architecture.md
  Over: software-docs-minion and seo-minion both recommended adding SWGDE references to architecture.md
  Why: architecture.md serves developers and API consumers evaluating the system design. Adding compliance cross-references to a technical architecture page creates noise for the wrong audience. Cross-references should follow reader intent: legal-evidence.md and verification.md serve the forensics/legal audience that would naturally proceed to the SWGDE mapping. The security/index.md overview provides the third discovery path.

### Risks and Mitigations

1. **Overclaiming compliance** (HIGH RISK). The biggest risk is implying SWGDE endorsement or certification. SWGDE does not certify tools. Mitigation: The Task 1 prompt explicitly forbids "SWGDE-compliant," "SWGDE-certified," or "SWGDE-approved" language. The "How to read this mapping" section and three-posture classification (fully addressed / addressed differently / tenant responsibility) enforce honest disclosure. The approval gate provides human review before publication.

2. **Content staleness** (MEDIUM RISK). SWGDE 21-F-001 is Version 1.1 (March 2024). A Version 2.0 would make the mapping stale. Mitigation: The page pins the version explicitly in the title, introduction, and frontmatter. A note directs readers to verify the current version at swgde.org.

3. **SWGDE redistribution policy violation** (LOW RISK). The SWGDE document requires version number and creation date on all references. Mitigation: The Task 1 prompt requires full citation at first mention and version reference on all subsequent references. Paraphrasing is preferred over direct quotation.

4. **Keyword stuffing in existing pages** (LOW RISK, mitigated by excluding inline term changes). The seo-minion recommended weaving SWGDE terms into three existing pages. Forensics professionals would detect inauthentic terminology insertion. Mitigation: Inline term integration is rejected. Only cross-reference paragraphs are added.

5. **DigiCert/AlfaSign TSA provider references** (LOW RISK). The legal-evidence.md and subprocessors.md pages reference TSA providers. The qualified eIDAS TSA recently changed from Sectigo to AlfaSign. Mitigation: The Task 1 prompt notes the current provider names. Task 2 adds only cross-references, not provider-specific content, so no risk of stale provider names in the cross-references.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Create SWGDE Compliance Mapping Page  [GATE]
  Task 3: Update Navigation and LLMs Index

--- APPROVAL GATE after Task 1 ---

Batch 2 (after gate):
  Task 2: Update Existing Docs with Cross-References
```

Task 3 (navigation) runs in parallel with Task 1 because it only adds a nav entry and llms.txt line -- it doesn't depend on the page content. Task 2 (cross-references) is blocked by Task 1 because the cross-references should be consistent with the approved page content and anchor structure.

### Verification Steps

After all tasks complete:
1. Verify `site/content/security/swgde-compliance.md` exists and contains the summary table, all 10 section walkthrough headings, the legal disclaimer, and the full SWGDE citation.
2. Verify `site/_data/site.js` includes the SWGDE Compliance entry in the Security & Compliance section.
3. Verify `site/content/llms.njk` includes the SWGDE Compliance entry.
4. Verify `site/content/legal-evidence.md` has a cross-reference paragraph linking to `/security/swgde-compliance/`.
5. Verify `site/content/verification.md` has a cross-reference sentence linking to `/security/swgde-compliance/`.
6. Verify `site/content/security/index.md` has a new SWGDE section with descriptive paragraph and link.
7. Optionally: run `npx @11ty/eleventy --dryrun` or build the docs site locally to verify no broken links or build errors (if the calling session chooses to do this).
