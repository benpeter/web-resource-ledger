# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### Question 1: Is response body wording sufficient, or do we need additional signals?

The response body wording is necessary but not sufficient on its own. Here is
the reasoning, grounded in the actual user journey:

**The audience is developers consuming a JSON API via curl or code.** They are
not reading the 202 response body like a paragraph -- they are parsing JSON,
extracting the capture ID, and feeding it into their next API call. The "you
are responsible for preserving the capture ID" message is a textual aside in a
machine-readable response. It will be read once (maybe), then ignored by every
script that integrates with this API.

That said, this is MVP and the user base is exactly one person (the operator).
The wording is a reasonable low-cost signal. But it should be accompanied by
two additional measures:

1. **`Retry-After` header on the 202 response.** This serves double duty: it
   is the standard HTTP mechanism for telling clients when to poll (RFC 7231
   section 6.3.3 says 202 responses "ought to" indicate when the work will be
   complete), and it reduces cognitive load by answering the question "how
   often should I poll?" before it needs to be asked. Recommend a value of 5
   (seconds). This is a must-do -- it is a standard HTTP convention that
   developers expect, and its absence will force callers to guess poll
   intervals (violates Nielsen's "match the real world" heuristic).

2. **A `note` field in the 202 body, not a `warning` field.** The acceptance
   criteria say the body must state that the caller is responsible for
   preserving the ID. Put this in a `note` string field. Do not use a field
   name like `warning` -- that implies something is wrong. The note is
   informational, not alarming. Suggested wording:

   ```json
   {
     "id": "cap_abc123...",
     "statusUrl": "/v1/captures/cap_abc123.../status",
     "note": "No list endpoint is available. Store the capture ID -- it is the only way to access this capture."
   }
   ```

   The `note` field satisfies the acceptance criteria, is self-describing, and
   is easy to log or display in integrations. It does not need to be parsed
   programmatically -- it is for the human who first reads the response.

**What NOT to do:** Do not add a separate warning header (RFC 7234 Warning is
deprecated in HTTP/2+), and do not add multiple fields to convey the same
message. One `note` field plus `Retry-After` header is the right weight.

### Question 2: Should failed captures include actionable error messages?

**Yes, unequivocally.** A bare `"status": "failed"` violates three Nielsen
heuristics simultaneously:

- **Help users recognize, diagnose, and recover from errors.** A status of
  "failed" with no further information tells the user nothing about whether
  the failure was their fault (bad URL), the target's fault (site returned
  5xx), or WRL's fault (browser crashed). Without this, the user cannot decide
  whether to retry, fix their input, or report a bug.

- **Visibility of system status.** The user has been polling for completion.
  When the result is "failed," the system has the duty to explain what
  happened. The transition from "pending" to "failed" is a significant state
  change that demands explanation.

- **Error prevention (downstream).** If the user retries the same bad URL
  because the error message does not tell them what went wrong, they waste
  their own time and WRL's browser rendering resources.

Recommended status response shape for failed captures:

```json
{
  "status": "failed",
  "error": "Target returned HTTP 403 Forbidden",
  "retryable": false
}
```

The `error` field should be a human-readable string categorized by failure
mode:

| Failure mode                | Example `error` value                                | `retryable` |
|-----------------------------|------------------------------------------------------|-------------|
| URL validation failed       | "URL scheme 'ftp' is not allowed; use http or https" | `false`     |
| DNS resolution failed       | "Could not resolve hostname"                         | `false`     |
| Target returned error       | "Target returned HTTP 403 Forbidden"                 | depends     |
| Browser timeout             | "Page did not finish loading within 30 seconds"      | `true`      |
| Browser crash / render fail | "Capture could not be completed"                     | `true`      |
| Size limit exceeded         | "Page exceeded 50MB size limit"                      | `false`     |

Key constraints on the `error` field:

- **Never expose internal details** (stack traces, KV keys, IP addresses).
  Apply the same CWE-209 discipline as `problemResponse()`.
