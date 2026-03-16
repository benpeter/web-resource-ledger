# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### (a) How ToS and content moderation policy should be linked from the verification page

The verification page (`verify-page.js`) has a single user job: **confirm whether a specific capture is authentic**. The current page does this well -- it's focused, scannable, and minimal. Adding ToS and policy links must not disrupt this primary job.

**Recommendation: Footer links -- but make the footer purposeful, not ornamental.**

The current footer reads `Verified by Web Resource Ledger` (line 261). This is the right location for policy links, but the current footer is doing nothing useful -- it's branding without utility. Transform it into a purposeful footer that serves two jobs:

1. **Trust signal** -- who operates this service (the existing branding function)
2. **Policy access** -- where to go if something is wrong with the captured content

The footer should become something like:

```
Web Resource Ledger | Terms of Service | Report Abuse
```

**Why a footer is correct here, not a banner or inline element:**

- The verification page user journey has a clear primary task (verify this capture). ToS and abuse reporting are secondary pathways that serve a different job ("I have a concern about this content"). Per progressive disclosure, secondary pathways should be discoverable but not competing for attention.
- Footer links are the web's strongest convention for legal/policy content. Users who need these links know to look in the footer. Users who don't need them aren't distracted. This is Nielsen's heuristic #4 (consistency and standards) at work -- users have a trained mental model for where legal links live.
- The concern that footer links "may be overlooked" is valid only if the *primary* user of the ToS link is someone browsing the verification page. But it's not -- the primary audience for ToS acceptance is the API consumer (the integrator), not the verification page visitor. The verification page visitor only needs the abuse reporting path, which brings us to...

**The abuse report link deserves slightly more prominence than the ToS link.**

