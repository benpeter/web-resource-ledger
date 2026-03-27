## Domain Plan Contribution: user-docs-minion

### Recommendations

#### 1. Framing: "alternative approach" -- not limitation, not equivalence

The SWGDE document (21-F-001, Version 1.1, March 2024) assumes a human examiner manually operating tools -- curl, wget, browser extensions, screenshot utilities -- with judgment applied at every step. WRL replaces that entire workflow with an automated, API-driven pipeline. The documentation should not frame this as a limitation. It should not pretend there is no difference either.

The correct framing is **"alternative approach that satisfies the same underlying principles through different mechanisms."** SWGDE section 3.1 defines three principles: relevance, reliability, and sufficiency. Section 8.1.1 explicitly recognizes API-based acquisition as the most inclusive method. The document's own hierarchy preferences utilities/APIs over browser capture and screenshots. WRL's automation is not a departure from SWGDE intent -- it is an implementation of the method SWGDE ranks highest.

For each SWGDE requirement, the compliance mapping should use a three-column structure:

| SWGDE Requirement | How WRL Addresses It | Notes |
|---|---|---|

The "Notes" column is where honest gaps and alternative-approach explanations go. This avoids a binary "compliant / not compliant" framing that does not fit. Some SWGDE concepts translate directly (hashing, format preservation). Others translate with a change of mechanism (examiner qualification becomes operator/system qualification). Others genuinely do not apply (sanitized hard drive, VPN configuration) because the capture environment is managed infrastructure, not an examiner's workstation.

The tone in the Notes column should be factual and precise: "SWGDE assumes examiner-operated tools on a local device. WRL captures run in a managed cloud environment where [specific mechanism] replaces [SWGDE concept]." No apologizing. No marketing. No hedging with "we believe" or "we feel." State the fact and the mechanism.

#### 2. Page structure: new standalone page, not a section within legal-evidence.md

The SWGDE compliance mapping should be a **new standalone page** (`swgde-compliance.md` or similar), not a new section within `legal-evidence.md`. Three reasons:

**Audience mismatch.** The existing `legal-evidence.md` serves attorneys evaluating WRL captures for courtroom use. It maps WRL properties to FRE 901/902 and eIDAS Article 41. The SWGDE page serves a different audience -- digital forensics examiners evaluating whether WRL's process meets their profession's best practices for evidence acquisition. The questions are different: "Will this survive a Daubert challenge?" vs. "Does this tool follow my discipline's published standards?" Combining these audiences on one page forces readers to scan past content that is not for them.

**Length and density.** The SWGDE document has 10 sections, many with subsections. A thorough mapping will produce a substantial page. Adding this to `legal-evidence.md` (already 193 lines) would push it past the point where scanning works. Forensics examiners evaluating tools will want to walk through the mapping section by section, referencing the SWGDE document alongside the page. A standalone page lets them do this without navigating around FRE rule analysis.

**Cross-reference, not duplication.** The two pages should cross-reference each other with lightweight pointers:

- `legal-evidence.md` gets a one-paragraph addition in its existing "WRL vs. traditional evidence preservation" section or immediately after it -- something like: "For a detailed mapping of WRL's capture process to SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024), see [SWGDE Compliance Mapping](/swgde-compliance/)."
- The new SWGDE page links back to `legal-evidence.md` for the FRE 901/902 analysis rather than restating it.
- Both pages link to `/verification/` and `/security/whitepaper/` for technical details.

This keeps each page focused on its audience and task.

#### 3. Handling SWGDE concepts with no direct WRL equivalent

Several SWGDE concepts do not map cleanly to WRL's automated model. Each needs its own treatment:

**Section 3.1 -- "Examiner qualification."** SWGDE says "the examiner should be prepared to explain the discovery of evidentiary online content, the acquisition process, and the reliability of the principles and methods implemented." In WRL's model, there is no examiner in the capture loop. The documentation should explain this honestly: WRL shifts the qualification requirement from "examiner who operated the tool" to "system whose process is documented, deterministic, and independently verifiable." The person introducing WRL evidence still needs to explain the system -- that is what the existing certification PDF, legal verification report, and process documentation exist for. The page should cross-reference the certification document (already documented in `legal-evidence.md` under Rule 902(13)) and the `--legal` flag on the verify CLI.

