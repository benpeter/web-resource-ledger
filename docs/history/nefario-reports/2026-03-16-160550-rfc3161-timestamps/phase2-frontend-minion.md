# Frontend Minion: Verification Page Timestamp Display

## Analysis of Existing Patterns

The verification page (`src/verify-page.js`) is a self-contained, server-rendered
HTML shell with inlined CSS and vanilla JS. Key architectural facts:

- **No framework, no build step.** All HTML, CSS, and JS live in a single
  template string returned by `htmlVerifyResponse()`. Changes must remain
  within this inline pattern.
- **Client-side fetch.** The page fetches two JSON endpoints (`/v1/verify/{id}`
  and `/v1/captures/{id}`) and renders the result into `#result` via DOM
  manipulation. The server never renders verification data into the HTML.
- **Check rendering system.** `renderChecks(checks)` iterates an array of
  `{ name, status, detail }` objects. Each check gets an SVG icon
  (`pass`/`fail`/`skip`), a label from `CHECK_LABELS`, and a description
  from `CHECK_DESCS`. The system is extensible by design -- adding a 4th
  entry to `CHECK_LABELS` and `CHECK_DESCS` is the natural extension point.
- **Crypto details.** A `<details>` collapsible section shows bundle hash,
  signed-at, and public key. These are populated via `getElementById` +
  `textContent` (safe against XSS).
- **Security model.** User-controlled data is never interpolated into HTML.
  All dynamic values are set via `textContent` or safe DOM APIs. This must
  be preserved for any new fields.

## Recommendations

### Q1: Visual Treatment of the Timestamp Check

**Recommendation: Same visual treatment, different semantic grouping.**

Add the timestamp as a 4th check row using the existing `renderChecks()` system
with the same SVG icons (pass/fail/skip). Do not create a separate visual
section or card for the timestamp check. Reasons:

1. **Consistency.** Users scanning the page expect a uniform list of checks.
   A visually distinct treatment for one check creates a "why is this different?"
   question that adds cognitive load without information value.
2. **Extensibility.** If WRL ever adds additional third-party checks (e.g.,
   a second TSA, blockchain anchoring), each getting its own visual treatment
   becomes unmaintainable. A uniform list scales.
3. **The check system already handles the distinction.** The label and
   description carry the semantic difference. "Digital signature" already
   communicates "operator-asserted." Adding "Independent timestamp" with a
   description like "Confirms capture time was certified by a third-party
   authority" communicates the independence without visual gymnastics.

Concrete additions to the existing maps:

```javascript
var CHECK_LABELS = {
  artifactHashes: 'File integrity',
  bundleHash:     'Bundle integrity',
  signature:      'Digital signature',
  timestamp:      'Independent timestamp',   // <-- new
};

var CHECK_DESCS = {
  artifactHashes: 'Confirms individual captured files have not been modified.',
  bundleHash:     'Confirms the overall archive bundle has not been altered.',
  signature:      'Confirms the bundle was signed by the capture service.',
  timestamp:      'Confirms capture time was certified by an independent authority.',  // <-- new
};
```

The word "independent" in the label is the key differentiator. It signals
"not us" without needing a separate visual language.

**Order matters.** The 4th check should appear last in the list. The existing
order follows a logical chain (files -> bundle -> signature). Timestamp is
a corroboration of the signature, so it belongs after it.

### Q2: Cryptographic Details Extension

**Recommendation: Extend the crypto details section with TSA-specific fields,
conditionally rendered.**

The existing `<details>` section should gain new rows when timestamp data is
present. The fields to add:

1. **TSA name** (e.g., "DigiCert Timestamp Responder") -- this is the
   human-readable identity of the third party. Essential for the evidence
   claim: "who certified this?"
2. **Timestamp value** -- the RFC 3161 genTime, formatted the same way as
   the existing "Signed at" field (using the existing `fmtDate()` helper).
   This is the independently attested time.

Fields to NOT add:

- **TSA certificate details** (issuer, serial, validity). These are deep
  crypto internals that serve no purpose for the target audience (journalists,
  researchers, legal professionals). If someone wants this, they can inspect
  the raw JSON API response. YAGNI applies.
- **Timestamp token (raw DER/base64)**. Same reasoning -- too technical,
  available via JSON API.