- **Describe the symptom from the caller's perspective**, not the internal
  cause.
- **The `retryable` boolean** answers the most important question: "should I
  try again?" This is a concrete decision-support signal that reduces
  cognitive load. It also prevents unnecessary retry storms against URLs that
  will never succeed.

For successful captures, the status response should also grow slightly to
provide forward navigation:

```json
{
  "status": "complete",
  "captureUrl": "/v1/captures/cap_abc123..."
}
```

This `captureUrl` is the "what do I do next?" signal. Without it, the caller
knows the capture is complete but has to construct the URL themselves from the
ID. That is unnecessary cognitive load. The 202 response gave them
`statusUrl`; the status-complete response should give them `captureUrl`. This
creates a self-navigating chain: POST -> statusUrl -> captureUrl.

### Question 3: Should the 202 design actively mitigate the lost-ID problem?

**Not beyond the `note` field. Here is why:**

The backlog item says "Capture ID recovery -- no list endpoint means lost
ID = lost capture" with a tier of [consider]. The ux-strategy-minion flagged
this during kickoff precisely because it is a real risk for any multi-user or
automated deployment. But the MVP context changes the calculus:

1. **The user is a single operator.** There is one person, one API key, one
   deployment. The lost-ID problem is a personal bookkeeping problem, not a
   systemic access control failure.

2. **The capture ID doubles as an access secret.** Any recovery mechanism
   (list endpoint, search by URL, webhook callbacks) creates a new surface
   for ID enumeration. The security-minion has already flagged "status oracle
   attacks" as a concern. Adding recovery mechanisms to mitigate lost IDs
   introduces exactly the attack surface the capture-ID-as-secret design was
   meant to avoid.

3. **The right fix is the list endpoint**, which is already backlogged as
   [must] and labeled "first addition post-MVP." Building a partial mitigation
   now (e.g., a recovery endpoint, email notification, webhook callback) adds
   scope that will be superseded by the list endpoint.

4. **The `note` field is the YAGNI-compliant mitigation.** It tells the
   caller to store the ID. For the single-operator MVP, this is sufficient.

However, one small addition is worth considering that stays within MVP scope:

**Include the capture ID in the `Retry-After` loop.** When the status endpoint
returns `pending`, include the capture ID in the response body:

```json
{
  "id": "cap_abc123...",
  "status": "pending"
}
```

This is not a recovery mechanism -- it is basic response hygiene. If a caller
is polling `/v1/captures/{id}/status`, the response should confirm which
capture it is reporting on. This prevents confusion when a client is managing
multiple concurrent captures, and it means every response in the chain
contains the capture ID, making it harder (not impossible) to lose through
log inspection.

**What the journey looks like end to end:**

```
POST /v1/captures
  -> 202: { id, statusUrl, note }        [Retry-After: 5]

GET /v1/captures/{id}/status
  -> 200: { id, status: "pending" }      [Retry-After: 5]

GET /v1/captures/{id}/status
  -> 200: { id, status: "complete", captureUrl }

GET /v1/captures/{id}                    (Step 5, out of scope here)
  -> 200: { ... capture metadata ... }
```

Each response answers: "what is the state?" and "what do I do next?" The
caller never has to construct a URL or remember a convention. The chain is
self-navigating.

## Proposed Tasks

### Task 1: Define 202 Accepted response body shape

- **What**: Finalize the JSON body for `POST /v1/captures` 202 response.
  Must include `id`, `statusUrl`, and `note` fields. Must include
  `Retry-After` header.
- **Deliverable**: Response shape documented in the execution plan or
  inline as a code comment, ready for api-design-minion and implementation.
- **Dependencies**: None. This is a planning artifact.
- **Acceptance**: Body matches the shape described above. `Retry-After`
  header is present with a value of 5.

### Task 2: Define status endpoint response shapes for all states

