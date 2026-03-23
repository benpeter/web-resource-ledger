# UX Strategy Analysis: Partial/Degraded Captures

## Executive Summary

Partial evidence is better than no evidence -- but only when the consumer
can clearly distinguish partial from complete. The danger is not in capturing
less; it is in the ambiguity about what was captured and what was missed.
WRL's value proposition rests on the word "evidence." Evidence with disclosed
limitations is still evidence. Evidence with undisclosed limitations is
misleading. The entire UX question reduces to: **how clearly does the system
communicate what it captured and what it did not?**

---

## Question 1: Is Partial Evidence Always Better Than No Evidence?

### Short answer: Almost always, yes -- with one critical exception.

**The general case favors partial capture.** A user who submits tagesschau.de
to WRL has a specific job: "prove what this page looked like at this moment."
When the capture fails entirely, the user gets nothing. They cannot prove the
page existed, cannot show its headline, cannot demonstrate its content. A
screenshot and rendered HTML taken at the 25-second mark -- even without
lazy-loaded images or tracking pixels -- still captures the headline, the
article text, the primary layout, and the above-the-fold content. That is
vastly more useful than a JSON object saying `"status": "failed"`.

Apply JTBD: the user hired WRL to preserve evidence. A partial capture
fulfills the core job imperfectly. A failure fulfills it not at all.

**The exception: when the partial capture could be actively misleading.**

Consider a page that loads a consent dialog overlay first, then reveals
content. A 25-second capture might show only the consent dialog -- a
screenshot of a cookie banner with the actual content hidden beneath it.
If a consumer treats this as "evidence of what the page looked like," they
are misled. The page did not look like a cookie banner; it looked like a
news article behind a cookie banner.

However, this exception does not argue against partial capture. It argues
for **honest metadata**. The consent-dialog screenshot is still evidence --
it proves the page served a consent dialog at that moment. The problem only
arises if the consumer believes the capture is complete when it is not.

**Recommendation:** Implement partial captures. Never suppress evidence. But
always disclose the limitations so the consumer can evaluate fitness for their
purpose.

### When confident failure is preferable

There is one scenario where `failed` is better than `partial`: when the page
never reached a renderable state at all. If the browser connected but got a
blank page, a white-screen screenshot, or a navigation error before any DOM
was painted, that is not "partial evidence" -- it is noise. The system should
only produce a partial capture when it has meaningful content to show. The
threshold should be: did the page reach at least `DOMContentLoaded`? If yes,
capture. If no, fail.

---

## Question 2: Consumer Journey for Degraded Captures

### Current journey (complete capture)

1. User submits URL
2. Polls status --> `pending` --> `complete`
3. Retrieves artifacts: screenshot, HTML, headers, WACZ
4. Optionally shares verification URL
5. Verifier sees: green "Verified" banner, screenshot, cryptographic checks

The mental model is binary: it worked or it didn't. This is clean and
intuitive.

### Proposed journey (with partial captures)

The consumer needs to understand three things:
1. **The capture succeeded** (artifacts exist, signature is valid)
2. **The capture is incomplete** (some content may be missing)
3. **What is likely missing and why** (lazy-loaded content, below-fold
   resources that had not loaded when the timeout fired)

### Communication strategy: "captured with limitations"

Avoid the word "degraded" -- it implies the evidence is damaged or
unreliable. Avoid "partial" in user-facing language -- it sounds like
something broke. Frame it as **what was captured** rather than what was not.

Recommended language hierarchy:

**API response (technical consumers):**
```json
{
  "status": "complete",
  "renderQuality": "timeout-after-load",
  "renderDetail": "Page did not reach network idle within 25 seconds. Screenshot and HTML reflect the page state at timeout."
}
```

Keep `status: "complete"` -- the capture completed. It produced artifacts,
they are signed, they are verifiable. The quality dimension is separate from
the lifecycle dimension. This is critical for backward compatibility and for
the consumer's mental model: "complete" means "you have artifacts." Adding a
fourth status like `"degraded"` or `"partial"` breaks the clean
pending/complete/failed lifecycle and forces every consumer to handle a new
state.

**Verification page (non-technical consumers):**
More on this in Question 3 below.

### What consumers will actually see

A partial capture of tagesschau.de will show:
- A full-width screenshot with above-the-fold content rendered
- Most text content present in the HTML
- Missing: lazy-loaded images below the fold, some ad network resources,
  possibly some JavaScript-injected widgets

For most evidentiary purposes, this is sufficient. The headline, the article
text, the layout, the date -- the things users actually care about -- are
almost always in the initial render. The things missing are almost always
peripheral: analytics, ads, lazy images, social widgets.

### Risk: consent dialog captures

The biggest consumer confusion risk is capturing a page stuck behind a
consent dialog (GDPR cookie consent, age verification, login wall). The
screenshot shows the dialog, not the content. This is honest (the page
really did show that), but might not serve the user's intent.

Mitigation: The `renderDetail` field should be specific enough that
consumers can evaluate this. "Page did not reach network idle" tells the
consumer "the page was still loading things." They can examine the
screenshot and HTML to judge whether the capture is useful for their
purpose. WRL should not make that judgment for them -- that is the
consumer's job.

