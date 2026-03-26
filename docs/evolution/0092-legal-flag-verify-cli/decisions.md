# Decisions: --legal flag for verify CLI

## Separate module vs extending format.js

**Decision**: Created `format-legal.js` as a standalone module rather than
adding to `format.js`.

**Rationale**: Legal output has fundamentally different characteristics from
the existing formatters: no ANSI codes (structural, not flag-based), no
timestamp merging (timestamps shown individually), untruncated values, and
a 7-section document structure. Extending `format.js` would require either
heavy conditional branching or a shared-but-incompatible code path.
devx-minion and security-minion both recommended separation.

**Alternative considered**: Adding a `legal` parameter to `formatHuman()`.
Rejected because the output share almost no formatting code — different
structure, different content, different presentation rules.

## Report structure: 7 sections modeled on forensic declarations

**Decision**: Structured the report as a 7-section document:
1. Summary, 2. Subject of Verification, 3. Verification Checks Performed,
4. Chain of Custody, 5. Applicable Legal Standards, 6. Methodology,
7. Full Technical Details.

**Rationale**: user-docs-minion proposed this based on forensic expert
declaration formats. Each section serves a specific evidentiary purpose.
The structure was validated by security-minion who confirmed it covers
the chain of custody and trust model requirements.

## Factual assertions only — no legal conclusions

**Decision**: The report describes what was verified and what the results
were, but never claims the evidence "is admissible" or "proves" anything.
Legal references cite FRE 901(b)(9) and eIDAS Art. 41 with factual
descriptions of what those frameworks provide.

**Rationale**: The issue explicitly required "without claiming
admissibility." security-minion reinforced this — claiming admissibility
would be practicing law and could undermine the report's credibility.
A disclaimer at the end of Section 5 defers admissibility determination
to the court.

## Timestamps shown separately (not merged)

**Decision**: In legal mode, `timestamp` and `qualifiedTimestamp` checks
are shown as separate subsections in Section 3, unlike `formatHuman` which
merges them into a single "Time verification" row.

**Rationale**: Legal proceedings require distinguishing RFC 3161 standard
timestamps from eIDAS qualified timestamps because they carry different
legal weight. The merging done in `formatHuman` is a UX simplification
that would hide legally significant distinctions.

## Trust model warning leads Section 1 for embedded keys

**Decision**: When `--trust-embedded` is used, the SELF-ASSERTED warning
is the first thing in Section 1 (before the pass/fail summary) and is
repeated in Section 7 next to the embedded public key value.

**Rationale**: security-minion argued that trust model must lead the
report when embedded keys are used, not be buried. The warning is repeated
in Section 7 because someone reading technical details needs the context
without scrolling back.

## Reproducibility command built from result, not process.argv

**Decision**: The reproducibility command in Section 6 is reconstructed
from the verification result object, not from `process.argv`.

**Rationale**: security-minion identified that `process.argv` could leak
local filesystem paths (e.g., `--key-file /Users/alice/.ssh/wrl-key`).
Building from the result object ensures only the source, key resolution
method, and origin appear in the command. A note about `--trust-root`
was added since those paths can't be inferred from the result.

## Shell quoting in reproducibility command

**Decision**: Source paths and origin URLs in the reproducibility command
are wrapped in single quotes with proper escaping.

**Rationale**: Code review identified that filenames with spaces would
produce a broken command in a document whose purpose is reproducibility.
Added `shellQuote()` helper.

## Report format version (WRL-LEGAL-1.0)

**Decision**: Include a format version string in both text and JSON output.

**Rationale**: devx-minion proposed this. Legal reports submitted in
proceedings may need to be cross-referenced with the report format. If the
format changes, the version allows distinguishing which format produced
a given report. This is one constant, not a versioning framework.

## Summary count scoped to Section 3 checks

**Decision**: The "All N checks passed" count in Section 1 uses only
checks that appear in Section 3 (the `checkOrder` list).

**Rationale**: Code review identified that if a future check type were
added to the verifier but not to `checkOrder`, the summary would count
more checks than Section 3 displays. In a legal document, a numerical
discrepancy between the executive summary and the evidence section is
a factual inconsistency.
