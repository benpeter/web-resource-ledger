# UX Strategy Contribution: Static Verification Page

## Summary

The verification page is a trust interface. Its job is not to teach cryptography -- it is to answer one question instantly: "Is this capture real?" Everything on the page must serve that singular goal. The biggest risk is drowning a non-technical user in technical artifacts that undermine rather than build confidence. The second biggest risk is building a page that looks like a developer tool when it needs to feel like a receipt.

---

## Core Analysis

### What Job Is the User Hiring This Page For?

**JTBD**: "When I receive a verification link from someone claiming they captured a web page, I want to confirm the capture is authentic and unaltered, so I can trust the evidence."

Three dimensions:
- **Functional**: See that the capture passed integrity checks
- **Social**: Be able to show someone else ("look, it's verified")
- **Personal**: Feel confident, not confused or suspicious

The user is NOT hiring this page to understand cryptographic verification. They are hiring it to feel certain.

### User Arrival Context

A non-technical person receives this URL in an email, a legal document, a chat message, or a court filing. They click it. They have zero prior context about what "Web Resource Ledger" is, what WACZ means, or what SHA-256 does. They need to understand the result within 3 seconds of page load.

This is a single-visit, single-purpose interaction. There is no onboarding, no learning curve, no repeat usage pattern. The page must be immediately self-evident.

---

## Information Architecture Recommendation

### Two-Layer Progressive Disclosure

**Layer 1: The Verdict (visible on load, above the fold)**

1. **Verified/Unverified badge** -- large, unambiguous, using color and iconography. This is the single most important element. It must be the first thing the eye lands on.
2. **Captured URL** -- what was captured. This is the anchor that connects the verification to the user's context ("yes, this is the page I was told about").
3. **Capture timestamp** -- when it was captured, in human-readable format (not ISO 8601). Use the user's locale formatting via `Intl.DateTimeFormat`. Include relative time ("3 days ago") alongside absolute time.
4. **Screenshot thumbnail** -- visual proof. The user can see what the page looked like. This is the most intuitive evidence for a non-technical person. Worth more than any hash.

**Layer 2: Technical Evidence (collapsed/below the fold, opt-in)**

5. **Three integrity checks** -- but rewritten in human language:
   - "artifactHashes" becomes something like "File integrity" with a pass/fail indicator and a one-sentence explanation: "Every file in the capture matches its recorded fingerprint."
   - "bundleHash" becomes "Bundle integrity": "The capture package has not been modified since creation."
   - "signature" becomes "Server signature": "The capture was signed by the Web Resource Ledger server."
6. **SHA-256 bundle hash** -- displayed as a monospace string with copy-to-clipboard. This is for the person who wants to independently verify.
7. **Signing metadata** -- public key, signature, signedAt timestamp. Pure technical audit trail.

### Why This Layering

Applying Krug's first law: don't make me think. The verdict and screenshot are what 95% of users need. The technical details are what 5% of users (auditors, developers, opposing counsel) want. Showing all of it at equal visual weight means nobody gets what they need efficiently.

The Kano model confirms this:
- **Must-be**: Verified/unverified status, captured URL, timestamp, screenshot. Absence of any of these breaks the experience.
- **Performance**: Human-readable check descriptions, locale-formatted timestamps, copy-to-clipboard for hash.
- **Excitement**: Screenshot rendering inline (not a download link).
- **Indifferent/Reverse for non-technical users**: Raw SHA-256 hash in the primary view, Ed25519 signature bytes, "artifactHashes" as a label.

---

## Critical Data Gap: URL Is Missing from Verify Response

The current `handleVerifyCapture` response deliberately excludes `capture.url` (confirmed by test assertions on lines 85, 297-298 of `verify-integration.test.js`). The `url` field is only available from the retrieval endpoint (`GET /v1/captures/{id}`).

This is a significant problem for the HTML page. The captured URL is the single piece of context that connects the verification to the user's mental model. Without it, the user sees a verified badge but has no anchor for *what* was verified. The page would need to make a second API call to the retrieval endpoint to get the URL, or the verification response needs to include it.

**Recommendation**: Add `url` to the verification JSON response body (under `capture.url`). The URL is not sensitive -- it was a publicly accessible web page at capture time. The retrieval endpoint already exposes it. The verification page cannot function as a trust interface without it.

If there is a security rationale for omitting the URL from the verify response that I am not seeing, the alternative is: the HTML page makes two requests (verify + retrieval). But this adds latency, complexity, and a failure mode.

---

## Noscript Fallback Analysis

The planning question asks: is the `<noscript>` fallback (capture ID + JSON API link) useful to non-technical users?

**No.** A non-technical user with JavaScript disabled will see a capture ID like `cap_ffffffffffffffffffffffffffffffff` and a link to a JSON endpoint. The JSON endpoint returns `application/json`. A non-technical user cannot use this. It is a developer-only fallback.