---

## Question 3: Verification Page Render Quality Indicator

### Yes, the verification page should indicate render quality. But not prominently.

The verification page currently has a binary state: green "Verified" banner
or red "Verification Failed" banner. This is the right primary signal and
must not be diluted.

Render quality is **not a verification outcome**. A partial capture with
valid hashes and a valid signature is verified. The cryptographic chain is
intact. Mixing render quality into the verification banner would confuse
the core message: "these artifacts are authentic and unmodified."

### Recommended placement

Add a single informational line in the **Capture** metadata section, below
the URL and timestamp:

```
Captured on March 16, 2026, 2:30 PM CET
Capture note: Page did not reach network idle within the timeout window.
Some content that loads late (images, widgets) may not be included.
```

Design requirements:
- Same visual weight as the timestamp (secondary information, not a warning)
- Only present when `renderQuality !== 'full'` (no indicator for complete
  captures -- absence is the signal of completeness)
- Not a warning color (no yellow, no orange) -- it is informational, not
  an error
- The "Verified" banner stays green. The signature is valid. The artifacts
  are authentic.

### What to avoid

Do not add a yellow/amber "Partially Captured" banner alongside the green
"Verified" banner. This creates a contradictory signal: "it's verified but
also something is wrong." Users seeing two colored banners will fixate on
the warning, undermining confidence in the verification they came to check.

Do not add a separate "Capture Quality" section with its own heading. This
elevates a secondary concern to a primary one. The verification page has
one job: confirm authenticity. Render quality is context, not a finding.

---

## Question 4: Effect on Retry Incentive

### The current retry model is broken for timeout failures.

Today: tagesschau.de fails, user sees `retryable: true`, user retries,
tagesschau.de fails again. The page is inherently heavy. Retrying does not
fix the problem. The `retryable: true` flag creates a false expectation that
trying again might work. It does -- but only if the page happens to load
faster on the next attempt (network variance, CDN cache warming, etc.).
For consistently heavy pages, the retry loop is pure friction.

### Partial capture correctly eliminates futile retries.

If the user gets a partial capture with a usable screenshot and HTML, they
have what they need. They will not retry because they have evidence. This is
good. The current behavior wastes the user's time: fail, retry, fail, retry,
give up with nothing.

### But: preserve the retry option for users who want better quality.

Some users may see the partial capture and decide: "I want to try again
in case the page loads faster next time." The system should not prevent
this. The user can always submit a new capture of the same URL.

The key insight: **the retry decision should be the user's, informed by the
evidence they already have.** Today, the system makes the decision
("this failed, you should retry"). With partial captures, the system
provides evidence and lets the user decide whether it is good enough. This
is a better UX because it gives users control (Nielsen heuristic 3: user
control and freedom).

### API implications for retry

The `retryable` field currently only appears on failed captures. Partial
captures should not have `retryable` -- they are not failures. If a user
wants a better capture, they submit a new one. This is conceptually
different from retrying a failure. The existing list endpoint
(`GET /v1/captures`) lets users find and compare their captures.

### One edge case: if partial capture produces unusable content

If the fallback fires but the page had not even reached `DOMContentLoaded`
(blank screen, spinning loader), the result is technically "partial" but
practically useless. This should still be marked `failed` with
`retryable: true` -- the page never reached a meaningful state. The
threshold for "partial capture" versus "failure" should be:

- **DOMContentLoaded reached**: partial capture (complete + renderQuality)
- **DOMContentLoaded not reached**: failure (retryable: true)

This preserves the retry incentive for genuinely broken navigations while
eliminating it for pages that loaded content but never reached network idle.

---

## Summary of Recommendations

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Implement partial captures? | Yes | Partial evidence beats no evidence for the core JTBD |
| New status value? | No -- keep `complete` | Lifecycle and quality are orthogonal; a fourth status breaks the clean model |
| Quality metadata field? | `renderQuality` on the capture record | Separate dimension, not a lifecycle state |
| Verification page indicator? | Subtle note in Capture section | Don't dilute the verification banner's binary signal |
| Warning color on verification? | No -- informational only | Render quality is context, not an error |
| Effect on retry? | Correctly reduces futile retries | Users get evidence instead of failure loops |
| Minimum threshold? | DOMContentLoaded | Below this, the capture is genuinely failed |
| User-facing language? | "Capture note" not "degraded" | Frame limitations honestly without implying damage |

### Kano Classification

- **Must-be**: Captures that produce _some_ artifacts should not report as failed.
  The current timeout-equals-failure behavior violates user expectations for
  any page that visibly rendered content before the timeout.
- **Performance**: The `renderQuality` metadata scales satisfaction
  proportionally -- better metadata means more informed consumers.
- **Excitement**: None applicable. This is a reliability fix, not a delight
  feature.

### Cognitive Load Impact

Adding `renderQuality` increases the information a consumer must process. But
it replaces a dead-end (`failed`) with actionable evidence plus a single
qualifier. Net cognitive load decreases because the user no longer has to
decide "should I retry?" based on zero information -- they can look at the
screenshot and decide based on what they see. Recognition beats recall
(Nielsen heuristic 6).
