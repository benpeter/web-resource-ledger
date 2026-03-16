# Margo Complexity Review — docs-drift-audit

## Scope

Documentation-only audit: `openapi.yaml`, `README.md`, `CONTRIBUTING.md`,
`PRODUCT.md`, `docs/MVP.md`. No code changes. Complexity assessment
focused on the documentation and spec artefacts themselves.

---

VERDICT: ADVISE

FINDINGS:

- [ADVISE] openapi.yaml:869-1060 -- POST /v1/captures inlines full security and
  CORS headers on every error response (400, 401, 415, 429, 503) rather than
  reusing the shared `components/responses/Problem*` refs. The shared refs
  already exist (used correctly by GET /v1/captures at lines 772-799 and by all
  other endpoints). The POST error responses duplicate 8-10 header $ref lines
  each, across 5 status codes, plus inline the CORS headers (Access-Control-
  Allow-Origin, Vary) on every one. This is ~120 lines of repeated content with
  no delta from the shared responses. The CORS headers are also not part of the
  shared Problem refs, which is the only legitimate reason for the inline
  approach -- but the CORS header inline is itself questionable (error responses
  from an endpoint with CORS enabled do need CORS headers, so this is not
  wrong, just unextracted). The duplication is accidental complexity: it makes
  future header changes require edits in 5+ places instead of one.

  FIX: The shared `components/responses/Problem400`, `Problem401`, `Problem429`,
  `Problem503` already carry the standard security headers. Add
  `Access-Control-Allow-Origin` and `Vary: Origin` as reusable header refs in
  `components/headers` (e.g., `CorsAllowOrigin`, `CorsVary`). Then either: (a)
  add them to the shared Problem response definitions once, or (b) define a
  `Problem400Cors` variant. Either approach collapses the 5-response inline
  header block back to $refs. This is a spec-file-only change with no runtime
  impact.

- [NIT] openapi.yaml:615-656 -- OPTIONS /v1/captures preflight is documented as
  a standalone path operation. This is technically correct OpenAPI 3.1, but it
  is also 42 lines to document a response that Cloudflare Workers handles
  identically for all CORS-enabled paths. If a second CORS endpoint is added
  later, this pattern requires a new OPTIONS block. Not blocking since there is
  currently only one CORS endpoint, but watch for copy-paste expansion.

  FIX: No action required now. If a second CORS endpoint appears, extract a
  shared CORS preflight response component rather than duplicating the block.

- [NIT] README.md:237-241 -- Setup step 9 ("Deploy") is a single `wrangler
  deploy` command with no surrounding context. The preceding steps (1-8) all
  have explanatory prose. Step 9 has none. Minor inconsistency in the setup
  narrative but non-blocking.

  FIX: Add one sentence: "This deploys to your production environment. For
  staging, see the Staging section below." The Staging section already exists
  at line 247.

---

## Summary

The changed documentation is proportional and accurate. No YAGNI violations: all
documented features (staging, key rotation, key archive, CORS, hashed IP
logging, health endpoint, response headers) correspond to code shipped in
PRs #54-#57. No new dependencies, abstractions, or speculative features were
introduced. The README and CONTRIBUTING additions are correctly scoped to what
exists.

The one substantive finding (ADVISE, not BLOCK) is a spec duplication pattern
in openapi.yaml: POST /v1/captures error responses inline headers that could
be $refs to shared components. This is real accidental complexity -- it will
cause maintenance drift the first time a response header changes -- but it does
not affect runtime behavior and does not block the PR.
