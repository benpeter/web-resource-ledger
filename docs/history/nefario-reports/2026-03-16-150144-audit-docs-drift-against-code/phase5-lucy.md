# Lucy Audit -- docs-drift-against-code

Reviewed: openapi.yaml, README.md, CONTRIBUTING.md, PRODUCT.md, docs/MVP.md
CLAUDE.md sources: project CLAUDE.md, CLAUDE.local.md, global CLAUDE.md

---

VERDICT: ADVISE

---

FINDINGS:

- [BLOCK] docs/evolution/ -- Evolution log entry missing for this orchestration phase.
  CHANGE: A nefario orchestration that produces a PR must have a numbered phase directory
  (`0021-docs-drift-audit/`) with `prompt.md`, `decisions.md`, `outcome.md`, and
  `process.md`. None of these files exist. The evolution index `docs/evolution/README.md`
  also requires an entry.
  WHY: CLAUDE.md "Evolution Log" section states this is "non-negotiable -- the build
  process is as much a deliverable as the product itself." The "Process Documentation"
  section additionally requires a `process.md` "after every nefario orchestration that
  produces a PR." This orchestration is described as producing a PR.
  FIX: Create `docs/evolution/0021-docs-drift-audit/` with all four required files.
  Add an index entry to `docs/evolution/README.md`. This must happen before the
  orchestration session ends per CLAUDE.md.

- [ADVISE] openapi.yaml:1515-1582 (GET /.well-known/signing-keys) -- Missing `503`
  response on the key archive endpoint.
  CHANGE: `GET /.well-known/signing-keys` declares `429` as its only error response.
  Its peer endpoint `GET /.well-known/signing-key` (line 1510-1513) declares both
  `429` and `503`. The `Problem503` component models "required configuration is missing
  or service is at capacity" -- both conditions can occur on the key archive endpoint
  identically to the singular endpoint.
  WHY: Asymmetry between peer endpoints introduces a spec correctness gap. The key
  archive endpoint depends on KV (same as the singular endpoint) and shares the same
  503-triggering conditions. This was the last endpoint in the file; the 503 was likely
  omitted by oversight during the +354/-56 line edit.
  FIX: Add `'503': $ref: '#/components/responses/Problem503'` after line 1582 on the
  `/.well-known/signing-keys` GET operation.

- [NIT] README.md:346 -- `X-RateLimit-Limit` description omits the singular signing-key
  endpoint from the rate-limited set.
  CHANGE: The description reads "Present on responses from rate-limited endpoints
  (captures, verification, key archive)." The openapi.yaml shows `X-RateLimit-Limit`
  is also present on `GET /.well-known/signing-key` (singular, line 1476-1477), which
  is not "key archive."
  WHY: Minor doc/spec disagreement introduced by naming. The README collapses both
  signing-key endpoints under "key archive" but the singular endpoint is its own
  distinct concept referenced separately throughout the README.
  FIX: Expand to "captures, verification, and signing-key endpoints" or "captures,
  verification, key, and key archive" to match the openapi.yaml surface exactly.

---

TRACEABILITY:

| Requirement | Plan Element | Status |
|---|---|---|
| Fix docs drift from Act 1 PRs | openapi.yaml: 13 fixes, headers/staging/health/rotation | COVERED |
| Fix docs drift from Act 1 PRs | README.md: Key Rotation rewrite, secrets, staging, headers, health, roadmap | COVERED |
| Fix docs drift from Act 1 PRs | CONTRIBUTING.md: staging, secrets, deploy pipeline | COVERED |
| Fix docs drift from Act 1 PRs | PRODUCT.md/docs/MVP.md: status headers | COVERED |
| Evolution log for every significant phase | 0021-docs-drift-audit/ directory | MISSING |

No scope creep detected. All changed content traces to the stated task (fixing
documentation drift after Act 1 PRs #54-#57). No code was modified. PRODUCT.md
and docs/MVP.md status headers are minimal and appropriate -- they clarify document
purpose without expanding scope.

The BLOCK finding (evolution log) is procedural -- it does not indicate drift in the
documentation changes themselves, which are well-aligned with the stated task.