A verification page visitor who encounters problematic captured content has a concrete, urgent job: "I want this content removed." The "Report Abuse" link is their emergency exit (Nielsen heuristic #3: user control and freedom). While it belongs in the footer, it should be styled as a clearly interactive link, not gray-on-gray text. Use the existing `#1a1a1a` body text color for the abuse link -- not the `#6d6d6d` footer color. This creates a subtle but effective visual hierarchy within the footer: branding is quiet, actionable links are visible.

### (b) Abuse reporting mechanism: email vs. structured form/endpoint

**Recommendation: Email address is sufficient for MVP. But the presentation matters enormously.**

The question isn't really email vs. form -- it's about **credibility**. A concerned party who encounters archived content they want removed is assessing whether the operator will actually respond. The mechanism itself matters less than the signals around it.

**What makes an abuse report mechanism credible:**

1. **Named contact, not a black hole.** `abuse@` is a convention that signals institutional process. A generic `contact@` or a personal email feels less like an operated service and more like a side project. Use `abuse@wrl-domain` as the primary contact. This is cheap to set up and follows the convention established by RFC 2142 (which defines `abuse@` as the standard mailbox for reporting abuse).

2. **Response commitment.** State a response time. Even "We aim to respond within 5 business days" is better than silence. The absence of a response commitment is the #1 signal that an abuse mechanism is performative.

3. **Clear scope.** Tell the person what they can expect to happen. "We will review your report and may remove content that violates our content policy" is better than ambiguity. The concerned party's JTBD is: "When I find archived content about me that I want removed, I want to report it to someone who will review it, so I can get it taken down." The mechanism must address all three parts of that statement.

4. **What to include.** Give the reporter guidance on what information to provide: the capture ID or URL, the nature of the concern, and any evidence of ownership or authority. This reduces back-and-forth friction and makes the reporter feel like their complaint will be processed efficiently.

**Why a structured form/endpoint is overkill for MVP:**

- A form endpoint adds engineering surface area (route, input validation, rate limiting, email delivery or queue) for a mechanism that will see near-zero traffic in the single-operator phase. YAGNI applies.
- An email address is simpler to set up, simpler to change, and simpler to operate. It also leaves an audit trail in the operator's inbox without building anything.
- Forms actually reduce credibility for very small services -- they feel like they go into a void. An email address tied to a real domain feels more human.

**If traffic eventually warrants it**, a structured form can be added later. The backlog parking lot already has a pattern for this: "[consider] Structured abuse form -- when abuse email volume exceeds manual processing capacity."

### (c) Should the API 202 response include a ToS link?

**Recommendation: No. Do not add a ToS link to the 202 response.**

**The integrator's job at 202 time is: "I submitted a URL, now I need to poll for the result."** The 202 response body already serves this job well:

```json
{
  "id": "cap_...",
  "statusUrl": "...",
  "note": "Use GET /v1/captures to list and search your captures."
}
```

Adding a ToS link here creates noise. Applying the cognitive load analysis:

- The integrator encounters the 202 response *every time they submit a capture*. A ToS link would be repeated on every single response. After the first time, it becomes invisible noise -- extraneous cognitive load that diminishes the signal of `id` and `statusUrl`.
- The ToS acceptance point belongs *before* the first API call, not during every API call. The integrator should encounter ToS during onboarding (API key issuance) or in the API documentation, not in the response payload.
- The `note` field already serves a "helpful pointer" role. Adding a second pointer dilutes both.

**Where the integrator SHOULD encounter ToS:**

1. **API documentation / README** -- the canonical location. "By using this API, you agree to the Terms of Service at [URL]." This is where integrators read before writing code.
2. **`/.well-known/` endpoint** (optional) -- a `GET /.well-known/tos` endpoint returning a JSON pointer to the ToS URL is low-cost and machine-discoverable. But this is a "consider" item, not a must-have.
3. **Response headers** -- a `Link: <https://wrl.example/tos>; rel="terms-of-service"` header on all responses is the standards-compliant approach (RFC 8288 web linking). It's machine-readable, doesn't pollute response bodies, and is ignorable by integrators who don't care. **This is the recommended approach for API-level ToS reference** if one is needed beyond documentation.

## Proposed Tasks

### Task 1: Add footer links to verification page

**What**: Modify `verify-page.js` to transform the footer from passive branding into a purposeful footer with three elements: "Web Resource Ledger" (branding), "Terms" (link), and "Report Abuse" (link).

**Deliverables**:
- Updated footer HTML in `verify-page.js`
- Updated footer CSS (abuse link uses `#1a1a1a`, ToS link uses existing `#6d6d6d`, pipe separators)
- Both links use `target="_blank"` and `rel="noopener"` since they navigate away from the verification context
- Both links point to static paths that will be served by the Worker (e.g., `/terms` and `/abuse`)

**Dependencies**: Requires Task 2 (the documents must exist at the URLs before the links go live). Can be developed in parallel with a 404 fallback, but should ship together.

### Task 2: Publish ToS and content moderation policy documents

**What**: Create the policy documents and serve them from the Worker at static paths. The documents should be plain HTML pages (consistent with the verification page's approach -- no framework, no build step).

**Deliverables**:
- ToS document at `/terms` -- covers: no illegal use, no circumvention, content retention policy, limitation of liability, operator right to remove content
- Content moderation policy at `/content-policy` (or combined into `/terms` if the content is brief enough) -- covers: what content is acceptable, what will be removed, the abuse reporting process, response timeline
- Abuse reporting instructions at `/abuse` -- covers: how to report (email address), what to include (capture ID/URL, nature of concern, evidence of authority), what to expect (response timeline, possible outcomes)
- Static HTML pages served by the Worker, styled consistently with the verification page

**Dependencies**: None (content task, not code-dependent). Should be reviewed by a legal-minion or the project owner for accuracy.

### Task 3: Wire policy paths into the Worker router

**What**: Add routes for `/terms`, `/content-policy` (if separate), and `/abuse` to the Worker's route table in `index.js`. These serve static HTML pages with appropriate caching headers.

**Deliverables**:
- New route entries in `index.js`
- Handler functions that return static HTML responses
- `Cache-Control: public, max-age=86400` (policies don't change often)
- Same security headers as all other responses (HSTS, X-Content-Type-Options, X-Frame-Options)

**Dependencies**: Task 2 (the HTML content must exist)

### Task 4: Document ToS in API documentation

**What**: Add a ToS reference to the README and/or OpenAPI spec so integrators encounter it during onboarding, not during API calls.

**Deliverables**:
- README section: "Terms of Service" with link to `/terms` and a statement like "By using this API, you agree to the Terms of Service"
- OpenAPI spec `info.termsOfService` field set to the ToS URL (this is a standard OpenAPI field that exists for exactly this purpose)

**Dependencies**: Task 2

## Risks and Concerns

### Risk 1: Policy content quality

The ToS and content moderation policy must be credible but don't need to be lawyer-grade for a single-operator MVP. The risk is either over-engineering (spending days on legal language for a service with no users) or under-engineering (publishing something that provides no actual legal cover). The synthesis should specify a pragmatic middle ground: clear, plain-language policy documents that cover the essential bases without pretending to be corporate legal instruments.

### Risk 2: Abuse page could feel like a dead end

An abuse reporting page that's just "email us at abuse@..." can feel dismissive. The page needs enough structure to feel like a process: what to include, what happens next, how long it takes. Without this, the mechanism fails the credibility test regardless of the email address quality.

### Risk 3: Content Security Policy impact

The verification page currently has a strict CSP: `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self'; connect-src 'self'`. Adding footer links to `/terms` and `/abuse` is fine (navigation is not restricted by CSP). But if the new pages use different CSP settings (e.g., if they load external fonts or images), this creates inconsistency. All static pages should share the same CSP posture.

### Risk 4: Route proliferation without pattern

Adding `/terms`, `/content-policy`, and `/abuse` as individual routes starts to grow the router beyond pure API concerns. This is acceptable for MVP but should be acknowledged as a pattern that won't scale. If more static pages are needed later, a general static-page handler or a subdomain split (docs.wrl-domain) would be appropriate.

### Risk 5: Over-specifying the ToS link in the 202 response body would lock in a coupling

Once a field appears in a JSON API response, removing it is a breaking change. If the ToS link is added to the 202 body now and later proves to be noise (which it will), removing it becomes a versioning problem. Better to never add it. This is an instance of the general principle: API responses should contain the data the consumer needs for their immediate task, nothing else.

## Additional Agents Needed

**legal-minion or equivalent** -- The actual content of the ToS and content moderation policy is outside UX strategy scope. Someone needs to draft the substantive terms (permitted use, content removal criteria, liability limitations, data handling). The UX strategy contribution here is limited to *how* the documents are surfaced, structured, and linked -- not *what* they say. The project owner may draft these themselves given the single-operator context, but the plan should explicitly call out that policy content authorship is a separate task from policy content presentation.

Beyond that, the current team is sufficient. The implementation work (routing, HTML pages, footer modification) is straightforward frontend-minion and software-docs-minion territory.
