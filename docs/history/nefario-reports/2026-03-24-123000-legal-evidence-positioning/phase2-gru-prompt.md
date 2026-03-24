You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise to help build a comprehensive plan.

## Project Task
R42: Legal-evidence positioning (landing + docs) — Update WRL's landing page and docs with precise FRE 901/902 and eIDAS legal-evidence framing instead of vague compliance claims.

## Your Planning Question
Given WRL's current capabilities (Ed25519 signatures, RFC 3161 timestamps from DigiCert, eIDAS-qualified RFC 3161 timestamps via a qualified TSA, WACZ bundles with individual artifact hashes, independent verification via CLI and REST API, public verification URLs, key rotation with historical key archive), produce a claims matrix that maps each capability to the specific FRE and eIDAS provisions it supports. For each mapping, classify the claim strength as STRONG (directly satisfies the rule's requirements), SUPPORTIVE (contributes to but does not alone satisfy the rule), or FUTURE (requires capabilities not yet shipped).

Specific questions:
(a) Does Ed25519 + RFC 3161 satisfy FRE 901(b)(9) "process or system" authentication, or does it merely support it?
(b) What is the correct framing for 902(14) (certified records of a regularly conducted activity) given WRL is an automated system, not a business keeping records of its own activities — does this rule apply to WRL captures at all, or only to the capturing organization's use of WRL?
(c) With R41 (certification document) not shipped, can 902(13) be referenced at all, or must it be entirely deferred?
(d) For eIDAS Article 41(2), what is the precise legal effect WRL can claim for captures with qualified timestamps — is "presumption of accuracy of the date and time" the correct framing?
(e) Are there any claims the current landing page implicitly makes (e.g., "web evidence you can prove") that risk overclaiming given the actual legal standard for admissibility?

## Context
- Landing page: landing/public/index.html in the working directory
- Verification docs: site/content/verification.md
- R40 (eIDAS qualified timestamps): DONE (Phase 0063) — account-level opt-in, dual-TSA WACZ assembly
- R41 (certification document): NOT shipped — cannot generate FRE 902(13) certification documents yet
- Current hero: "Web evidence you can prove." with tagline about "signed, timestamped bundle that anyone can independently verify"
- The "no overclaiming" constraint is the hardest requirement — "legally admissible" is a court determination, not a product feature

## Instructions
1. Read the landing page and verification docs to understand current claims
2. Apply your domain expertise to produce the claims matrix
3. Classify each claim as STRONG / SUPPORTIVE / FUTURE with rationale
4. Identify any current claims that risk overclaiming
5. Return your contribution in this format:

## Domain Plan Contribution: gru

### Recommendations
<your expert recommendations>

### Proposed Tasks
<specific tasks that should be in the execution plan>

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>

6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-MyvylP/legal-evidence-positioning/phase2-gru.md
