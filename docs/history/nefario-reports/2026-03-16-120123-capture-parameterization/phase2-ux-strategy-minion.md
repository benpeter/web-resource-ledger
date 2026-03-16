## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. The core tension is a false dichotomy -- resolve it with transparency, not restriction

The framing of "clean slate = reproducible evidence" versus "parameterized = higher fidelity but caller-influenced" presents a false choice. A screenshot dominated by a cookie consent modal is not higher-integrity evidence of a page's content -- it is evidence of a cookie banner. The current "clean slate" does not produce a neutral view; it produces a systematically biased view (first-visit, no-consent, banner-occluded). Parameterization, when recorded transparently, produces *more honest* evidence because it declares its conditions rather than pretending conditions don't exist.

The design principle: **evidence integrity comes from declaring what you did, not from restricting what you can do.** A photograph is evidence whether taken with a wide-angle or telephoto lens -- what makes it admissible is that the lens choice is documented. WRL should adopt the same philosophy: any parameter the caller provides must be recorded immutably alongside the capture artifacts.

#### 2. Jobs-to-be-Done analysis reveals three distinct user jobs

**Job A: "Capture what this page looks like to the public"** (current primary job)
- JTBD: "When I need to preserve evidence of what a web page shows, I want to capture a faithful rendering, so I can prove the page's content at a point in time."
- This job is *broken* by cookie consent banners. The user doesn't want evidence of the banner -- they want evidence of the content behind it. A cookie banner is interference, not signal.
- This is a must-be feature gap (Kano): users expect the screenshot to show the page, not an overlay. Its absence actively degrades the core value proposition.

**Job B: "Capture what this page looks like in a specific context"** (emerging job)
- JTBD: "When I need to document how a page appears on mobile / in a specific region / to a logged-in user, I want to control the capture conditions, so I can prove what a specific audience sees."
- This is a performance feature (Kano): more control yields proportionally more satisfaction.
- This job is secondary to Job A and should be deferred until Job A is solidly served.

**Job C: "Capture this page without thinking about browser details"** (implicit job for all users)
- JTBD: "When I submit a URL, I want sensible defaults, so I don't have to configure anything to get a useful result."
- This is a must-be: the zero-parameter capture must remain the primary path and produce good results. Parameterization must not become mandatory complexity.

#### 3. Parameter categories ranked by impact on the evidence use case

I rank parameter categories by how much they affect the core evidence job (Job A), using a Kano-informed lens:

**Tier 1: Must-fix (addresses a broken must-be)**

1. **Cookie consent handling** -- The single highest-impact intervention. Cookie banners degrade every capture on EU-targeted sites (which is most of the web). This isn't a nice-to-have; it's the difference between "evidence of a page" and "evidence of a cookie banner." However, *how* WRL handles this matters enormously -- see the neutrality framework below.

**Tier 2: Performance features (proportional satisfaction gain)**

2. **Wait conditions** -- "Wait for network idle" is already implemented, but some pages need "wait for selector" or a brief delay after load. Incomplete renders undermine evidence. The backlog already flags this ("Screenshot timing / wait-for-load" in parking lot). Low API complexity (one field), high fidelity impact.

3. **Viewport size** -- Currently hardcoded at 1280x720. Mobile viewport captures serve a real evidence need (responsive design claims, mobile-specific content). Already partially acknowledged in the backlog ("Screenshot height cap configurability"). Low risk, purely "neutral" in the evidence sense.

**Tier 3: Excitement features (delight, but adds complexity)**

4. **Full-page vs. above-the-fold** -- Currently always full-page with an 8000px cap. Offering "viewport only" as an option is low-effort and occasionally valuable.

5. **Device emulation** -- User-agent string + viewport + pixel ratio. Useful for mobile evidence but significantly more complex to validate and document.

**Tier 4: Defer (high complexity, niche demand, evidence complications)**

6. **Session/cookie injection** -- Injecting arbitrary cookies or localStorage to capture authenticated/personalized views. Powerful but creates a fundamentally different evidence claim ("this is what the page showed *when I presented these credentials*"). Defer until Job B demand materializes. When implemented, it must be gated and clearly distinguished in the evidence record.

