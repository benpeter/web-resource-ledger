# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Failure detail: structured but flat, not binary

**Do not** return only `verified: true/false`. **Do not** return a free-text error
description. Return a structured object with named boolean checks.

Rationale: three distinct user jobs require different failure information (see
section 5 below). A binary boolean forces every consumer to treat "signature
invalid" (possible key rotation issue, operator problem) the same as "artifact
hash mismatch" (data tampered or corrupted, trust is broken). But an
unstructured error string forces consumers to parse natural language. The
middle ground is a small set of named verification steps, each with a pass/fail
status.

Proposed response shape (verified: true case):

```json
{
  "verified": true,
  "capture": {
    "id": "cap_...",
    "url": "https://example.com",
    "createdAt": "...",
    "completedAt": "..."
  },
  "checks": {
    "artifactHashes": "pass",
    "bundleHash": "pass",
    "signature": "pass"
  }
}
```

Proposed response shape (verified: false case):

```json
{
  "verified": false,
  "capture": {
    "id": "cap_...",
    "url": "https://example.com",
    "createdAt": "...",
    "completedAt": "..."
  },
  "checks": {
    "artifactHashes": "fail",
    "bundleHash": "pass",
    "signature": "pass"
  }
}
```

Why `"pass"/"fail"` strings instead of booleans: extensibility. A future state
might need `"skip"` (e.g., if the capture predates a check, or if an artifact
is optional like headers). Booleans can't represent that without breaking the
schema. The enum `pass | fail | skip` is forward-compatible.

Why a `checks` object instead of a `failures` array: recognition over recall.
A consumer looking at the response can see all three checks and their status
at a glance. An empty array means "nothing failed" but doesn't tell you what
was checked. An explicit pass/fail per check is self-documenting.

**Cognitive load justification**: three checks is within the 3-5 item sweet
spot for scannable structured data. Adding more checks later is fine up to
about 7 before the response becomes hard to scan. The current three map
directly to the three verification steps in the issue description:
recompute artifact hashes, recompute bundle hash, verify signature.

### 2. No human-readable trust narrative in the API response

**Do not** include a field like `"summary": "This capture was taken on [date]
and has not been modified since"`. This is tempting but wrong for an API-first
product at MVP stage.

Reasons:

1. **Localization trap**: the moment you include English prose in an API
   response, you implicitly commit to maintaining it. Non-English consumers
   must either display English to their users or parse/ignore it. Neither is
   acceptable.

2. **Liability hazard**: "has not been modified since" is a legal claim the
   system cannot fully substantiate (the server could have been compromised,
   the key could have been stolen). The `checks` object states what was
   verified without making claims about what that verification means.

3. **Redundancy**: the `capture.createdAt` and `capture.completedAt` fields
   already provide the temporal information. The `checks` object provides the
   integrity information. A human-readable summary adds no data -- it just
   re-phrases existing fields.

4. **JTBD mismatch**: developers (the primary consumer) will ignore prose and
   read the structured fields. Legal/compliance teams will want their own
   language, not ours. Third parties sharing verify links will build their own
   trust badges.

**Future path**: if a web-based verification page is built later (mentioned
in kickoff as "gray zone" for MVP), that page can render a human-readable
summary from the structured response. The prose lives in the presentation
layer, not the API. This is a clean progressive disclosure: API returns data,
UI renders narrative.

### 3. Immutable caching is correct and expected -- but only for verified: true

**The mental model**: verification is a mathematical operation on immutable
data. If the artifacts haven't changed (they can't -- R2 content-addressed
storage), and the key hasn't changed, the verification result is deterministic.
Caching a deterministic result is not just acceptable -- it's the expected
behavior for anyone who understands content-addressed storage.

**However**: this only holds for `verified: true`. A `verified: false` response
MUST NOT be cached immutably. Consider: an artifact is corrupted during a
transient storage issue, verification fails, someone shares the URL, the
issue is fixed, but everyone hitting the cached response still sees failure.

Recommendation:
- `verified: true` -> `Cache-Control: public, max-age=31536000, immutable`
  (same as artifacts -- this is consistent and builds a coherent caching model
  across the API)
- `verified: false` -> `Cache-Control: no-store` (same as error responses
  elsewhere in the API -- consistent)
- 404 -> `Cache-Control: no-store` (existing pattern)

**Shared URL behavior**: when someone shares a verify URL and the recipient
gets a cached `true` result, this is fine. The cached response IS the proof.
It's the same bits that would be recomputed. For a `false` result, no-store
ensures the recipient gets a fresh computation.

