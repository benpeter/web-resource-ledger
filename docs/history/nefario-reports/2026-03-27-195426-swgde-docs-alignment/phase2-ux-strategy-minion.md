## Domain Plan Contribution: ux-strategy-minion

### Recommendations

**Placement: Option 1 -- Security & Compliance. No new section, no Guide placement.**

The navigation decision comes down to understanding who arrives at this page, what job they are hiring it for, and what mental model they carry when they get there.

#### The user and their job

The primary persona is a digital forensics examiner or investigator evaluating whether WRL meets their professional standards for evidence collection tooling. Their JTBD: "When I am selecting or validating a web capture tool for forensic use, I want to confirm it aligns with SWGDE best practices, so I can defend my methodology in court or in a report."

This is an evaluation job, not a learning job. The examiner already knows SWGDE. They do not need to be educated about the standard -- they need to see a mapping between WRL's capabilities and the standard's requirements. This is the same mental model as someone checking a DPA against GDPR Article 28, or reviewing a whitepaper for SOC 2 alignment. It is a compliance-verification task.

#### Why Security & Compliance (Option 1)

1. **Mental model match.** The existing Security & Compliance section is already organized as "here is a standard or framework; here is how WRL maps to it." The DPA maps to GDPR Article 28. The whitepaper addresses eIDAS, GDPR, and security architecture. The SWGDE compliance mapping is structurally identical -- a standard-to-capability crosswalk. Placing it here preserves the section's internal consistency: every page in this section answers "does WRL meet requirement X?"

2. **Evaluator journey.** A forensics examiner evaluating WRL will scan the nav for compliance-related content. "Security & Compliance" is the natural magnet. They will not look under "Guides" -- guides are for people who have already decided to use the product and need help doing so. The examiner has not decided yet. They are in assessment mode, not implementation mode.

3. **Search arrival.** The GTM plan explicitly identifies that digital forensics professionals search for "SWGDE" by name. Someone arriving via search for "SWGDE web capture" or "SWGDE best practices WRL" will land directly on the page. Their next action is scanning the nav to orient themselves within the site. Seeing the page under "Security & Compliance" confirms they are in the right place. Seeing it under "Guides" creates a moment of dissonance -- "why is a compliance mapping in a getting-started guide?"

4. **Section size is fine.** Adding one page to Security & Compliance brings it to 7 items. This is within the 7 plus/minus 2 working memory limit and does not warrant a new section. Creating a "Standards & Compliance" top-level section (Option 3) for a single page violates the principle of proportionality -- it creates a structural promise the site cannot yet fulfill. If WRL later adds NIST, ISO 27001, or FedRAMP mappings, a dedicated section may become warranted. Not yet.

#### Why not Guides (Option 2)

The Legal Evidence page under Guides serves a different job. Its JTBD is: "When I am building a legal argument using WRL captures, I want to understand which Federal Rules of Evidence and eIDAS provisions apply, so I can prepare my evidence foundation." That page is instructional -- it teaches practitioners how to use WRL evidence in court. It is a "how to use" page.

The SWGDE mapping serves an evaluation job, not a usage job. Placing it next to Legal Evidence conflates two different user goals: "how do I use this evidence?" versus "does this tool meet my professional standards?" The examiner evaluating SWGDE compliance may never have used WRL and may not yet be a customer. They need compliance documentation, not a guide.

There is a strong case for cross-linking between the two pages. The Legal Evidence page should reference the SWGDE mapping for readers who want to go deeper on forensic methodology alignment. The SWGDE page should reference Legal Evidence for readers who want to understand the legal framework WRL supports. But cross-linking is not co-location.

#### Why not a new top-level section (Option 3)

Creating a "Standards & Compliance" section with one page is information architecture debt. It fragments the compliance story across two sections (the existing Security & Compliance and the new Standards & Compliance), forcing users to check two places. It also violates Krug's principle: the nav should be scannable and self-evident. Two sections with overlapping names ("Security & Compliance" vs "Standards & Compliance") create a "which one do I click?" moment. This is avoidable cognitive load.

If WRL eventually has 3-4 standards mappings (SWGDE, NIST 800-86, ISO 27037, ASTM E2916), splitting makes sense. For one page, it does not.

#### Recommended nav title and position

**Title: "SWGDE Compliance"**

Place it after "Data Retention" in the Security & Compliance section. This preserves the section's natural reading order: overview first, then the detailed whitepaper, then contractual/legal documents (DPA, subprocessors), then operational policies (incident response, data retention), and finally standards alignment (SWGDE). The examiner scanning the section will reach it at the bottom, which is appropriate for a page that serves a narrower audience than the whitepaper or DPA.

