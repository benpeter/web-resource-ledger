## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### 1. After-screenshot primary, before-screenshot in a labeled comparison -- not side-by-side

The verification page has a 640px max-width and the current design shows a single screenshot at full column width. The verifier's primary job is confirming what the page looks like -- the post-dismissal screenshot (after) serves that job directly. The pre-dismissal screenshot (before) is supporting evidence that proves a consent banner existed and was dismissed.

**Recommendation: Show the after-screenshot as the primary visual, with the before-screenshot accessible via an inline disclosure pattern below it.**

The structure should be:

```
[Screenshot section heading: "Screenshot"]
  [after-screenshot at full column width]
  [label: "Page after cookie consent dismissal"]

  [disclosure toggle: "Before consent dismissal"]
    [before-screenshot at full column width]
    [label: "Original page with cookie consent banner"]
```

Rationale:
- **Side-by-side fails at 640px.** Two screenshots at 320px each are illegible. Responsive breakpoints could stack them vertically on mobile, but then side-by-side only works on desktop -- adding complexity for a minority of viewports. The page already uses a narrow single-column layout. Respect that constraint.
- **The after-screenshot is what verifiers care about.** Following the JTBD analysis from the advisory (Job A: "capture what this page looks like to the public"), the post-dismissal screenshot is the primary evidence artifact. The before-screenshot is provenance, not content.
- **Disclosure respects progressive disclosure.** Most verifiers need to see what the page looks like. A minority need to confirm that a banner existed. The before-screenshot is secondary information -- show it on request, not by default.
- **The `<details>` pattern already exists in the page.** Cryptographic details use `<details><summary>`. Reusing the same pattern for the before-screenshot maintains consistency (Nielsen heuristic #4) and requires zero new CSS or JS patterns.

The heading "Before consent dismissal" is descriptive, not technical. It tells the verifier what they are looking at without requiring knowledge of CMPs or autoconsent.

#### 2. Consent dismissal status should appear as a check in the existing checks list -- not as separate UI

The verification page already has a "Checks" section with a pass/fail/skip icon pattern (green checkmark, red X, gray dash). Cookie consent dismissal status maps naturally to this pattern:

| Scenario | Status | Label | Description |
|----------|--------|-------|-------------|
| Consent dismissed successfully | pass | Cookie consent handled | The capture dismissed a cookie consent banner to reveal the page content. |
| Consent dismissal attempted but failed | skip | Cookie consent attempted | A consent banner was detected but could not be dismissed. The screenshot may be partially obscured. |
| No consent banner detected | skip | Cookie consent | No cookie consent banner was detected on this page. |
| Pre-feature capture (no captureSettings) | (omit) | -- | Check row is simply absent. |

Rationale:
- **Reuse the existing mental model.** Verifiers already understand the checks pattern: a list of things WRL verified, each with a pass/fail/skip status. Adding consent handling as a check keeps the cognitive model consistent. Introducing a separate "Capture Conditions" section for a single item would add a new section type that will feel orphaned.
- **Labels are human-readable, not technical.** "Cookie consent handled" tells a non-technical verifier exactly what happened. Avoid terms like "autoconsent", "CMP", "opt-out". If a verifier needs specifics (which library, which CMP was detected), that belongs in the disclosure under "Cryptographic details" or a new "Capture details" disclosure -- not in the checks list.
- **The gray dash (skip) is the right icon for "attempted but failed" and "not detected."** The existing pattern uses skip for checks that were not applicable (e.g., no WACZ bundle). Using skip for "no banner detected" communicates "this check didn't apply" without suggesting failure.

For the description text, use active voice and explain what the verifier is looking at:
- Pass: "The capture dismissed a cookie consent banner to reveal the page content."
- Skip (attempted): "A consent banner was detected but could not be dismissed. The screenshot may be partially obscured."
- Skip (none detected): "No cookie consent banner was detected on this page."

The `CHECK_LABELS` and `CHECK_DESCS` constants in `verify-page.js` already hold this mapping. The new consent check fits the same data structure (`{ name, status, detail }`).

#### 3. When autoconsent fails, show the single screenshot normally but surface the attempt in the checks list

When autoconsent cannot dismiss the banner (unknown CMP, custom banner, JS error), the capture produces a single screenshot -- functionally identical to today's capture. The verification page should:

1. **Show the single screenshot exactly as it does today** -- same section, same `<img>`, same alt text. No "degraded" badge, no warning color, no yellow caution icon.
2. **Include the consent check in the checks list as "skip"** with the detail text explaining what happened.
3. **Do not use the word "degraded" anywhere visible to verifiers.** The capture is complete and verified. The evidence is the evidence -- a consent banner being visible is a fact, not a defect. Calling it degraded undermines the evidence framing.

Rationale:
- **The verifier's confidence should not be shaken by cosmetic banners.** If the verification page shows a yellow warning ("Cookie consent dismissal failed -- this capture may show a consent banner"), the verifier might question the integrity of the entire capture. But the capture is fully intact -- the signature verifies, the hashes match. The consent banner is what the page showed. Framing it as a failure confuses evidence integrity with evidence aesthetics.
- **The checks list handles the nuance gracefully.** A skip icon with "A consent banner was detected but could not be dismissed" is informational, not alarming. It explains why the screenshot might show an overlay without suggesting the capture is broken.
- **Backward compatibility is served naturally.** Pre-feature captures have no consent check at all -- the check row is absent. There is no ambiguity: if the check isn't there, the feature didn't exist when the capture was made.

#### 4. Backward compatibility: absent data is silent, not explained

Pre-feature captures have one screenshot and no `captureSettings`. The verification page must handle this with zero visual disruption:

- **One screenshot?** Show it in the existing screenshot section. No change from current behavior.
- **No consent check in the checks array?** Simply don't render a consent check row. The checks list only renders what the data contains. No "Cookie consent: not available" row. No "(legacy capture)" label.
- **No `captureSettings`?** No "Capture settings" section appears. The page shows exactly what it shows today.

The implementation principle: **presence-driven rendering, not schema-version switching.** The code should check `if (consentCheck exists) { render it }`, not `if (captureSettings.version >= 2) { render consent section }`. This is more resilient and requires no version tracking logic in the frontend.

This is the simplest approach from both implementation and cognitive-load perspectives. A verifier looking at a pre-feature capture sees the same page they saw before the feature shipped. A verifier looking at a dual-screenshot capture sees additional information (the consent check, the before-screenshot toggle). No existing capture is visually altered.

#### 5. Evidence framing: the dual screenshot tells a two-part story -- communicate it as such

The dual screenshot is evidence of two things:
1. A cookie consent banner existed on this page at capture time.
2. This is what the page content looks like beneath the banner.

The verification page should frame this as a narrative, not a comparison. The section labels do the framing:

- **After-screenshot label:** "Page after cookie consent dismissal" -- states what the image shows.
- **Before-screenshot label (inside disclosure):** "Original page with cookie consent banner" -- states what the image shows.
- **Checks list entry:** "The capture dismissed a cookie consent banner to reveal the page content." -- explains the action taken.

Together, these three pieces of text tell the complete story without requiring the verifier to understand browser automation, CMPs, or autoconsent. A non-technical verifier (lawyer, journalist, compliance officer) reads: "WRL found a cookie banner, dismissed it, and here's what the page looks like underneath. You can also see what it looked like with the banner."

Avoid:
- "Before/After" as the only labels. These are relative terms that require context. "Before what? After what?"
- "Consent-free view" -- implies the page normally has consent, which is WRL's opinion.
- "Clean screenshot" -- implies the other screenshot is dirty.
- Technical terms: "autoconsent", "CMP", "DuckDuckGo", "opt-out", "DOM manipulation".

#### 6. The `captureSettings` metadata should appear in a new disclosure section for power users

Below the checks list and above the existing "Cryptographic details" disclosure, add a second disclosure:

```
[disclosure toggle: "Capture details"]
  Cookie consent:  Dismissed (autoconsent library, success)
  Viewport:        1280 x 720 (default)
  Wait condition:  Network idle (default)
  Render quality:  Full
```

This serves the power-user verifier who wants to know exactly what conditions produced the capture. It mirrors the recommendation from the Phase 0021 advisory: "conditions should be immutably recorded, presented in human-readable terms, and clearly distinguished from URL and timestamp."

The values should come directly from `captureSettings` in the API response, but presented with human-readable labels:
- `consentHandling.action: "dismiss"` becomes "Dismissed"
- `consentHandling.library: "autoconsent"` becomes "(autoconsent library)"
- `consentHandling.success: true` becomes "success"

For pre-feature captures where `captureSettings` is absent: the disclosure does not appear. No "Unknown" or "N/A" values.

This is a new disclosure section (alongside existing "Cryptographic details"), not an expansion of the existing one. Cryptographic details serve verification auditors; capture details serve evidence evaluators. Different audiences, different sections.

### Proposed Tasks

These are UX-strategy-level tasks -- specification and validation, not implementation:

1. **Specify the screenshot section layout for dual-screenshot captures.** Define the HTML structure, heading text, disclosure toggle text, and alt text for both images. The after-screenshot gets the current `screenshot-img` class. The before-screenshot gets the same class inside a `<details>` element. Provide the exact text strings for labels and alt attributes. Ensure the `<details>` pattern matches the existing cryptographic details styling.

2. **Define the consent check data contract.** Specify the `{ name, status, detail }` object that the verification API should return for the consent check. Define the four scenarios (success, attempted/failed, not detected, pre-feature absence). Map each to a label, description, and detail string. This becomes the contract between the backend (which produces the check) and the frontend (which renders it).

3. **Specify the "Capture details" disclosure section.** Define which fields from `captureSettings` appear, their human-readable labels, and the formatting rules (e.g., "1280 x 720" not "1280x720", "(default)" suffix for default values). Define the presence/absence rule: section only renders when at least one field has data.

4. **Write the evidence claim language for cookie consent.** Produce the one-paragraph explanation of what dual-screenshot captures represent, suitable for the API documentation and verification page tooltip. This must be understandable by a lawyer or journalist, not just a developer.

5. **Validate backward compatibility with a walkthrough.** Step through the verification page rendering logic with three capture types: (a) pre-feature capture (one screenshot, no captureSettings), (b) dual-screenshot capture with successful dismissal, (c) dual-screenshot capture with failed dismissal. Confirm that each scenario produces a coherent page with no orphaned sections, no "N/A" values, and no visual regressions.

### Risks and Concerns

**Risk 1: The `<details>` disclosure may be overlooked by verifiers who need to see the before-screenshot.**

If the primary evidence use case requires proving a banner existed (not just proving what the page looks like), the before-screenshot is critical and should not be hidden. However, the disclosure is standard HTML that renders as a clickable summary -- it is not deeply buried. The checks list entry ("dismissed a cookie consent banner") signals that the before-screenshot exists. If user testing reveals that verifiers miss the before-screenshot, the disclosure could be replaced with a labeled pair of images (still stacked vertically, not side-by-side).

Mitigation: Make the disclosure summary text descriptive enough to attract attention. "Before consent dismissal" tells the verifier there is something to see.

**Risk 2: The consent check in the checks list may create confusion when consent is not detected.**

A "skip" status for "No cookie consent banner was detected" might puzzle verifiers: "Was something supposed to happen?" This is the same issue that the existing WACZ checks avoid by simply not rendering when absent. Consider whether the "no banner detected" case should render a skip row or be absent entirely.

Recommendation: When no consent banner is detected AND consent handling was attempted (i.e., the feature exists but no banner was found), omit the check row. The check should only appear when something happened: a banner was found and dismissed (pass), or a banner was found but could not be dismissed (skip). "Nothing happened" is best communicated by absence, not by a row that says "nothing happened."

**Risk 3: The "Capture details" disclosure adds a second disclosure to a page that already has one.**

Two disclosures is acceptable but should not grow to three or four. The verification page is deliberately minimal. Each disclosure serves a distinct audience (crypto auditors vs. evidence evaluators). If future features add more metadata categories, they should be subsumed into "Capture details" rather than spawning new disclosures.

**Risk 4: Alt text for screenshots needs to distinguish before and after for screen reader users.**

The current alt text pattern is "Screenshot of {url} captured on {date}". With dual screenshots, both images would have identical alt text. Screen reader users cannot distinguish them. The alt text must include the consent context:
- After: "Screenshot of {url} captured on {date}, after cookie consent dismissal"
- Before: "Screenshot of {url} captured on {date}, showing original cookie consent banner"

### Additional Agents Needed

**ux-design-minion** -- The disclosure pattern for the before-screenshot and the "Capture details" section needs visual design attention. Specifically: should the before-screenshot disclosure have a subtle background tint to distinguish it from the after-screenshot? Should the caption labels use a specific typographic treatment? The current page CSS uses `.check-desc` at 0.8rem gray for secondary text -- is that the right pattern for screenshot captions? These are visual hierarchy decisions that fall outside UX strategy.

**frontend-minion** -- Implementation of the `<details>` element for the before-screenshot, the conditional rendering logic (presence-driven, not version-switched), the new check row for consent status, and the "Capture details" disclosure section. The verify-page.js file is vanilla JS with string-concatenated HTML and DOM manipulation for safe content insertion. The frontend-minion needs to work within this pattern.

No other agents needed. The data model contract (what the verification API returns for consent checks and captureSettings) should be defined by the data-minion or API-design-minion, but the verification page rendering is the implementation concern. The security constraints (no reflected user data in innerHTML) are already established in the existing code and do not require new security review for this change.