This caching split also creates a natural trust signal: if the response comes
back instantly (cache hit), it was verified before and the result is
deterministic. If it takes a moment (cache miss, recomputation), it's a fresh
verification. Both are trustworthy, but the instant response actually carries
an implicit "others have verified this too" signal. This is a subtle but real
trust affordance.

### 4. Journey coherence: the retrieval response should link to verify

The current journey is:

```
POST /v1/captures -> 202 {id, statusUrl}
GET .../status -> 200 {captureUrl} (when complete)
GET .../captures/{id} -> 200 {artifacts, wacz}
GET .../verify/{id} -> ??? (new)
```

**The retrieval response should include a `verifyUrl` field.** This is the
natural next step in the trust chain: "I've retrieved the capture, now I want
to confirm it's authentic."

This follows the same pattern already established: the 202 response includes
`statusUrl`, the status response includes `captureUrl`. Each step in the
journey points to the next logical step. Adding `verifyUrl` to the retrieval
response completes the chain.

```json
{
  "id": "cap_...",
  "status": "complete",
  "url": "https://example.com",
  "verifyUrl": "https://wrl.example.com/v1/verify/cap_...",
  "artifacts": { ... },
  "wacz": { ... }
}
```

**Why this matters for the "share with third party" job**: the person who made
the capture shares the retrieval URL (they have the capture ID). The third
party opens it, sees the capture data, and sees `verifyUrl` -- one click to
verify. No need to know the API structure or construct the URL manually. This
is recognition over recall.