The title "SWGDE Compliance" is preferred over alternatives:
- "SWGDE Best Practices" -- too vague; sounds like WRL is offering best practices rather than demonstrating compliance with them
- "SWGDE Mapping" -- too technical/internal; sounds like a spreadsheet
- "Forensic Standards" -- too broad; makes a promise the single page cannot fulfill
- "SWGDE Compliance" -- clear, specific, uses the acronym the target audience searches for, and communicates the page's purpose (demonstrating alignment)

#### Cross-linking strategy

The SWGDE page should be discoverable from three entry points:

1. **Legal Evidence page** -- add a brief mention in the introductory section or after the "Evidence foundation checklist" table: "For alignment with SWGDE Best Practices for Acquiring Online Content, see [SWGDE Compliance](/security/swgde/)."
2. **Security & Compliance overview** -- add a paragraph describing the SWGDE mapping, following the pattern of the existing section descriptions.
3. **Compare page** -- if the compare page mentions forensic use cases or methodology, link to SWGDE compliance there as well.

These cross-links serve the two arrival journeys: the examiner who finds WRL through the Legal Evidence page (organic journey) and the examiner who searches for SWGDE directly (search journey).

### Proposed Tasks

1. **Add "SWGDE Compliance" to the Security & Compliance nav section** in `site/_data/site.js`, positioned after Data Retention. URL: `/security/swgde/`.

2. **Add a cross-link from Legal Evidence to SWGDE Compliance.** One sentence near the bottom of the Legal Evidence page or after the evidence foundation checklist, pointing forensics-oriented readers to the SWGDE mapping.

3. **Add a SWGDE Compliance entry to the Security & Compliance overview page** (`site/content/security/index.md`), following the existing pattern of a heading, a descriptive paragraph, and a link. The paragraph should describe what SWGDE is, what the page covers, and who it is for.

4. **Content structure recommendation for the SWGDE page itself** (for the content author to follow):
   - Lead with a one-paragraph summary of what SWGDE 21-F-001 requires and WRL's alignment posture
   - Use a requirements-mapping table (SWGDE requirement in left column, WRL capability in right column, with status indicators for full/partial/not applicable)
   - Call out any gaps honestly -- the Security & Compliance section's credibility depends on the same honesty principle stated in the overview page ("honest disclosure over marketing claims")
   - End with a cross-link back to Legal Evidence and the Security Whitepaper for readers who want the full technical and legal detail

### Risks and Concerns

1. **Acronym opacity.** "SWGDE" is meaningful to digital forensics practitioners but opaque to all other audiences. This is acceptable because the page serves a narrow, expert audience. The nav title "SWGDE Compliance" is a signal that filters correctly: the right people recognize it immediately; others correctly skip it. Do not try to make the title more "accessible" -- doing so would dilute the signal for the actual audience.

2. **Section bloat risk.** Security & Compliance is already the largest nav section (6 items, becoming 7). If WRL adds more standards mappings (NIST, ISO, ASTM), the section will need restructuring. Consider this a future concern, not a current one. The trigger for restructuring would be hitting 9-10 items in the section.

3. **Content tone risk.** The SWGDE page must match the tone established in the Security & Compliance overview: "technical evidence, not sales material." The page should not overclaim alignment. Where WRL partially meets or does not meet a SWGDE recommendation, say so. The GTM plan's positioning decisions explicitly call for honesty about limitations. A forensics examiner will trust a page that says "we meet 14 of 17 recommendations; here is what we do not cover" far more than one that claims full compliance.

4. **Cross-link maintenance.** The Legal Evidence page currently mentions DigiCert as the TSA provider, but the TSA provider recently changed to AlfaSign. Ensure any cross-linking or content referencing timestamps is consistent with the current state. (This is a content accuracy concern, not an IA concern, but it surfaces during the cross-linking work.)

5. **SEO consideration.** The page URL `/security/swgde/` is correct for IA purposes but should also have meta description and title tag that include the full expansion "Scientific Working Group on Digital Evidence" for search discoverability. The GTM plan identifies that forensics professionals search for SWGDE by name, so the acronym in the URL and title is the right call.

### Additional Agents Needed

- **Content/copy author** (or the agent writing the actual SWGDE page content): needs the UX structure recommendation from task 4 above to ensure the page follows the right content pattern. The content must be reviewed against the SWGDE 21-F-001 document itself -- the mapping should be requirement-by-requirement, not a general narrative.

- **SEO-aware agent** (if available): should review the final page title, meta description, and heading structure to ensure the page is discoverable for "SWGDE web capture," "SWGDE best practices compliance," and "forensic web evidence tool" searches. The GTM plan identifies this as a key discoverability channel.

- No additional UX strategy work is needed. The IA decision is straightforward and the risks are manageable.