- **What**: Finalize JSON shapes for `pending`, `complete`, and `failed`
  states. Every state includes the capture `id`. `failed` includes `error`
  string and `retryable` boolean. `complete` includes `captureUrl`.
  `pending` includes `Retry-After` header.
- **Deliverable**: Response shapes for all three states, ready for
  implementation and OpenAPI spec.
- **Dependencies**: None. This is a planning artifact.
- **Acceptance**: All three shapes defined. Error categories documented
  with example messages.

### Task 3: Define error message categories for failed captures

- **What**: Enumerate the failure modes that can occur during the capture
  pipeline (URL validation, DNS, HTTP errors, browser timeout, size limit,
  render failure) and define the user-facing `error` string for each. Apply
  CWE-209 discipline -- no internal details leaked.
- **Deliverable**: Error category table (failure mode -> error message ->
  retryable flag), ready for implementation.
- **Dependencies**: Security-minion and edge-minion inputs on what failure
  modes exist in the capture pipeline.
- **Acceptance**: Every known failure mode has a defined, user-facing error
  message. No message leaks internal state.

### Task 4: Implement Retry-After header on 202 and pending status responses

- **What**: Add `Retry-After: 5` header to the 202 response and to status
  responses that return `pending`. Remove the header from `complete` and
  `failed` responses (polling is no longer needed).
- **Deliverable**: Header present in response construction code.
- **Dependencies**: Task 1 (response shape finalized).
- **Acceptance**: `curl -I` on POST shows `Retry-After: 5`. Status
  endpoint for pending captures shows `Retry-After: 5`. Complete/failed
  responses do not include it.

## Risks and Concerns

### Risk 1: `note` field ignored by automated integrations

The `note` field is designed for the human who first reads the API response.
Automated scripts will ignore it. For the single-operator MVP, this is
acceptable -- the operator will read it during initial integration. Post-MVP,
the list endpoint eliminates the underlying problem. **Severity: low for
MVP.** The `note` field is the right weight of mitigation for this phase.

### Risk 2: Error messages reveal too much or too little

Too-verbose error messages (e.g., "Puppeteer crashed with exit code 137 on
worker colo SJC") leak infrastructure details. Too-terse messages (e.g.,
"Capture failed") are useless for diagnosis. The error category table (Task 3)
must be reviewed by security-minion before implementation to ensure the right
balance. **Mitigation: security-minion reviews error message table before
implementation.**

### Risk 3: Polling UX without Retry-After is a guessing game

If `Retry-After` is omitted, every caller must invent their own poll interval.
Some will poll too aggressively (wasting resources, hitting rate limits), some
too slowly (bad experience). This is a friction point that is trivially
avoidable. **Mitigation: Retry-After header is a must-do, not a nice-to-have.**

### Risk 4: Status endpoint does not include forward navigation

If the `complete` status response does not include `captureUrl`, the caller
must mentally reconstruct the URL from the capture ID and their knowledge of
the API structure. This violates "recognition over recall" (Nielsen heuristic
6). For the single-operator MVP it is minor, but for future integrations it
becomes a real friction point. **Mitigation: include `captureUrl` in complete
responses from day one. Cost is one additional field.**

### Risk 5: `retryable` flag is ambiguous for HTTP errors

Some HTTP errors from the target site are retryable (503 Service Unavailable)
and some are not (404 Not Found, 403 Forbidden). The error category table must
define which target HTTP status codes are retryable. The simplest heuristic:
target 5xx is `retryable: true`, target 4xx is `retryable: false`. Document
this in the error table. **Mitigation: Task 3 explicitly addresses this.**

## Additional Agents Needed

None. The current team covers all relevant domains:

- **api-design-minion** will finalize response shapes (this contribution
  provides UX requirements as input).
- **security-minion** will review error messages for information leakage.
- **edge-minion** will identify all failure modes in the capture pipeline
  (input to Task 3).
- **software-docs-minion** will ensure the OpenAPI spec reflects the final
  response shapes.