Implementation pattern -- follow the existing conditional rendering:

```javascript
// In buildResult(), after the existing crypto-grid rows:
if (signing && signing.timestamp) {
  // Add TSA name row
  // Add timestamp time row
}
```

Each new row uses the existing `.crypto-row`, `.crypto-label`, `.crypto-value`
CSS classes. No new CSS needed.

Population follows the same `getElementById` + `textContent` pattern used
for bundle hash, signed-at, and public key.

### Q3: Absent Timestamp Communication

**Recommendation: Use "skip" status with a neutral, informative detail message.**

When the timestamp is absent (TSA was unreachable, or this is a legacy capture
from before RFC 3161 integration), the check should appear with `status: 'skip'`.

The existing `SVG_DASH` icon (gray dash) and `.check-icon.skip` style already
handle this state visually. The `renderChecks()` function already maps
`status !== 'pass' && status !== 'fail'` to `SVG_DASH`.

The `detail` field should explain WHY it was skipped. Two cases:

1. **TSA unreachable during capture**: `detail: 'Timestamp service was
   unavailable during capture'`
2. **Legacy capture (no timestamp in WACZ)**: `detail: 'This capture predates
   independent timestamping'`

Both cases result in the same visual: gray dash, "Independent timestamp"
label, italic detail text below.

**The overall `verified` status is the critical question here, and it's NOT
a frontend decision** -- it depends on whether `verifyWacz()` treats a skipped
timestamp as a verification failure. But the frontend must handle both:

- `verified: true` with `timestamp: skip` -- banner says "Verified" (green).
  The skip is informational.
- `verified: false` with `timestamp: fail` -- banner says "Verification
  Failed" (red). The fail is a real failure.

No special UI treatment is needed beyond what the existing check system
provides. The skip/fail distinction is already visually clear (gray dash
vs. red X).

**Do NOT hide the timestamp check when absent.** Hiding it creates a
confusing inconsistency -- "sometimes there are 3 checks, sometimes 4."
Always show 4 checks. A skip is an honest disclosure.

### Q4: Status Banner Differentiation

**Recommendation: Do NOT differentiate the banner. Keep it binary.**

The status banner should remain "Verified" (green) or "Verification Failed"
(red). Do not add sub-states like "Verified with independent timestamp" or
"Verified (operator signature only)."

Reasons:

1. **The banner is a trust signal, not a detail summary.** Its job is to
   answer one question: "Can I trust this capture?" Adding qualifiers dilutes
   the signal. The checks section below the banner provides the nuance.
2. **Avoiding a "yellow" middle state.** If "verified without timestamp" gets
   a different banner (e.g., amber, or a qualified label), it implies the
   capture is less trustworthy. But a capture with 3/3 checks passing IS
   verified -- the operator signed it. The timestamp adds independent
   corroboration, but its absence doesn't invalidate the signature. Creating
   a visual hierarchy of trust levels adds complexity the target audience
   doesn't need.
3. **Future-proofing.** If WRL adds more optional checks (e.g., blockchain
   anchoring, multi-TSA redundancy), each gets its own banner sub-state?
   That path leads to a confusing matrix of trust levels. Keep the banner
   binary, let the checks list show the detail.

**Exception:** If the product decision is that timestamp absence makes the
capture NOT verified (i.e., `verifyWacz()` returns `verified: false` when
timestamp fails), then the banner naturally shows "Verification Failed" and
the failed timestamp check explains why. No special banner logic needed.

## Proposed Tasks

### Task 1: Extend CHECK_LABELS and CHECK_DESCS (trivial)

Add `timestamp` entries to both maps. 2 lines of code.

**Dependency**: Requires api-design-minion to confirm the check name is
`timestamp` (not `rfc3161` or `tsaTimestamp` or something else).

### Task 2: Extend Cryptographic Details Section

Add conditional TSA rows (TSA name, timestamp time) to the `buildResult()`
function. Add corresponding `getElementById` + `textContent` population in
`populate()`.

**Dependency**: Requires api-design-minion to define the response shape.
Specifically: where in the verify JSON response do `tsaName` and `timestampTime`
live? Options:
- In the `signing` object (alongside existing `bundleHash`, `signedAt`, etc.)
- In a new top-level `timestamp` object
- In a `signing.signatures[]` array entry with `type: "rfc3161"`