But that is acceptable for MVP, because:
1. The intersection of "non-technical user" and "JavaScript disabled" is vanishingly small.
2. Making the noscript fallback genuinely useful would require server-side HTML rendering, which contradicts the architecture (single HTML string, client-side fetch).
3. The noscript block serves a legitimate secondary purpose: it makes the page crawlable and gives search engines something meaningful.

**Recommendation**: Keep the noscript fallback but make it slightly more useful by including a plain-English sentence: "This page requires JavaScript to display the verification result. You can access the raw verification data at [link]." Do not pretend the JSON link is a non-technical user experience. Do not over-invest in this path.

---

## Should the Page Explain What "Verification" Means?

**Yes, but minimally.** One sentence. Not a tutorial.

The user's context is: "Someone told me to check this link." They need just enough framing to understand what they are looking at. Something like:

> "This page was captured and cryptographically sealed by Web Resource Ledger on [date]. The verification checks confirm the capture has not been altered since it was created."

This serves three purposes:
1. Tells the user what the product is (a capture/verification service)
2. Explains what "verified" means in plain language (not altered)
3. Anchors the timestamp claim

Do NOT explain how SHA-256 works, what Ed25519 is, or how WACZ bundles are structured. These are implementation details, not user-facing concepts. The three integrity checks (Layer 2) should each have a one-sentence human-readable description, but that description should explain what was checked, not how.

---

## Trust Signals: What Actually Builds Confidence?

For a non-technical user, trust comes from:

1. **Clarity of verdict** -- a big, unambiguous "Verified" or "Not Verified". No hedge words, no technical qualifications. Green or red. This is the single highest-impact design decision.

2. **Visual evidence** -- the screenshot. Humans trust their eyes. A screenshot of the captured page is more convincing than any number of passing checks.

3. **Specificity of metadata** -- "captured on March 14, 2026 at 2:34 PM" is more trustworthy than "captured at 2026-03-14T14:34:22.451Z". Precision formatted for human consumption signals care.

4. **Presence of technical detail (even if not read)** -- paradoxically, showing that technical checks exist (even collapsed) increases trust. The user does not need to understand SHA-256 to feel reassured that the system checked it. The detail should be *available* but not *demanding*.

5. **Clean, professional aesthetic** -- a page that looks thrown together undermines the trustworthiness of the verification result. This does not require a design system, but it requires intentional spacing, typography, and color. (Note: specific visual design decisions are outside my scope -- defer to ux-design-minion.)

For a non-technical user, trust is destroyed by:
- Raw hex strings as primary content
- Technical jargon without explanation ("artifactHashes", "bundleHash", "Ed25519")
- Multiple unfamiliar terms on first view
- Anything that looks like a developer console or API response

---

## Unverified State: Handle the Failure Path

The happy path is simple. The failure path requires more care:

When `verified: false`, the user needs to understand:
1. **What this means** -- "The integrity of this capture could not be confirmed. The captured content may have been altered."
2. **What to do** -- "Contact the person who shared this link." Do not tell the user to re-verify or check the JSON. They cannot.
3. **Which checks failed** -- in Layer 2 only. The non-technical user does not need to see "Ed25519 signature verification failed" in the primary view.

This is critical because a verification failure is a high-stakes moment. The user may be making a legal or business decision based on this result. The page must be clear, not alarming. State facts, not drama.

---

## Error States

Beyond verified/unverified, the page must handle:
- **404 (capture not found)** -- the JS fetch to the verify endpoint returns 404. Show a clear message: "No capture found with this ID. It may have expired or the link may be incorrect."
- **429 (rate limited)** -- "Too many requests. Please try again in a moment."
- **503 (service unavailable)** -- "The verification service is temporarily unavailable. Please try again later."
- **Network failure** -- the fetch itself fails. "Could not connect to the verification service. Check your internet connection and try again."

Each error state should feel like it was designed, not like a crash. No raw status codes. No "undefined" or blank pages.

---

## Specific Recommendations

### 1. Information Hierarchy (Priorities)

| Priority | Element | Rationale |
|----------|---------|-----------|
| P0 | Verified/Unverified badge | The answer to the user's only question |
| P0 | Captured URL | Anchors the verification to context |
| P0 | Screenshot | Visual evidence, most intuitive proof |
| P1 | Capture timestamp (human-readable) | When it happened |
| P1 | One-sentence explanation | What "verified" means |
| P2 | Three integrity checks (human labels) | Technical confidence layer |
| P2 | Copy-to-clipboard bundle hash | For audit trail |
| P3 | Signing metadata (public key, signature) | Developer/auditor use only |

### 2. Label Translation