Frame as: "SWGDE requires that the examiner be prepared to explain the acquisition process. WRL provides the documentation to support that explanation: the certification PDF describes the automated pipeline, the verification report confirms the integrity checks, and the capture metadata records the exact conditions. The person presenting the evidence is responsible for reviewing and understanding these materials -- the same obligation that exists when any examiner presents results from any forensic tool."

**Section 3.4 -- "Evidence contamination" (clean device, no extraneous software).** SWGDE's concern is that browser plugins, cached data, or network artifacts on the examiner's device might contaminate the acquisition. WRL's captures run in Cloudflare's Browser Rendering environment -- a fresh, ephemeral browser instance with no plugins, no cache, no cookies, no browsing history. The documentation should state this directly: "Each capture runs in an isolated, ephemeral browser environment. There is no persistent state between captures, no installed extensions, and no cached data from prior sessions. This satisfies the contamination-prevention intent of SWGDE Section 3.4 through infrastructure design rather than examiner discipline."

**Section 4.1 -- "Configuration" (VPN, user agent, regional settings, sanitized device).** SWGDE recommends configuring the device to mimic the target audience (regional settings, user agent, IP address via VPN). WRL captures from Cloudflare's network, which means a fixed set of egress IP ranges and a standard Chromium user agent. The documentation should state what WRL does and does not allow: captures originate from Cloudflare's network (not the examiner's network), use a standard Chromium user agent, and do not currently support configurable geolocation or user agent spoofing. If these capabilities exist or are planned, state them. If they do not exist, say so plainly without treating it as a deficiency -- many forensic use cases do not require geographic masking.

**Section 7.3 -- "Hashing."** SWGDE requires NIST-approved hash algorithms for validation. WRL uses SHA-256, which is NIST-approved. This is a direct, clean mapping. State it simply.

**Section 7.4 -- "Network documentation" (packet captures, open connections).** SWGDE recommends logging network traffic during acquisition. WRL does not expose raw packet captures to the user. The WACZ format does include HTTP request/response pairs (WARC records), which serve a similar purpose at a higher abstraction level. The documentation should explain what is captured (full HTTP exchanges including headers, redirects, and response bodies) and what is not (raw TCP/UDP packet traces). This is a genuine scope difference, not a gap -- WARC-level records are standard in the web archiving discipline and provide more structured network documentation than raw packet captures for the specific purpose of web content preservation.

**Section 8.1.1 -- "Utilities / API acquisition."** This is the strongest alignment point. SWGDE explicitly identifies APIs as the most inclusive acquisition method and says this methodology "can frequently discover the most amount of evidence needed, as well as provide a reasonable amount of guarantee on reliability of evidence." WRL is an API-first tool. The mapping should quote this section and show how WRL's API satisfies each stated benefit: capturing visible content and metadata, scripting repeated collections, configuring acquisition parameters programmatically.

**Section 9 -- "Preservation."** SWGDE requires that acquired evidence be preserved in a manner that maintains integrity. WRL's WACZ bundles with SHA-256 hashes, Ed25519 signatures, and RFC 3161 timestamps are a direct answer. Cross-reference the verification page and the security whitepaper's encryption section.

#### 4. Tone and voice guidelines for the entire page

The page's audience is forensics professionals and attorneys who are skeptical by training. They will not be persuaded by marketing language. They will be persuaded by:

- **Precise technical mapping** -- "SWGDE requires X. WRL does Y. Here is how Y satisfies the intent of X."
- **Honest disclosure of differences** -- "SWGDE assumes Z. WRL does not do Z, because [reason]. Instead, WRL does W, which addresses the underlying concern through [mechanism]."
- **No overclaiming** -- Never say "SWGDE-compliant" or "SWGDE-certified." SWGDE does not certify tools or grant compliance status. The page title should be something like "SWGDE Alignment" or "SWGDE Mapping" -- not "SWGDE Compliance."

The existing `legal-evidence.md` already demonstrates the right tone. It uses careful qualifiers ("supports the argument that," "designed to support a 902(13) foundation," "does not itself satisfy the rule's requirements"). The SWGDE page should match this register exactly.

### Proposed Tasks

1. **Create `/site/content/swgde-compliance.md`** -- New standalone page with the full SWGDE section-by-section mapping. Structure:
   - Introduction (what SWGDE is, what this page does, explicit statement that SWGDE does not certify tools)
   - Summary table (all SWGDE sections mapped at a glance -- section number, requirement summary, WRL mechanism, status indicator using terms like "Direct," "Alternative mechanism," "Partial," "Not applicable")
   - Detailed section-by-section mapping (each SWGDE section as an H3, with the three-column treatment: requirement, WRL approach, notes)
   - A dedicated subsection on "Automated vs. Manual Acquisition" explaining the fundamental model difference once, so the per-section mappings can reference it rather than repeating the explanation
   - Standard legal disclaimer matching the one on `legal-evidence.md`

2. **Add cross-reference to `legal-evidence.md`** -- One paragraph in the "WRL vs. traditional evidence preservation" section pointing to the new page. Keep it short: what SWGDE is, who it is for, link.

3. **Add cross-reference to `verification.md`** -- Brief mention that verification results support SWGDE section 7.3 (hashing) and section 9 (preservation) requirements. One sentence with a link is sufficient.

4. **Review page title and frontmatter** -- The title should be something like "SWGDE Best Practices Alignment" (not "compliance"). The meta description should name the SWGDE document number and version for discoverability: "How WRL's automated capture pipeline maps to SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024)."

5. **Include the SWGDE redistribution notice** -- SWGDE's redistribution policy requires that references include the version number and creation date. Every reference to the SWGDE document on the page must include "21-F-001, Version 1.1, March 2024." Add a footnote or note box with the SWGDE disclaimer text and a link to the canonical URL on swgde.org.

### Risks and Concerns

1. **Overclaiming risk.** The biggest documentation risk is implying SWGDE endorsement or certification. SWGDE explicitly states: "references to specific tools are for demonstrative purposes only and are not an endorsement by SWGDE." The page must never claim WRL is "SWGDE-compliant" or "SWGDE-approved." Use "alignment" or "mapping" language throughout. I recommend a prominent note box at the top of the page stating this.

2. **Stale version risk.** SWGDE documents get revised. Version 1.1 is current as of March 2024, but a Version 2.0 could appear. The page should pin its reference to the specific version (21-F-001, Version 1.1, March 2024) and include a note that readers should verify they are referencing the current version at swgde.org. The SWGDE document itself says: "Readers are advised to verify on the SWGDE website that they are utilizing the current version."

3. **"Not applicable" framing risk.** When a SWGDE concept genuinely does not apply (e.g., sanitized hard drive), the documentation must explain why without sounding dismissive. The forensics examiner reading this page takes SWGDE seriously. "Not applicable because WRL is better" is the wrong tone. "Not applicable because the capture does not run on the examiner's device -- it runs in an ephemeral cloud environment, which eliminates the contamination vector this requirement addresses" is the right tone.

4. **Audience expertise assumption.** The page should not explain what SWGDE is to forensics examiners -- they know. But it should explain what SWGDE is to attorneys who may encounter it for the first time when an opposing expert cites it. A brief introduction paragraph serves both audiences: examiners skip it, attorneys read it. Use a `<details>` element for the longer explanation.

5. **Cross-reference maintenance.** Adding links from `legal-evidence.md` and `verification.md` to the new page creates a maintenance dependency. If the new page's URL changes, those links break. Use relative links and test them. Consider whether the new page belongs at `/swgde/` (short, memorable) or `/legal/swgde-compliance/` (nested under a legal category). Given the current flat structure of `/site/content/`, a top-level `/swgde-compliance/` or `/swgde/` is consistent.

6. **Legal disclaimer parity.** The new page must carry the same legal disclaimer as `legal-evidence.md`: "This page is for informational purposes only and does not constitute legal advice." The existing disclaimer text can be reused verbatim.

### Additional Agents Needed

- **software-docs-minion**: The SWGDE mapping will need to reference specific technical implementation details -- how the WACZ manifest works, what HTTP exchanges are recorded in WARC format, how the ephemeral browser environment is configured. The software-docs-minion should review the mapping's technical claims against the actual codebase (especially `src/capture.js`, `src/signing.js`, `src/rfc3161.js`, and the WACZ packaging logic) to ensure accuracy. Incorrect technical claims in a forensics-audience document would be damaging.

- No other agents needed. The legal framing already exists in `legal-evidence.md` and does not need to be recreated. The security whitepaper already covers the cryptographic details. This is a documentation structure and content task, not a code or design task.
