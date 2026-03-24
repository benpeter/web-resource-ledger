## Domain Plan Contribution: user-docs-minion

### Recommendations

#### Single page, not sub-pages

The new "Legal Evidence" guide should be a **single page with anchor sections**, not split across sub-pages. Here is why:

1. **Pattern consistency.** Every existing docs page (verification.md, authentication.md, batch.md, webhooks.md, etc.) is a single-page treatment with internal headings. There are no sub-page hierarchies anywhere in the current site. The sidebar nav in `site.js` is a flat list of top-level pages. Introducing a nested sub-navigation for one topic would break the mental model users have learned.

2. **Audience reading behavior.** A lawyer evaluating WRL will want to read (or at least skim) the full legal-evidence story in one pass. Splitting across sub-pages forces page-load interruptions and makes it harder to share "the legal evidence page" as a single URL with a colleague or opposing counsel. A single URL with anchor links lets them bookmark `#fre-authentication` or `#eidas-timestamps` and share exactly the section that matters.

3. **Content volume is manageable.** The longest existing page (webhooks.md) is ~335 lines including code blocks. The legal evidence page will be comparable in length -- no code samples, but several tables and a comparison section. This is well within single-page territory.

4. **Progressive disclosure handles depth.** Use `<details>` blocks (the same pattern verification.md uses for "Under the hood: how the trust model works") for deeper technical explanations that lawyers may want but that should not clutter the primary reading flow.

#### Proposed page structure and section headings

The reading order is designed for a lawyer evaluating WRL for the first time: it leads with what the evidence proves, maps to legal standards, then addresses how WRL compares to alternatives. A developer reading for technical context can scan the headings and jump directly to the section they need.

```
legal-evidence.md
```

**Frontmatter:**
```yaml
layout: layouts/doc.njk
title: Legal Evidence
description: How WRL captures map to FRE 901/902 authentication requirements and eIDAS Article 41(2) qualified timestamps. Comparison with screenshots, affidavits, and competing services.
```

**Section outline:**

```
# Legal Evidence

[2-3 sentence intro: WRL captures produce cryptographically signed,
independently timestamped evidence bundles. This guide explains how that
evidence maps to specific legal standards for authentication and
admissibility.]

## What a WRL capture proves

[Brief summary of what the evidence chain establishes -- existence,
integrity, and timing of web content. Not a rehash of verification.md
but a framing in evidence-language rather than crypto-language.
Link to Verification page for the full trust model.]

## FRE 901/902: Authenticating web evidence

[Explain the authentication requirement at a high level -- that
electronically stored information must be authenticated under
Rule 901(b) before it is admissible, and that self-authentication
under Rule 902 can avoid the need for live testimony.]

### Rule 901(b)(9): Process or system

[Map WRL's capture process to 901(b)(9) -- evidence produced by
a process or system shown to produce an accurate result. Explain
what a foundation witness or expert would testify to: the capture
process, the signing step, the independent timestamp. Show how WRL's
verification makes this testimony straightforward.]

### Rule 902(13)/(14): Self-authentication via certification

[Map WRL's signed WACZ bundles to 902(13) (certified records of a
regularly conducted activity) and 902(14) (certified data copied from
an electronic device). Explain that the Ed25519 signature + RFC 3161
timestamp provide the "certification" element. Note what a qualifying
certification requires and how WRL's public verification supports it.]

### Evidence foundation checklist

[Table: "What opposing counsel will ask" → "How WRL addresses it"
Rows: Who captured it? / When was it captured? / Has it been altered? /
How do I verify independently? / Is the process reliable?
Each answer maps to a specific WRL feature with a link to the
relevant docs section.]

## eIDAS: Qualified electronic timestamps

[Explain eIDAS Article 41(2): a qualified electronic timestamp
enjoys a presumption of accuracy of the date and time it indicates
and a presumption of integrity of the data to which it is bound.]

### How WRL timestamps meet Article 41(2)

[Map the RFC 3161 timestamp from a qualified TSA to the eIDAS
requirements. Explain the distinction between WRL's standard
timestamp (DigiCert RFC 3161, not qualified under eIDAS) and the
optional qualified timestamp (available as an add-on). Be precise
about which tier/configuration produces a qualified timestamp vs.
a standard one.]

### EU vs. US evidence standards

[Brief comparison table: US (FRE) relies on authentication and the
judge as gatekeeper; EU (eIDAS) provides legal presumption via
qualified trust services. WRL supports both models.]

## WRL vs. traditional evidence preservation

[Comparison table between WRL, manual screenshots + affidavits,
notarized screenshots, and the Wayback Machine. Columns: method,
integrity proof, timestamp proof, independent verification,
court-readiness, scalability/automation, cost per capture.]

<details>
<summary>Why screenshots and affidavits fall short</summary>

[Expanded discussion: screenshots have no integrity proof (any pixel
can be edited), affidavits attest to the human's memory and process
but not to the content's integrity, screenshots carry no timestamp
from an independent authority, and the entire evidentiary weight
rests on the credibility of the affiant rather than on cryptographic
proof that anyone can verify.]

</details>

## Integrity comparison with other capture services

[Table comparing WRL to competitors on specific integrity and
legal-evidence dimensions. Columns: feature, WRL, Competitor A
pattern, Competitor B pattern. Rows: hash chain verification,
independent timestamp (RFC 3161 vs. proprietary), open-format
archive (WACZ vs. proprietary), offline/independent verification,
public signing key, eIDAS-qualified option.

Do NOT name competitors. Use descriptive patterns: "centralized
notarization services," "browser extension capture tools,"
"web archive services." The comparison is about verifiable
properties, not brand names.]

## Disclaimer

[Positioned as the final section, clearly visible but not
undermining. Styled as a blockquote or callout, not buried in
fine print. Content:]

> **This page is for informational purposes only and does not
> constitute legal advice.** The applicability of any legal
> standard depends on your jurisdiction, the specific proceeding,
> and the rules of the tribunal. Consult qualified legal counsel
> to evaluate how WRL evidence applies to your matter.
```

