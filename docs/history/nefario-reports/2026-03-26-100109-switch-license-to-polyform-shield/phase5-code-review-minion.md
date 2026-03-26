# Code Review: License Switch Apache 2.0 → PolyForm Shield 1.0.0

## Summary

Reviewed all 20 changed files across the license switch. The migration is thorough and consistent. No blocking issues found. Two nits worth noting.

---

VERDICT: APPROVE

FINDINGS:
- [NIT] docs/evolution/README.md:23 -- The entry for phase `0012-open-source-readiness` still reads "Open-source readiness: .gitignore, LICENSE, CI, contributor docs". This is a historical description of that phase and accurately describes what phase 0012 did at the time. It is not a claim about WRL's current license and does not need updating. Noted only for completeness.

- [NIT] README.md:3 -- The license badge links to `(LICENSE)` (the local file) rather than `https://polyformproject.org/licenses/shield/1.0.0/`. Both are reasonable choices. Linking to the canonical PolyForm URL is arguably more informative for readers viewing the badge on GitHub, since clicking through lands on the full license text with context rather than the raw LICENSE file. Low impact -- current link is not wrong, just a minor UX preference.

---

## Checklist

### Stale "Apache 2.0" references
No remaining Apache 2.0 references in any public-facing or user-visible file. References in evolution log files (`decisions.md`, `outcome.md`, `prompt.md`) are historically accurate descriptions of the prior state and are correct as written.

### Stale "open source" references describing WRL
None found. All public-facing content uses "source-available" or "public source code" consistently. The phrase "open source" appears only in:
- Evolution log files (historical context, correct)
- `CONTRIBUTING.md` line 107 ("outbound HTTP calls" -- different word entirely)
- `docs/evolution/README.md:23` ("open-source readiness" describing phase 0012 -- historical, see nit above)

### README badge correctness
Badge image URL (`img.shields.io/badge/License-PolyForm%20Shield%201.0.0-blue.svg`) is well-formed and will render correctly. Badge label matches the license name exactly.

### JSON-LD structural validity
All four JSON-LD blocks in `landing/public/index.html` parse as valid JSON. No JSON-LD in the other five landing pages (404, content-policy, privacy, refund-policy, security, terms) -- consistent with their scope.

The `SoftwareApplication` block correctly uses `"license": "https://github.com/benpeter/web-resource-ledger/blob/main/LICENSE"` pointing to the repo rather than claiming an SPDX type.

### openapi.yaml validity
License object is correctly structured:
```yaml
license:
  name: PolyForm Shield 1.0.0
  url: https://polyformproject.org/licenses/shield/1.0.0/
```
No SPDX `identifier` field present (correctly removed, since PolyForm Shield has no SPDX ID). `termsOfService` and `x-deprecation-policy` URLs reference files that exist in the repo. Structure is OpenAPI 3.1.0 compliant.

### package.json license fields
Both `package.json` and `packages/verify/package.json` use `"SEE LICENSE IN LICENSE"` -- the correct npm convention for non-SPDX licenses. Valid.

### CONTRIBUTING.md inbound=outbound clause
Present at lines 21-22: "By submitting a pull request, you agree that your contribution is licensed under the same terms." Clean and sufficient for the project's current scale (no external contributors). Consistent with the CLA rejection decision documented in `decisions.md`.

### Terminology consistency
"PolyForm Shield", "source-available", "public source code" used consistently and appropriately across all files. No terminology drift detected.

### Evolution log completeness
- `prompt.md`: Present
- `decisions.md`: Present, covers all key decisions (license choice, terminology, package.json field, CLA rejection, column rename)
- `outcome.md`: Present, lists all 19 changed files
- `docs/evolution/README.md`: Phase 0092 entry added at line 103
