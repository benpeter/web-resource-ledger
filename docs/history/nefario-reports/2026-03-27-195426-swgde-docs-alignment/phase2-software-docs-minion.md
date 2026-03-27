## Domain Plan Contribution: software-docs-minion

### Recommendations

#### 1. Use a hybrid format: section-by-section walkthrough with a summary mapping table

The page should use a **section-by-section walkthrough** as the primary structure, not a capability-mapping table. Rationale:

- SWGDE 21-F-001 is a 10-page document written for forensic examiners. Its sections have specific, concrete requirements (e.g., "NIST-approved secure hash algorithms should be used"). A mapping table would compress the nuance into cells too small to honestly distinguish where WRL fully satisfies a requirement vs. where it satisfies the intent through different means vs. where the requirement falls outside WRL's automated model entirely.
- The audience for this page -- digital forensics practitioners, attorneys, and technical evaluators -- will be looking up specific SWGDE sections by number. A walkthrough lets them navigate directly to the section they care about.
- However, a **summary mapping table at the top** (before the walkthrough) serves as a quick-reference index. Each row: SWGDE section number, section title, compliance posture (one of: "Fully addressed", "Addressed differently", "Tenant/examiner responsibility", "Not applicable"), and an anchor link to the detailed walkthrough section below.

This is the pattern the existing `legal-evidence.md` uses implicitly: a high-level summary ("What a WRL capture proves") followed by detailed per-rule analysis. The SWGDE page should follow the same rhythm.

#### 2. Self-contained content vs. cross-references: apply this decision rule

**Self-contained** (write the content directly in the SWGDE page) when:
- The SWGDE requirement maps to a WRL capability that is not covered in existing docs, or is covered only tangentially
- The mapping requires explaining how WRL's automated approach satisfies a requirement written for manual examiners -- this contextual translation does not belong scattered across other pages

**Cross-reference** (link to existing page with a brief bridge sentence) when:
- The existing page already contains the authoritative explanation and the SWGDE mapping is a straightforward "WRL does X, see [page] for details"
- Duplicating the content would create a staleness risk

Specific decisions per SWGDE section:

| SWGDE Section | Content Strategy | Reason |
|---|---|---|
| 3.1 Principles (relevance, reliability, sufficiency, reproducibility) | Self-contained with cross-ref to `/verification/` | The mapping of "auditable and repeatable" to WRL's deterministic pipeline is novel analysis not in existing docs. Link to verification for the reproducibility evidence. |
| 3.4 Evidence Contamination | Self-contained | SWGDE discusses examiner interaction contamination. WRL's approach (no examiner touches the content; fresh BrowserContext per capture) is a fundamentally different model. This difference must be explained in place, not deferred. |
| 4.1 Configuration | Self-contained with cross-ref to `/architecture/` | SWGDE wants pre-documented device/browser config. WRL's equivalent is the deterministic pipeline config (headless Chromium version, no extensions, no cookies). Link to architecture for the pipeline diagram. |
| 4.2 Content Volatility | Self-contained with cross-ref to `/schedules/` and `/batch/` | WRL addresses volatility through scheduled captures and batch API. Brief explanation here, link out for details. |
| 4.3 Tool Validation | Self-contained with cross-ref to `/verification/` and security whitepaper | SWGDE refers to its own "Minimum Requirements for Testing Tools" companion doc. WRL's approach (open-source verifier, deterministic pipeline, CI test suite) is the equivalent. Needs its own explanation. |
| 7.2 Format | Self-contained with cross-ref to `/architecture/` | SWGDE wants native format preservation. WRL uses WACZ (open standard ZIP archive containing WARC files). Brief explanation of format choice rationale here. |
| 7.3 Hashing | Cross-reference to `/verification/` (What each check confirms) | The existing verification page already explains SHA-256 per-artifact and bundle-level hashing in detail. A brief statement about NIST-approved algorithm choice (SHA-256) with a link is sufficient. |
| 7.5 Collection Documentation | Self-contained with cross-refs to `/legal-evidence/` (certification document) and `/verification/` (legal report) | SWGDE lists specific documentation items (URL, timestamps, examiner identity, etc.). Map each item to where WRL records it. The certification PDF and legal report are the primary vehicles. |
| 8.1.1 Utilities / API | Cross-reference to `/api-reference/` and Getting Started | SWGDE describes API-based acquisition as the "most inclusive" method and "preferred over" browser capture and screenshots. WRL is exactly this model. Brief statement positioning WRL within SWGDE's acquisition hierarchy, then link to API docs. |
| 9 Preservation | Self-contained with cross-refs to `/security/data-retention/` and `/architecture/` | SWGDE wants forensic-image-level preservation with examiner name, date/time, evidence descriptions. Map WRL's R2 storage, hash-addressed bundles, and WACZ structure to this. Honestly note what WRL does differently (no forensic disk image -- the WACZ bundle itself is the preservation format). |

