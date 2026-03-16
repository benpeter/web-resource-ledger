# UX Strategy Review: dual-screenshot-consent

**Verdict: APPROVE**

The plan handles the one genuine UX design decision in this feature -- which screenshot is primary -- correctly and without ambiguity. My review below covers the three areas where I can add signal.

---

## Journey coherence

The user job here is: "When I verify a capture, I want to understand what the page looked like and whether a consent banner was handled, so I can trust the evidence."

The plan serves that job cleanly:

- The "after" screenshot (clean page content) is primary and shown at full width. This is correct. It answers the most common question ("what does the page look like?") without friction.
- The "before" screenshot (banner visible) is placed in a `<details>` disclosure. This is correct progressive disclosure. The before screenshot serves an evidentiary sub-job ("prove the banner was there") that is secondary in frequency but high in importance when needed. `<details>` is the right pattern -- it's accessible, requires no JS, and puts the control in the user's hands.
- The consent check row ("Cookie consent handled") follows the same visual pattern as the existing crypto checks. Users scan the check list to get a fast summary of capture quality. This addition fits naturally into that existing mental model -- no new pattern to learn.
- The "Capture details" disclosure is correctly positioned as a power-user affordance. The decision to use technical language (autoconsent library name, CMP name) only inside this disclosure is exactly right. It keeps the primary surface clean while making the information discoverable.
- Backward compatibility is presence-driven throughout. Old captures render identically. This is correct -- no user confusion from partial states.

The only minor question is whether "Cookie consent handled" (the check label) is unambiguous when the result is "skip" (consent detected, dismissal failed). The plan uses the SVG_DASH (skip) icon and the detail field carries "A consent banner was detected but could not be dismissed." This is adequate -- the icon signals "not fully resolved" and the detail text explains why. The distinction between pass/skip is preserved without using alarming language like "degraded" or "warning." Correct call.

---

## Cognitive load

The net change to the verification page is:

- One new check row (conditionally shown)
- One caption line below the primary screenshot (conditionally shown)
- One `<details>` element for the before screenshot (conditionally shown)
- One `<details>` element for capture details (conditionally shown)

All four additions are conditional. For most captures (no CMP detected), the page renders identically to today. When a CMP is found and dismissed, users see exactly what they need to understand the dual-screenshot nature of the capture, presented progressively. Cognitive load delta is effectively zero for the common case and minimal for the dual-screenshot case.

---

## Simplification

No simplification opportunities. The plan already embeds the ux-strategy-minion's earlier recommendation (confirmed in the Cross-Cutting Coverage section). The implementation matches that recommendation precisely. Nothing to remove.

One observation worth preserving for Task 3 implementation: the "Capture details" disclosure label should read "Capture conditions" or "Capture details" rather than anything implying an audit trail. The plan already uses "Capture details" -- that framing is appropriate and does not oversell.

---

## JTBD alignment

Every user-facing element in Task 3 maps to a real sub-job:

| Element | Job served | Frequency |
|---|---|---|
| Primary screenshot (after) | "Show me the page content" | Always |
| Consent check row | "Tell me if a banner was handled" | When CMP present |
| Before-screenshot disclosure | "Show me the banner that was dismissed" | When user wants proof |
| Capture details disclosure | "Let me see technical capture metadata" | Power users only |

No element is serving an internal preference or a speculative user need. JTBD alignment is sound.