| API Field | User-Facing Label | One-Line Description |
|-----------|-------------------|---------------------|
| `artifactHashes` | File integrity | Every file in the capture matches its recorded fingerprint |
| `bundleHash` | Bundle integrity | The capture package has not been modified since creation |
| `signature` | Server signature | The capture was signed by the Web Resource Ledger server |
| `checks[].status: 'pass'` | Passed | (with checkmark icon) |
| `checks[].status: 'fail'` | Failed | (with X icon) |
| `checks[].status: 'skip'` | Not checked | (with dash or neutral icon) |

### 3. Timestamp Formatting

Use `Intl.DateTimeFormat` with the user's browser locale. Show both:
- Absolute: "March 14, 2026, 2:34 PM"
- Relative: "(3 days ago)"

Fall back to ISO 8601 only if Intl is unavailable (extremely unlikely in any browser that runs JS).

### 4. Screenshot Rendering

Display inline as an `<img>` tag, not as a download link. The screenshot URL is available from the retrieval endpoint at `/v1/captures/{id}/artifacts/screenshot`. This is the single most powerful trust signal for non-technical users.

Note: This means the page needs both the verify endpoint (for checks) AND either the retrieval endpoint or the screenshot artifact URL. The verify response currently does not include artifact URLs. Either:
- (a) Add a `screenshotUrl` field to the verify response, or
- (b) The page constructs the screenshot URL from the capture ID pattern: `/v1/captures/{id}/artifacts/screenshot`
- (c) The page makes a second request to the retrieval endpoint

Option (b) is simplest and avoids API changes. The URL pattern is stable and defined by the router regex.

### 5. Hash Display

Bundle hash should be displayed in a monospace font, truncated with ellipsis in the primary view (first 16 + last 8 characters), expandable to full value. Include a copy button. The full `sha256:` prefix is meaningful to technical users and should be preserved.

---

## Risks and Dependencies

### Risk: Verify response lacks URL and artifact links
**Severity**: High. The page cannot function as described without the captured URL and a path to the screenshot.
**Mitigation**: Either extend the verify API response, or have the page derive URLs from the capture ID (preferred for MVP -- no API change needed).

### Risk: Screenshot load failure
**Severity**: Medium. The screenshot is fetched separately from the verification data. If R2 is unreachable or the artifact is missing, the page must degrade gracefully.
**Mitigation**: Show a placeholder with "Screenshot unavailable" text. Do not show a broken image icon.

### Risk: Page serves as XSS vector
**Severity**: High. The HTML page will display user-originated data (the captured URL). All dynamic content must be text-node injected, never `innerHTML`.
**Mitigation**: Security minion should review all DOM insertion patterns. Use `textContent` or `createTextNode` exclusively for any data from the API response.

### Risk: Content negotiation breaks API consumers
**Severity**: Low-medium. If content negotiation is not implemented carefully, API consumers sending `Accept: */*` or `Accept: text/html, application/json` might get HTML instead of JSON.
**Mitigation**: Only serve HTML when `Accept` header explicitly includes `text/html` AND the request does not include `Accept: application/json` with higher quality. Default to JSON when ambiguous. This is important to get right.

### Dependency: Captured URL availability
The page needs the captured URL. Two paths forward:
1. Add `url` to verify JSON response (clean but requires API change)
2. Page fetches retrieval endpoint in parallel (works but adds latency and complexity)
3. Page constructs retrieval URL from capture ID and fetches only the URL field (works, minimal)

Recommend option 1 (add URL to verify response) as the cleanest solution. The URL is not sensitive data.

---

## Specialist Recommendations

The planning team should consider involving:

- **Security minion**: Must review the HTML page for XSS vectors. The page renders user-originated URLs and API responses into the DOM. Content Security Policy headers should be set. The content negotiation logic needs security review to prevent response confusion attacks.

- **ux-design-minion** (if available): The visual design of the verified/unverified badge, the page layout, the color choices, and the typography all directly affect trust perception. I have provided the information architecture; the visual execution matters greatly for a trust interface.

---

## Summary of Actionable Outputs

1. **Two-layer progressive disclosure**: Verdict + screenshot above the fold; technical checks below or collapsed.
2. **Add captured URL to verify response** (or derive it from the capture ID pattern).
3. **Human-readable labels** for the three checks -- never expose API field names to users.
4. **Inline screenshot** as primary visual evidence -- construct URL from capture ID.
5. **Locale-formatted timestamps** with relative time.
6. **Noscript fallback** is developer-only -- keep it minimal, add one sentence of context.
7. **One-sentence framing** of what verification means -- not a tutorial.
8. **Unverified state** requires careful copy: factual, not alarming, with a clear next action.
9. **Error states** must feel designed, not crashed.
10. **Security review required** for all DOM insertion of API data, content negotiation logic, and CSP headers.
