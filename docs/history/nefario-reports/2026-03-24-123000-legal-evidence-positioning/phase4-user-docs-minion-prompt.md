## Task: Create the "Legal Evidence" docs guide page

You are creating a new documentation page at `site/content/legal-evidence.md` for the WRL docs site.

Working directory: /Users/ben/github/benpeter/web-resource-ledger/.claude/worktrees/declarative-roaming-hamster

### Audience

The primary audience is legal professionals (paralegals, IP attorneys, compliance officers) evaluating WRL for litigation or compliance use. Secondary audience is developers who need legal context.

**Critical**: This page must work as a standalone entry point. Legal professionals will arrive via search queries like "FRE 901 web page evidence" or "eIDAS qualified timestamp web archiving". The opening paragraph must orient them: what WRL is, what it produces (expand WACZ on first use: "Web Archive Collection Zipped (WACZ)"), and what this page covers.

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
What WRL is, what it produces, what this page covers. Keep factual. Expand WACZ acronym on first use.

#### 2. What a WRL capture proves
Brief summary: existence, integrity, and timing of web content. Frame in evidence language, not crypto language. Link to [Verification](/verification/) for the full trust model. Clarify: this section is about what the technical chain establishes; the FRE sections below map those capabilities to specific legal standards.

#### 3. Federal Rules of Evidence: Authenticating web evidence
Brief intro explaining that electronically stored information must be authenticated under Rule 901(b) before admission.

##### Rule 901(b)(9): Process or system
- WRL's automated capture pipeline (headless browser, no human intervention) is the "process or system"
- Ed25519 signatures prove output not modified
- RFC 3161 timestamps prove temporal accuracy via independent authority
- Public verification enables any party to confirm results
- FRAMING: "WRL provides the technical foundation that supports a 901(b)(9) authentication argument." Do NOT say "satisfies" or "meets"

##### Rule 902(14): Data authenticated by digital identification
- SHA-256 hash comparison is the canonical "process of digital identification" contemplated by 902(14)
- The Advisory Committee Notes explicitly cite hash value comparison
- WRL computes and records SHA-256 hashes for every artifact
- IMPORTANT: 902(14) still requires a certification from a qualified person, but WRL provides the infrastructure

##### Rule 902(13): Self-authenticating certification (Planned)
IMPORTANT: Include "Planned" in the section heading itself, not just body text. Legal professionals skim headings.
- 902(13) requires a written certification from a qualified person
- WRL is building a certification document generator
- Mark clearly as **Planned** -- do not imply this is available today
- Keep SHORT (one paragraph). Do NOT use "coming soon" -- use "planned"
- NOTE: This section is intentionally on the docs page only. The landing page omits 902(13) because R41 (certification document) has not shipped. This is by design.

##### Evidence foundation checklist
Table: "What opposing counsel will ask" | "How WRL addresses it"
- Who captured it? -> Automated process, no human intervention
- When was it captured? -> RFC 3161 timestamp from independent TSA
- Has it been altered? -> SHA-256 hashes + Ed25519 signature
- How do I verify independently? -> Public verification URL, CLI, or API
- Is the process reliable? -> Open-source verifier, deterministic pipeline

Add a brief note distinguishing this checklist (practical Q&A for trial prep) from the rule mapping above (legal standard analysis). They serve different purposes.

#### 4. eIDAS: Qualified electronic timestamps
- Quote or closely paraphrase Art. 41(2): "presumption of the accuracy of the date and the time it indicates and the integrity of the data to which the date and time are bound"
- Rebuttable presumption (shifts burden of proof)
- WRL's dual-timestamp architecture: standard RFC 3161 (DigiCert, on every capture) vs. qualified RFC 3161 (account-level opt-in)
- Art. 41(3): qualified timestamps recognized across all EU Member States
- IMPORTANT: Standard (DigiCert) timestamps are NOT eIDAS-qualified. Only the optional qualified timestamp triggers Art. 41(2). Be precise.
- Frame eIDAS as "supported" rather than "available on all captures"

Brief EU vs. US comparison (small table):
- US (FRE): authentication via judge as gatekeeper
- EU (eIDAS): legal presumption via qualified trust services

#### 5. WRL vs. traditional evidence preservation
Add a transitional sentence before this section explaining: "The previous sections covered legal standards. The next two sections compare WRL's approach to alternatives."

Comparison table. Columns: Approach, Integrity Proof, Time Proof, Independent Verification, Scalability.
Rows:
- Screenshot + affidavit: None (pixels editable) | Witness testimony | Only with testimony | Manual
- Wayback Machine: Institutional trust | Archive's database | Internet Archive staff | Free but limited
- WRL: Ed25519 + SHA-256 (open standard) | RFC 3161 independent TSA | Anyone, no account | API, per-capture

Brief paragraph: key differentiator is WRL's verification is independent of WRL.

Optional `<details>` block: "Why screenshots and affidavits fall short"

#### 6. How verification compares across capture services
Column header: "How Verification Works" (NOT "Integrity Approach")

Use DESCRIPTIVE PATTERNS, not competitor brand names:
- Open-standard signed archives (WRL)
- Web archive services
- Enterprise capture platforms
- Browser extension tools
- Manual screenshots

For each: what standards used, whether verification is independent of vendor, whether format is open.

RULES:
- Do NOT name competitors by brand name
- Do NOT say competitors are "weak" or "inadequate"
- Frame as "how verification works"
- Let the reader draw conclusions from facts

#### 7. Disclaimer (bottom of page)
Styled as a blockquote (use `>` markdown prefix):

> **This page is for informational purposes only and does not constitute legal advice.** The applicability of any legal standard depends on your jurisdiction, the specific proceeding, and the rules of the tribunal. Consult qualified legal counsel to evaluate how WRL evidence applies to your matter.

Do NOT place at top. Do NOT use `<details>`.

### Writing rules (non-negotiable)
1. "Designed to support" not "satisfies" or "meets"
2. Every FRE/eIDAS reference must cite a real rule number
3. No marketing language. No superlatives.
4. Cross-reference verification.md, do NOT duplicate it
5. FRE 902(13) clearly marked as Planned (in heading)
6. Distinguish standard vs. qualified timestamps
7. No case law citations (Lorraine, Vayner, etc.)

### What NOT to do
- Do NOT create sub-pages or nested navigation
- Do NOT duplicate the verification trust model (link to it)
- Do NOT name competitors by brand name
- Do NOT claim WRL evidence is "admissible" or "court-ready"
- Do NOT mention 902(13) as "coming soon" -- use "planned"
- Do NOT place the disclaimer at the top
- Do NOT add case law citations

### Deliverables
- New file: `site/content/legal-evidence.md`

When done, report: file path with change scope and line count, 1-2 sentence summary of what was produced.