The frontend doesn't care which -- it just needs to know the path to read.

### Task 3: Handle Absent Timestamp Gracefully

Ensure the `renderChecks()` and `populate()` functions handle a 4th check
with `status: 'skip'` correctly. This should work with zero code changes
to `renderChecks()` because it already handles unknown check names (falls
back to `c.name` for label) and all three statuses.

The main work is ensuring `buildResult()` conditionally renders the TSA
crypto rows only when timestamp data is present.

### Task 4: Update Tests

Add test cases to `test/verify-page.test.js`:
- Verify the HTML template contains the `timestamp` key in CHECK_LABELS
  (or whatever the check name is)
- Verify the check description text for the timestamp check
- No need to test the full rendering pipeline (that's a DOM test, and the
  existing tests only verify the HTML template content)

## Risks and Concerns

### Risk 1: Response Shape Dependency

The frontend changes are entirely downstream of the API response shape
decision. If the api-design-minion designs the response one way and the
verify.js implementation produces a different shape, the frontend silently
fails (missing data, not errors). The response shape must be agreed before
frontend implementation begins.

**Mitigation**: Frontend task should start from a concrete JSON fixture
(a sample verify response with timestamp data), not from the schema alone.

### Risk 2: Template String Size

`verify-page.js` is already 550 lines. Adding more HTML template code
(conditional TSA rows, additional CSS) increases the template string size.
The entire page is inlined in a single Worker response. This is not a
blocking concern at current scale, but worth monitoring.

**Mitigation**: The additions are small -- approximately 20-30 lines of HTML
template and 0 lines of new CSS (existing classes cover the new rows).

### Risk 3: Backward Compatibility with Existing Captures

Existing captures have no timestamp check in their verify response. The
frontend must handle a `checks` array with only 3 entries (no `timestamp`
entry at all) without breaking.

This is already handled by the current `renderChecks()` implementation --
it iterates whatever array it receives. If there's no `timestamp` entry,
no timestamp row is rendered. But this means old captures show 3 checks
and new captures show 4. This is the "sometimes 3, sometimes 4" inconsistency
mentioned above.

**Options**:
1. **Accept the inconsistency.** Old captures show 3 checks, new ones show
   4. Simple, honest.
2. **Backend adds a `timestamp: skip` entry for old captures.** The verify
   endpoint detects the absence of RFC 3161 data and appends a skip check.
   Frontend always shows 4 checks. Cleaner UX but requires backend change.

**Recommendation**: Option 2 is better UX. The backend should always return
4 checks, with `{ name: 'timestamp', status: 'skip', detail: 'This capture
predates independent timestamping' }` for old captures. This is a
backend/API concern, but the frontend plan should flag it.

### Risk 4: Accessibility of New Content

The timestamp check row inherits the same accessibility pattern as the
existing 3 checks: `aria-hidden="true"` on the SVG icon, a `<span class="sr-only">`
announcing the status, and semantic text content for the label and description.
No new accessibility work is needed as long as the existing `renderChecks()`
function is used without modification.

The new crypto details rows also inherit the existing pattern (`crypto-label`
+ `crypto-value` with `aria-labelledby`). No issues here.

## Additional Agents Needed

### ux-strategy-minion (already planned)

The meta-plan already includes ux-strategy-minion for the "how to communicate
the distinction to non-technical users" question. This is the right agent for
it. My recommendations above (same visual treatment, binary banner) are
implementation-level opinions. The product-level question -- "does the target
audience care about the operator/independent distinction, and how much?" --
is a UX strategy question.

### api-design-minion (already planned, critical dependency)

The frontend is entirely downstream of the API response shape. The
api-design-minion consultation must resolve:
1. The check name for timestamp (`timestamp` vs. alternatives)
2. Where TSA metadata lives in the response (in `signing` object, in a new
   object, or in a signatures array)
3. Whether old captures get a synthetic `timestamp: skip` check in the response

### No additional agents needed beyond what the meta-plan already includes.

The frontend changes are incremental. The existing pattern (vanilla JS, inline
HTML template, check rendering system) absorbs the new check naturally. The
complexity is in the backend (ASN.1, TSA integration, format migration), not
in the presentation layer.
