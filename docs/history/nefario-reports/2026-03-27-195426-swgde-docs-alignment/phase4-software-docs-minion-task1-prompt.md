You are creating a SWGDE compliance mapping page for the WRL documentation site.

## What to create

Create the file `site/content/security/swgde-compliance.md` -- a page that maps WRL's automated web capture capabilities to the requirements in SWGDE Best Practices for Acquiring Online Content (21-F-001, Version 1.1, March 2024).

## Context

SWGDE (Scientific Working Group on Digital Evidence) publishes best practices for digital forensics. Document 21-F-001 covers how forensic examiners should acquire online content. It assumes a human examiner manually operating tools on a forensic workstation. WRL is a fully automated, API-driven capture pipeline. The page must bridge this paradigm difference honestly.

The SWGDE PDF is available at: https://www.swgde.org/wp-content/uploads/2024/04/2024-03-15-SWGDE-Best-Practices-for-Acquiring-Online-Content-21-F-001-1.1.pdf

Fetch and read this PDF before writing the page. The exact wording of SWGDE requirements matters for accurate mapping.

## Existing docs to read first

Read these files to understand WRL's current documentation style, technical claims, and tone:

- site/content/legal-evidence.md -- the closest existing page in tone and audience
- site/content/verification.md -- covers SHA-256 hashing, Ed25519 signatures, RFC 3161 timestamps
- site/content/architecture.md -- covers capture pipeline, browser rendering, WACZ packaging
- site/content/security/whitepaper.md -- covers encryption, SSRF prevention, tenant isolation
- site/content/security/index.md -- Security & Compliance overview page

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

1. Title and introduction (2-3 paragraphs)
2. "How to read this mapping" section with three compliance postures: Fully addressed, Addressed differently, Tenant/examiner responsibility
3. Summary mapping table (10 SWGDE sections)
4. Section-by-section walkthrough (one H2 per SWGDE section): 3.1, 3.4, 4.1, 4.2, 4.3, 7.2, 7.3, 7.5, 8.1.1, 9
5. Legal disclaimer at the end

## Security review advisories to incorporate

- Cross-references to the whitepaper should stay as links, not expansions. Don't disclose implementation details beyond what the whitepaper already covers.
- Section 3.4 claims must be verifiable: "Fresh, ephemeral browser instance with no plugins, no cache, no cookies" is appropriate. Don't assert details about Cloudflare's internal isolation.
- "Tenant/examiner responsibility" framing: say "The examiner must assess legal authority" NOT "WRL does not validate whether the examiner has authorization."

## TSA provider note

The qualified eIDAS TSA provider is AlfaSign (replaced Sectigo on 2026-03-27). The standard RFC 3161 TSA is DigiCert. Use current provider names.

## Tone and language rules

- NEVER say "SWGDE-compliant," "SWGDE-certified," or "SWGDE-approved."
- Use "aligns with," "addresses," "maps to," "satisfies the intent of"
- Match legal-evidence.md register: careful qualifiers, precise technical mapping, honest disclosure
- No marketing language. State facts and mechanisms.
- Target ~2000 words of substantive prose

## SWGDE redistribution compliance

- Include version 1.1 and date March 2024 alongside references
- Do not use SWGDE logo
- Paraphrase rather than block-quote. Cite section numbers.
- Full citation at first mention

## SEO guidance (natural, not forced)

- Use "forensically sound" once in introduction where it fits naturally
- Use "NIST-approved secure hash algorithms" alongside SHA-256 in hashing section
- Use "digital evidence preservation" or "digital evidence collection" where natural

## What NOT to do

- Do not modify any other files
- Do not add JSON-LD structured data
- Do not add the page to navigation (separate task handles this)
