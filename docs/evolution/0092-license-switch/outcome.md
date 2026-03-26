---
phase: "0092"
name: license-switch
---

# Outcome

## What changed

19 files changed across the repository.

**License file**
- `LICENSE` -- replaced Apache 2.0 text with PolyForm Shield 1.0.0 full text.

**Package manifests**
- `package.json` -- `"license"` field changed from `"Apache-2.0"` to
  `"SEE LICENSE IN LICENSE"`.
- `packages/verify/package.json` -- same change.

**API specification**
- `openapi.yaml` -- license object updated: name changed to
  "PolyForm Shield 1.0.0", url updated to polyformproject.org, SPDX identifier
  field removed (PolyForm Shield has no SPDX ID).

**Contributor documentation**
- `CONTRIBUTING.md` -- added License section with inbound=outbound clause in
  place of a CLA.

**READMEs**
- `README.md` -- license badge and license section updated.
- `packages/verify/README.md` -- license reference updated.

**Landing page (7 files)**
- Footer tagline, FAQ answer, structured data (`@type: SoftwareApplication`
  `license` field), and meta descriptions updated.
- All occurrences of "open source" describing WRL changed to "source-available"
  or "public source code".

**llms.txt**
- Updated license field and added clarifying note for LLM consumers distinguishing
  source-available from open source.

**Docs site (4 files)**
- `compare.njk` -- "Open Source" column header renamed to "Source".
- Security pages -- license references updated.
- Legal-evidence page -- license reference updated.

## Backlog changes

None. This phase was not in the backlog and produced no new deferred items.
