# Decisions — 0078 UI Fixes Batch

## D1: Inline safeUrl() modification vs. separate normalizeUrl()

**Chosen**: Modify safeUrl() inline to include the https:// prepend logic.
**Rejected**: Adding a separate normalizeUrl() called before safeUrl() in handleSubmit().
**Rationale**: safeUrl() is a 7-line function with a single caller. Two coordinated functions would be more code with no additional clarity. The normalization is logically part of "parse this string as a safe URL."

## D2: display: block on child spans vs. flexbox on parent

**Chosen**: Add `display: block` to `.billing-stat-value` and `.billing-stat-label` spans.
**Rejected**: Adding `display: flex; flex-direction: column; align-items: center` to `.billing-stat` parent.
**Rationale**: The spans already have the right styling (font-size, margin-top) — they just need to be blocks for those styles to work. Flexbox on the parent changes more properties than needed for two stacked elements.

## D3: Drop urlInput.value visual feedback

**Chosen**: Do not set `urlInput.value = safe` after normalization.
**Rejected**: Updating the input field to show the normalized URL before submission.
**Rationale**: ux-strategy-minion advisory — the field clears in the same async cycle as the submit response, making the update invisible. A false affordance is worse than no affordance. The success state (capture appearing in the list) is sufficient signal.

## D4: :// guard for prepend behavior

**Chosen**: Only prepend `https://` when input does NOT contain `://`.
**Rationale**: Prevents mangling inputs like `htt://example.com` where the user intended a scheme but got it wrong. If `://` is present, the user already expressed intent about the scheme — we should not silently rewrite it.