#### 3. Honestly distinguish automated vs. manual-examiner model

This is the most important structural decision. SWGDE 21-F-001 is written for a human examiner who manually operates tools. WRL is a fully automated pipeline. The page must establish this difference upfront and maintain it throughout. I recommend:

- An **introductory section** (after the summary table, before the walkthrough) titled something like "How to read this mapping" or "WRL's automated approach" that explains the paradigm difference in 2-3 paragraphs. Key points:
  - SWGDE assumes a forensic examiner using manual tools on a forensic workstation. WRL is an automated API service.
  - Where SWGDE says "the examiner should," WRL's equivalent is the automated pipeline design. The examiner's judgment is replaced by deterministic process decisions made at design time, not capture time.
  - Where SWGDE requires examiner-specific actions that cannot be automated (e.g., assessing legal authority under 3.5, selecting VPNs for covert investigation under 4.1), the page says so explicitly and identifies these as tenant/examiner responsibilities.
  - This framing avoids two failure modes: (a) claiming WRL "complies" with requirements that assume a human examiner, which would be misleading; and (b) dismissing SWGDE requirements as inapplicable just because WRL is automated, which would be intellectually dishonest.

- Each walkthrough section should use a consistent pattern:
  1. Quote or paraphrase the SWGDE requirement (with section number)
  2. State how WRL addresses it (or doesn't)
  3. Where the approach differs from the manual model, explain why the automated approach achieves the same evidentiary goal
  4. Where it genuinely doesn't (e.g., covert acquisition via VPN), say so and note it as a tenant responsibility

#### 4. Page placement in site navigation

The page fits in the **Security & Compliance** nav section, between the existing entries. It should be added as a peer of the whitepaper and other compliance-oriented docs. The `site.js` nav should add:

```js
{ title: "SWGDE Compliance", url: "/security/swgde-compliance/" }
```

However, the planning question says `site/content/swgde-compliance.md` (top-level). I recommend `site/content/security/swgde-compliance.md` instead, because:
- It is a compliance mapping document, not a user guide
- It sits naturally alongside the whitepaper, DPA, and subprocessors list
- The audience (evaluators, counsel) will look in "Security & Compliance" not "Guides"

If the task requires it at the top level, it still works, but the nav entry should go in the Security & Compliance section regardless.

#### 5. Cross-references FROM existing pages INTO the new SWGDE page

Three existing pages should add brief cross-references to the SWGDE page:

1. **`legal-evidence.md`** -- Add a sentence in the intro or after the eIDAS section: "For how WRL captures map to SWGDE best practices for digital evidence acquisition, see [SWGDE Compliance](/security/swgde-compliance/)." This is the most important cross-reference because legal-evidence.md is the main page for legal evaluators.

2. **`verification.md`** -- Add a sentence after the "What each check confirms" table or in the "Under the hood" section, noting that the hashing and documentation practices align with SWGDE 7.3 and 7.5. Brief mention, link to the SWGDE page for the full mapping.

3. **`security/index.md`** -- Add a new entry in the overview list, similar to the existing whitepaper/DPA/subprocessors entries. One paragraph describing what the SWGDE compliance mapping covers and who it is for.

Do NOT add cross-references from `architecture.md`, `getting-started`, or `api-reference.md`. Those pages serve developers and API consumers, not compliance evaluators. Cross-references should follow the reader's intent, not create noise in unrelated pages.

#### 6. SWGDE redistribution compliance

The SWGDE document's cover page includes a redistribution policy. Key constraint: "Any reference or quote from a SWGDE document must include the version number (or creation date) of the document and also indicate if the document is in a draft status."

The page must:
- Cite "SWGDE Best Practices for Acquiring Online Content, 21-F-001, Version 1.1 (March 2024)" in full at first mention
- Include the version number alongside any direct quotes
- Not use the SWGDE logo
- Not claim SWGDE endorsement of WRL

### Proposed Tasks

1. **Create `site/content/security/swgde-compliance.md`** with:
   - Frontmatter (layout, title, description) matching existing doc conventions
   - Brief introduction: what SWGDE 21-F-001 is, why it matters, full citation
   - "How to read this mapping" section explaining the automated-vs-manual paradigm
   - Summary mapping table (section number, title, posture, anchor link)
   - Section-by-section walkthrough for all 10 SWGDE sections listed in the task
   - Closing disclaimer (matching the style of the legal-evidence.md disclaimer)
   - Target length: 800-1200 words (comparable to the security overview page; shorter than legal-evidence.md which runs ~1500 words)

2. **Update `site/_data/site.js`** to add the SWGDE page to the Security & Compliance nav section.

3. **Add cross-reference to `site/content/legal-evidence.md`** -- one sentence with link, placed after the eIDAS section or in the intro.

4. **Add cross-reference to `site/content/verification.md`** -- one sentence with link, placed after the "What each check confirms" table.

5. **Add entry to `site/content/security/index.md`** -- one paragraph describing the SWGDE mapping, matching the format of existing entries (whitepaper, DPA, etc.).

### Risks and Concerns

**Risk 1: Over-claiming compliance.** SWGDE 21-F-001 is written for forensic examiners operating manual tools. Mapping an automated API to this standard risks implying a level of "compliance" that is misleading. The page must use language like "how WRL addresses" rather than "WRL complies with." WRL cannot "comply" with a standard that assumes a human examiner makes decisions at capture time.

Mitigation: The "How to read this mapping" section and the per-section distinction between "fully addressed," "addressed differently," and "tenant/examiner responsibility" handle this. The writer must resist the temptation to claim compliance where WRL's approach is genuinely different.

**Risk 2: Content staleness.** The SWGDE document is Version 1.1 (March 2024). If SWGDE publishes a 2.0, this page becomes stale. The page should pin the version explicitly in its title or first paragraph so readers can tell whether the mapping is current.

Mitigation: Pin the version. Add a note that readers should verify they are using the current version of the SWGDE document at swgde.org.

**Risk 3: Quoting restrictions.** SWGDE's redistribution policy requires version numbers on quotes. The writer must paraphrase rather than block-quote SWGDE text, and include the version reference for any direct quotations.

Mitigation: Paraphrase throughout. Cite section numbers for traceability. Include full version citation at first mention.

**Risk 4: Scope creep into sections not assigned.** The SWGDE document also covers sections 3.2 (Accessibility), 3.3 (Supplemental Preservation), 3.5 (Legal Authority), 5 (Goals of Acquisition), 6 (Categories), 7.1 (Screen Captures), 7.4 (Network Documentation), 8.1.2 (Browser Extensions), and 8.1.3 (Screenshots). Some of these are relevant to WRL (e.g., 7.1 -- WRL captures screenshots). The page should acknowledge unmapped sections briefly ("The following SWGDE sections address aspects outside WRL's automated model...") rather than silently omitting them.

Mitigation: Add a brief "Sections not mapped" note at the end of the summary table or after the walkthrough, listing excluded sections with one-line explanations of why.

**Risk 5: Section 4.1 contamination concerns specific to WRL's cloud model.** SWGDE 4.1 discusses configuring the device to avoid cross-contamination and using VPNs to control the capture profile. WRL captures run from Cloudflare's network (known IP ranges, standard Chromium user agent). This is transparent, not covert. The page must be honest that WRL is not a covert acquisition tool and its capture profile is not configurable per-investigation.

Mitigation: State this directly. WRL's captures are from a known cloud infrastructure profile. If the investigation requires mimicking a specific user profile or geographic location, WRL does not currently support this.

### Additional Agents Needed

**No additional agents required for this task.** The work is entirely documentation and falls within the software-docs-minion domain. However:

- The **implementation agent** writing the actual markdown should have access to the full SWGDE PDF (all 12 pages) during execution, not just the section summaries. The exact wording of SWGDE requirements matters for honest mapping. The full document is available at: `https://www.swgde.org/wp-content/uploads/2024/04/2024-03-15-SWGDE-Best-Practices-for-Acquiring-Online-Content-21-F-001-1.1.pdf`

- If the plan calls for **legal review** of the compliance claims before publication, that is a human (Ben) decision, not an agent task. The page explicitly disclaims legal advice, but the compliance posture claims ("fully addressed" vs. "tenant responsibility") carry implicit weight.