#### Reading order rationale

The structure follows two reading paths:

**Lawyer evaluating WRL (reads top to bottom):**
1. "What does this prove?" -- immediate relevance check
2. FRE mapping -- "Does this fit the rules I work with?"
3. eIDAS -- "What about cross-border or EU matters?"
4. Comparison with alternatives -- "Is this better than what I do now?"
5. Competitor comparison -- "Why this service over others?"
6. Disclaimer -- expected, does not surprise

**Developer needing legal context (scans headings, jumps to section):**
- Already understands the crypto from verification.md
- Jumps to "Evidence foundation checklist" to understand what lawyers will ask about
- Jumps to "WRL vs. traditional evidence preservation" table to answer "why does this matter?"
- Skips eIDAS unless building for EU clients

#### Disclaimer positioning

The disclaimer belongs at the **bottom** of the page, not the top. Rationale:

1. A top-of-page disclaimer signals defensiveness. It says "we're worried about what follows" before the reader has any context. This undermines confidence.
2. A bottom-of-page disclaimer signals professionalism. The reader has already absorbed the substance. The disclaimer is expected legal hygiene -- like the fine print at the end of a financial document. Lawyers reading this page will expect it and would find its absence more concerning than its presence.
3. Use a styled blockquote (the `>` prefix WRL's docs already use for notes and warnings). This makes it visually distinct without requiring a new component. Do NOT use a collapsible `<details>` for the disclaimer -- it must be visible without user action.

#### Competitor comparison: section, not standalone page

The competitor comparison should be a **section within the guide**, not a standalone page. Reasons:

1. It is part of the evaluation narrative. A lawyer reads "what does WRL prove?" then "how does that compare to what I use now?" then "how does WRL compare to other capture services?" This is one decision flow, not three separate topics.
2. A standalone comparison page looks like marketing, not documentation. Embedded in the legal evidence guide, it serves the evaluator's need. Isolated on its own page, it looks like a sales tool.
3. The comparison should be structured around **verifiable technical properties** (does the service provide X?), not marketing claims. Keeping it in the docs guide maintains that tone.

#### Navigation placement

Add the new page to `site.js` nav as "Legal Evidence" positioned **after Verification and before Batch Captures**. The Verification page explains the trust model; the Legal Evidence page explains what that trust model means in legal proceedings. This is the natural conceptual progression:

```js
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
```

#### Cross-linking strategy

- **From verification.md:** Add a sentence at the end of the "What each check confirms" section: "For how these checks map to legal evidence standards, see [Legal Evidence](/legal-evidence/)."
- **From legal-evidence.md to verification.md:** Link to verification.md for the trust model details (Ed25519, RFC 3161, WACZ structure). Do NOT duplicate that content. Use phrases like "WRL's verification checks (described in detail in the [Verification](/verification/) guide) confirm..."
- **From index.md (Getting Started):** Add "Legal Evidence" to the "What's next" card grid with description: "Understand how WRL captures map to FRE 901/902 authentication and eIDAS qualified timestamps."
- **From landing page:** Product-marketing-minion owns this, but the docs link target should be `/legal-evidence/` on the docs site.

#### Content tone

This page sits at the intersection of technical documentation and legal communication. The tone must be:

- **Precise and factual.** No vague claims like "court-ready evidence" without explaining exactly what makes it court-ready. Every claim must be traceable to a specific WRL feature or legal rule.
- **Descriptive, not prescriptive.** "WRL captures provide the following properties that support authentication under FRE 901(b)(9)" -- not "WRL captures satisfy FRE 901(b)(9)." The page describes capabilities; the lawyer decides applicability.
- **Confident but bounded.** WRL does specific, verifiable things (signs bundles, obtains independent timestamps, provides offline verification). State these confidently. Do not overstate into "your evidence will be admitted" territory.
- **Free of marketing language.** No superlatives, no "industry-leading," no "best-in-class." The facts are compelling enough. Lawyers are trained to be skeptical of persuasive language in technical documents.

### Proposed Tasks

1. **Create `site/content/legal-evidence.md`** -- Write the full page following the section outline above. Use `layout: layouts/doc.njk` frontmatter consistent with all other docs pages. File name `legal-evidence.md` produces URL `/legal-evidence/` via Eleventy's default slug behavior.

2. **Update `site/_data/site.js`** -- Add `{ title: "Legal Evidence", url: "/legal-evidence/" }` to the nav array, positioned after Verification.

3. **Update `site/content/verification.md`** -- Add cross-link to the new Legal Evidence page at the end of the "What each check confirms" section (after the table, before the `---` divider).

4. **Update `site/content/index.md`** -- Add "Legal Evidence" card to the "What's next" card grid.

5. **Content review of legal claims** -- Every factual claim about FRE 901/902 and eIDAS Article 41(2) must be accurate to the current text of those rules. Research the actual rule text before writing. Do not rely on training-data summaries of legal rules. The disclaimer does not excuse inaccurate descriptions of the rules themselves.

6. **Verify eIDAS qualified timestamp status** -- The page must be precise about whether WRL's current DigiCert RFC 3161 timestamps are eIDAS-qualified or not. Check the actual product configuration. If WRL does not currently offer a qualified timestamp (from a QTSP on the EU trusted list), the page must say so clearly and describe it as a planned feature or optional add-on, not as a current capability.

### Risks and Concerns

1. **Overstating legal claims.** The biggest risk is claiming WRL evidence "satisfies" or "meets" a legal standard. No documentation can make that determination -- only a court can. Every statement must be framed as "WRL provides X, which supports/addresses Y requirement." The difference between "supports" and "satisfies" is the difference between helpful documentation and unauthorized practice of law. This framing must survive review.

2. **eIDAS precision.** The eIDAS section requires knowing whether WRL's current timestamp provider (DigiCert) is a Qualified Trust Service Provider under eIDAS. If DigiCert's RFC 3161 service is not on the EU Trusted List as a QTSP, then the timestamp is not "qualified" under eIDAS, and the page must clearly distinguish between "RFC 3161 timestamp from a recognized CA" and "qualified electronic timestamp under eIDAS Article 41(2)." Getting this wrong would be factually incorrect in a way that matters to the exact audience reading this page.

3. **Competitor comparison backlash.** Even unnamed, a comparison table can provoke responses from competitors. Keep the comparison strictly about verifiable technical properties (open format vs. proprietary, independent verification vs. centralized, RFC 3161 vs. proprietary timestamp). Never claim competitors are "less secure" or "less reliable" -- describe what they do and do not provide, and let the reader draw conclusions.

4. **Staleness.** Legal rules change. FRE amendments, eIDAS revisions (eIDAS 2.0 is already in progress), and new case law about web evidence authentication will eventually make parts of this page outdated. Consider adding a "Last reviewed: [date]" note at the bottom so readers know the currency of the legal analysis.

5. **Scope creep into legal advice.** The page should describe WRL's capabilities and how they map to legal frameworks. It should NOT advise readers on how to lay foundation, what to include in a certification, or how to present evidence to a court. Those are legal-advice questions that belong to the reader's counsel.

### Additional Agents Needed

- **product-marketing-minion** -- Already noted as handling the landing page. Should coordinate on consistent terminology between the landing page's legal-evidence messaging and the docs page. The docs page is the authoritative source of detail; the landing page should link to it without contradicting it.

- **Legal/compliance review** (human, not agent) -- The FRE 901/902 mapping and eIDAS Article 41(2) claims need review by someone with legal training. An agent can research the rule text, but the framing of "supports" vs. "satisfies" and the precision of the eIDAS qualified/non-qualified distinction should be validated by a human with legal domain knowledge before publication.

- **frontend-minion** (if applicable) -- No new UI components are needed. The page uses existing doc layout, existing `<details>` pattern, and existing blockquote styling. No frontend work required unless the landing page changes need new components (that is product-marketing-minion's call).