**Should the verify response link back to retrieval?** No. The verify
endpoint is public and unauthenticated specifically because it serves a
different trust boundary (kickoff decision: "verify nested under captures
rejected -- auth boundary mixing"). Including a link back to the capture data
from the verify response would be fine in practice (the capture ID is the
access secret and the verifier already has it), but it adds no value: the
verifier either already has the capture data (they came from it) or they
don't need it (they just want the verification result). Keep the verify
response minimal.

### 5. Jobs-to-be-done analysis: three users, one response shape

**Job 1: Developer integration testing**

"When I'm integrating the WRL API, I want to verify that my captured content
is authentic, so I can confirm my integration is working correctly."

- Needs: programmatic true/false, HTTP status code to branch on, structured
  checks for debugging when verification fails
- Does not need: prose, links, detailed artifact data
- Frequency: high during integration, then automated
- The `checks` object serves this job directly

**Job 2: Legal/compliance evidence**

"When I need to present a web capture as evidence, I want a third party to
independently verify its integrity, so I can demonstrate the capture has not
been tampered with."

- Needs: verification result that a non-technical person can present in a
  report, capture metadata (URL, timestamps) for citation, a stable
  shareable URL
- Does not need: technical check details (they'll present the pass/fail
  summary, not the individual hash comparisons)
- Frequency: low per capture, but high stakes
- The `verified: true` + `capture` metadata serves this job. The stable
  immutably-cached URL is the artifact they reference in legal filings.

**Job 3: Debugging/incident response**

"When verification fails unexpectedly, I want to know which specific check
failed, so I can diagnose whether this is a storage corruption, key rotation
issue, or actual tampering."

- Needs: per-check pass/fail breakdown
- Does not need: anything else beyond what jobs 1 and 2 need
- Frequency: rare (should be rare -- if it's common, something is very wrong)
- The `checks` object with individual statuses serves this job

**Key insight**: all three jobs are served by the same response shape. There
is no need for different verbosity levels, query parameters, or response
modes. The flat structure with `verified` + `capture` + `checks` is the
minimal shape that satisfies all three jobs. Adding anything more would serve
none of the jobs better while increasing cognitive load for all consumers.

### 6. What about captures without WACZ bundles?

The system supports captures that complete without WACZ bundles (signing key
absent, WACZ bundling failed). The retrieval response already handles this --
`wacz` is optional.

The verify endpoint MUST return 404 for captures without WACZ data. There is
nothing to verify -- no bundle hash, no signature. Individual artifact hashes
are not signed and were never claimed to be tamper-proof. Returning
`verified: false` would be misleading (it implies the capture was checked and
failed). Returning a special "not verifiable" status adds a concept users must
learn.

404 is the right answer: "there is no verification result for this capture."
This is consistent with the existing pattern where the retrieval endpoint
returns 404 for non-complete captures. The static 404 message should be the
same as the existing one ("Capture not found") to avoid leaking information
about whether the capture exists but lacks WACZ data.

### 7. HTTP status code for verified: false

Return 200, not 4xx. The request succeeded -- the server found the capture,
performed verification, and is returning the result. A `verified: false`
response is a valid, successful answer to the question "is this capture
authentic?" Overloading HTTP status codes with application-level semantics
(4xx for "verification failed") violates the principle that HTTP status codes
describe the HTTP transaction, not the business logic.

This also matters for caching: a 200 with `no-store` is straightforward.
Non-200 status codes interact with CDN and browser caching in complex,
inconsistent ways.

## Proposed Tasks

1. **Add `verifyUrl` to the retrieval response** -- update `handleGetCapture`
   in `src/index.js` and update `openapi.yaml` CaptureRecord schema. Low
   effort, high journey-coherence value.

2. **Define the verification response schema in `openapi.yaml`** -- including
   the `checks` object with `pass | fail | skip` enum, the `capture` summary
   object, and the `verified` boolean. Define the cache-control split
   (immutable for true, no-store for false).

3. **Implement the verify handler** -- route, KV lookup, WACZ retrieval,
   three-step verification (artifact hashes, bundle hash, signature), response
   assembly.

4. **Handle the no-WACZ case** -- return 404 (same static message) when the
   capture exists but has no WACZ data. No special error code or status.

5. **End-to-end tests** -- happy path (all checks pass), tamper detection
   (each of the three checks failing independently), no-WACZ capture returns
   404, rate limiting returns 429 with Retry-After.

## Risks and Concerns

### Risk: key rotation breaks verification of old captures

The verify endpoint must know which public key to use for signature
verification. Currently, the public key is embedded in
`datapackage-digest.json` inside the WACZ bundle, but the code comment says
"Verifiers MUST pin against an operator-published key, not trust the embedded
key blindly." If the verification endpoint uses the current `SIGNING_KEY`
environment variable to derive the public key, key rotation will break
verification of all captures signed with the old key. This is a real problem.

**Recommendation**: for MVP, use the public key embedded in the WACZ bundle's
`datapackage-digest.json` for verification. This is what the WACZ-Auth spec
intends. The backlog already has "[should] Old public key archive endpoint"
and "[should] Key versioning / key ID in signature entries." Those are
post-MVP. For now, the embedded key is the only viable option. Document this
explicitly: the verify endpoint trusts the embedded public key, which means
it proves integrity (data hasn't changed) but not identity (the signer could
be anyone with an Ed25519 key). Identity verification comes with key pinning,
which comes with the key archive endpoint.

### Risk: WACZ download for every verification request

Verification requires reading the WACZ bundle from R2 to extract
`datapackage.json` and `datapackage-digest.json`, then re-hashing the
artifacts. This means every verify request downloads the full WACZ plus all
individual artifacts from R2. For a 6.5 MB WACZ bundle (sueddeutsche.de test
capture), this is non-trivial latency.

**Mitigation**: the immutable caching on `verified: true` responses means each
capture is only verified once at the edge. Subsequent requests hit the cache.
But the first verification of a large capture could be slow. The <300ms
latency target from the Helix Manifesto will be hard to hit on first request
for large captures. Rate limiting at 60 req/min provides some protection.
Consider whether KV could cache the verification result (after the first
computation) as a performance optimization -- but this adds complexity and
may not be needed for MVP.

### Risk: immutable cache on true creates a stale-proof problem

If a capture somehow becomes unverifiable after initially passing (e.g., R2
data corruption after the first successful verification, though this should be
impossible with content-addressed storage), the cached `verified: true` will
persist at edge nodes. This is a feature, not a bug, for content-addressed
immutable data -- but it's worth stating explicitly so the team is aligned on
the assumption that R2 data does not change post-write.

### Concern: rate limiting at 60 req/min is generous for a public endpoint

The verify endpoint is unauthenticated and does real computation (hash
verification, signature verification). 60 req/min per IP is reasonable for
legitimate use but could be abused as a compute amplification vector -- each
request triggers R2 reads and crypto operations. The immutable caching on
`true` responses is the primary mitigation (repeated requests for the same
capture are cheap after the first). But an attacker enumerating many different
capture IDs could cause sustained R2 and compute load. The 404 path (capture
not found) is cheap, but the verification path (capture found, compute hashes)
is not.

No action needed for MVP -- the rate limit plus caching is sufficient. Just
documenting the threat model.

## Additional Agents Needed

None beyond those likely already involved. The planning question was
well-scoped for UX strategy. The security, API design, and implementation
specialists will have their own perspectives on the caching split, response
shape, and key rotation concerns -- my recommendations should be evaluated
against their domain expertise.

One note: if a **legal/compliance specialist** were available, their input
on the "what does `verified: true` actually claim?" question would be
valuable. The distinction between "data integrity verified" and "capture
authenticity proven" has legal implications that a UX strategist can flag
but not resolve. For MVP, the structured `checks` object avoids making claims
the system can't back up -- but this should be revisited before the product
is positioned for legal use cases.