#### 4. WRL should distinguish "neutral" vs. "opinion" parameters -- and the distinction should be visible to verifiers

This is the most important UX-strategic recommendation. Not all parameters are epistemically equal:

**Neutral parameters** change *how* you observe without changing *what* the page decides to show you. They are analogous to choosing a camera angle.
- Viewport dimensions
- Wait conditions (timeout, selector)
- Screenshot options (full-page vs. viewport, format)
- Device pixel ratio

**Opinion parameters** change *what the page decides to show you*. They inject caller intent into the page's behavior. They are analogous to staging a photograph.
- Cookie consent choice (accept/reject/dismiss)
- Injected cookies or session state
- Geolocation spoofing
- Language/locale override

This distinction should be **visible in the capture metadata and verification response.** A verifier looking at the evidence should immediately understand: "This capture used a 375x812 viewport [neutral] and auto-dismissed cookie consent banners [opinion]." The verification endpoint should surface these parameters with clear labels.

For the API, this means:
- Neutral parameters can be part of a flat `options` object -- they're uncontroversial.
- Opinion parameters should be in a separate, clearly-named namespace (e.g., `behavior` or `interventions`) so the API structure itself communicates that these affect what the page shows.
- Opinion parameters should always appear in capture status/verification output, even when set to defaults.

#### 5. Cookie consent handling deserves a special design, not just a parameter

Cookie consent is uniquely important because it is the only category where *not* intervening actively degrades evidence quality for the majority of captures. For all other parameters, the default (no parameter) produces a reasonable result. For cookie consent, the default (no handling) produces a degraded result.

Recommended approach from a UX strategy perspective:

**Default behavior should be "dismiss without accepting or rejecting."** The goal is to remove the overlay so the page content is visible, without making a consent choice that changes what tracking/personalization the page performs. This is the closest thing to a "neutral" cookie consent action. Technically, this means:
- Detect common consent manager patterns (OneTrust, Cookiebot, CMP frameworks)
- Click the dismiss/close button or remove the overlay DOM elements
- Do NOT click "accept all" -- accepting consent changes the page's behavior (ads load, tracking fires, personalized content may appear)
- Record in capture metadata: `cookieConsent: "dismissed"` so verifiers know intervention occurred

This should be the **default**, not an opt-in parameter. The reasoning: for Job A (capture what the page looks like to the public), a consent-dismissed view is closer to "what the public sees after making any consent choice" than a consent-banner-occluded view. The banner is transient UX, not the page's content.

Callers who specifically want the banner (testing consent UX, for instance) should be able to set `cookieConsent: "none"` to disable the default dismissal.

#### 6. Progressive disclosure should govern the parameterization rollout

Apply progressive disclosure in two dimensions:

**API surface:** Start with 2-3 parameters maximum. Cookie consent handling (as a default behavior, not a parameter -- users shouldn't have to ask for it). Viewport width (one number). Wait timeout override (one number). That's it for v1. Additional parameters are added only when a user requests them.

**Documentation and cognitive load:** The capture API should remain a one-field operation for the common case. `POST /v1/captures { "url": "..." }` must continue to work exactly as it does today, but produce better results (because cookie consent dismissal is now default). Parameters are optional fields that most callers never need to know about.

This follows the YAGNI principle from the project manifesto. Don't build viewport configuration because it seems useful -- build it when a user reports that the default viewport doesn't work for their job.

#### 7. The evidence claim needs a clear mental model for callers and verifiers

WRL's evidence positioning requires that both the person who requested the capture and the person who later verifies it share a mental model of what the capture represents. Today that model is simple: "a screenshot of what a fresh browser saw." With parameterization, the model becomes: "a screenshot of what a browser saw under declared conditions."

This is fine -- and arguably more honest -- but only if the conditions are:
1. **Immutably recorded** alongside the capture (in KV metadata, in the WACZ bundle, in the verification response)
2. **Presented in human-readable terms** at verification time (not raw Playwright config)
3. **Clearly distinguished** from the URL and timestamp as a separate axis of provenance

The verification page/response should show something like:
```
URL:       https://example.com/article
Captured:  2026-03-16T14:22:00Z
Viewport:  1280x720 (default)
Cookie consent: dismissed (default)
Wait:      network idle (default)
```

When parameters are non-default:
```
URL:       https://example.com/article
Captured:  2026-03-16T14:22:00Z
Viewport:  375x812 (caller-specified)
Cookie consent: dismissed (default)
Wait:      selector '.article-body' (caller-specified)
```

The "(default)" and "(caller-specified)" labels are critical. They let a verifier distinguish between WRL's standard behavior and the caller's intent.

### Proposed Tasks

These are UX-strategy-level tasks (analysis, specification, validation), not implementation:

1. **Define the parameter taxonomy** -- Formalize the neutral/opinion distinction. For each candidate parameter, classify it and document its evidence implications. This becomes the design constraint for API and metadata design.

2. **Design the capture provenance display** -- Specify how parameters appear in capture status, verification response, and (future) verification page. Ensure verifiers can understand capture conditions without technical knowledge.

3. **Validate cookie consent as default behavior** -- Confirm through testing that auto-dismissal (not auto-accept) is technically feasible for the major CMP frameworks and produces results closer to "what the page looks like" than the banner-occluded alternative.

4. **Define the "evidence claim" language** -- Write the one-paragraph explanation of what a WRL capture represents, accounting for parameterization. This becomes copy for the API docs and verification page. It should be precise enough that a lawyer or journalist can understand the claim and its limitations.

5. **User journey: parameterized capture** -- Map the journey for a caller who needs a non-default capture (e.g., mobile viewport). Identify the minimum information they need to provide and the minimum feedback they need to receive. Ensure progressive disclosure: the common case (default capture) remains effortless.

### Risks and Concerns

**Risk 1: Parameterization becomes the excuse for poor defaults.**
If WRL adds parameters, there's a temptation to leave defaults broken and tell users to "just pass the right parameters." Cookie consent handling should be a *default improvement*, not an opt-in. If a caller has to know about cookie consent parameters to get a useful screenshot, the product has failed at Job C.

**Risk 2: Evidence claim becomes confusing or untrustworthy.**
Every parameter makes the evidence claim harder to explain. If WRL exposes 15 parameters, verifiers won't understand what they're looking at. Strict progressive disclosure and the neutral/opinion distinction mitigate this, but it requires discipline to resist adding parameters "because Playwright supports them."

**Risk 3: The neutral/opinion distinction is contested.**
Viewport size seems clearly neutral, and session injection seems clearly opinion, but cookie consent dismissal sits in a gray zone. Dismissing without accepting is *less* opinionated than accepting, but it's still an intervention. WRL should be transparent about this rather than pretending it's neutral. Call it "cookie banner dismissal" in the metadata, not "no cookie intervention."

**Risk 4: Scope creep from "parameterization" to "headless browser as a service."**
The further WRL goes down the parameterization path, the closer it gets to competing with generic screenshot APIs (URLBox, Screenshotone, etc.) rather than differentiating on evidence. The evidence positioning requires restraint: only add parameters that serve the evidence use case, not parameters that make WRL a general-purpose rendering tool.

**Risk 5: Cookie consent auto-dismissal has a long reliability tail.**
There are dozens of CMP implementations, custom consent UIs, and edge cases. A dismissal mechanism that works on 80% of sites is valuable, but the 20% failure rate creates a confusing experience ("why did this capture have a banner but the other didn't?"). WRL should record whether dismissal was attempted, succeeded, or failed -- and surface this in capture metadata.

### Additional Agents Needed

**product-marketing-minion** -- The evidence claim language is a marketing/positioning question as much as a UX one. The neutral/opinion parameter distinction has implications for how WRL positions itself. The product-marketing perspective should validate that "evidence under declared conditions" is a coherent market position and doesn't dilute the evidence brand.

No other agents needed beyond those already assigned (security, API design, gru, data, frontend). The frontend-minion's involvement is appropriate for the future verification page display of parameter provenance. The security-minion's analysis of cookie injection and session state is essential and already scoped.
