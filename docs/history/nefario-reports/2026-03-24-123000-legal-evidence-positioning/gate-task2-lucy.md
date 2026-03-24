# Gate Review: Task 2 -- Legal Evidence docs guide page

**Reviewer**: lucy (consistency guardian)
**Verdict**: **APPROVE**

---

## Requirement Traceability

| Issue #142 Success Criterion | Deliverable Coverage | Status |
|---|---|---|
| Dedicated "Legal Evidence" guide page | `site/content/legal-evidence.md` exists, 132 lines | COVERED |
| How WRL captures satisfy FRE authentication requirements | 901(b)(9) at lines 27-38, 902(14) at lines 40-48 | COVERED |
| What the certification document contains (Planned) | 902(13) at lines 50-52; marked **Planned** twice, heading includes "(Planned)" | COVERED |
| Comparison: WRL cryptographic approach vs. traditional screenshots + affidavits | Lines 90-113 including table and expandable detail | COVERED |
| eIDAS qualified timestamps and EU proceedings | Lines 68-87 including Article 41(2) quote, US/EU comparison table | COVERED |
| Disclaimer: not legal advice, consult counsel | Line 131-132, blockquote at bottom | COVERED |
| Competitor comparison table with integrity approach column | Lines 117-127, descriptive patterns not brand names | COVERED |
| Copy reviewed for accuracy: no overclaiming | See accuracy findings below | COVERED |

No orphaned requirements. No orphaned plan elements.

---

## Accuracy and Hedging Check

**Language discipline is strong.** The page consistently uses "supports the argument that," "provides the technical foundation that supports," and "is designed to support" rather than claiming admissibility or compliance. Specific findings:

- **901(b)(9)**: Correctly framed as "supports a 901(b)(9) authentication argument" (line 38), not "satisfies" or "meets." Rule text accurately paraphrased from FRE 901(a) and 901(b)(9).
- **902(14)**: Correctly notes that WRL provides the technical infrastructure but "does not itself provide the certifying declaration" (line 48). This is an important distinction that avoids overclaiming.
- **902(13)**: Double-marked as Planned -- heading says "(Planned)" and body opens with "**Planned.**" and closes with "This feature is **planned** and not yet available." No ambiguity.
- **eIDAS Article 41(2)**: Direct quote from the regulation. Correctly distinguishes standard (DigiCert, not eIDAS-qualified) from qualified (account opt-in). The phrase "rebuttable presumption" is accurate for Article 41(2).
- **DigiCert as TSA**: Verified against `wrangler.toml` -- `TSA_URL = "https://timestamp.digicert.com"` in both production and staging. Naming is factually correct.
- **No case law citations**: Confirmed absent, per plan.
- **No marketing language or superlatives**: None found.

---

## Factual Verification Against Codebase

- **`/.well-known/signing-key` endpoint** (referenced at line 60): Confirmed exists at `src/index.js:69`.
- **`npx @w-r-l/verify`** (referenced at lines 36, 63, 98): Consistent with verification.md and index.md usage.
- **eIDAS qualified timestamps as account opt-in**: Confirmed -- R40 is marked DONE in backlog.md (Phase 0063), and `QUALIFIED_TSA_URL`/`QUALIFIED_TSA_AUTH` env vars exist in `src/wacz.js`.
- **Ed25519 signatures**: Consistent with codebase and existing docs.
- **SHA-256 hashes per artifact**: Consistent with WACZ bundle structure documented in verification.md.

---

## CLAUDE.md Compliance

- **YAGNI**: Page covers exactly what the issue requests. No speculative content.
- **KISS**: Straightforward structure. Tables used where they compress information. One expandable `<details>` for the screenshot deep-dive, which is appropriate -- it keeps the main flow concise.
- **Cross-references verification.md without duplicating it**: Line 19 links to `/verification/` for "how verification works." The page does not reproduce the check-by-check breakdown or the trust model details that live in verification.md. Clean boundary.
- **Frontmatter**: Uses `layouts/doc.njk`, consistent with all other `site/content/*.md` files.
- **No frameworks, no dependencies**: Content-only markdown. No scope issues.

---

## Scope Check

No scope creep detected. Every section traces to an explicit success criterion from issue #142. The evidence foundation checklist (lines 54-64) was not explicitly in the success criteria but is a natural derivation of "how WRL captures satisfy FRE authentication requirements" -- it is the same information reframed as practitioner guidance. This is proportionate, not gold-plating.

---

## Minor Observations (not blocking)

None. The deliverable is clean, well-hedged, factually verified, and precisely scoped.
