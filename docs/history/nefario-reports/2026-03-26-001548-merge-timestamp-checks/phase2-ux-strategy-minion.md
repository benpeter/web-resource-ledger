# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. "Time verification" is the right umbrella label -- with one refinement

The existing labels follow a consistent pattern: `[Thing] [property]` -- "File integrity", "Bundle integrity", "Digital signature". "Time verification" fits this pattern perfectly. It communicates the *job* (proving when something happened) rather than the *mechanism* (RFC 3161, eIDAS). The audience -- lawyers and compliance officers -- think in terms of "can I prove this existed at that time?" not "which timestamp protocol was used?"

No change needed to the label itself.

### 2. State descriptions: mostly right, two problems to fix

**Problem A: The "None" state undersells what the user still has.**

The proposed text `"No independent timestamp was obtained"` is accurate but alarming in isolation. A lawyer sees a dash icon next to a statement about missing evidence and reasonably concludes the capture is deficient. But the capture still has a server-recorded time in the `signedAt` metadata. The "None" state needs to acknowledge this:

> -- Time verification -- No independent timestamp. Time is based on the capture service clock.

This gives the compliance reader the full picture: there *is* a time, it just lacks independent corroboration. The distinction between "no time at all" and "no *independent* time" is material for legal weight assessment.

**Problem B: The RFC 3161-only state is too vague about what "independent" means.**

The proposed text `"Independent timestamp from [TSA name]"` is good but misses an opportunity. For the legal audience, the word "independent" is doing heavy lifting and they will want to know *what kind* of independence. The TSA name alone does not convey this. Add a brief qualifier:

> check Time verification -- RFC 3161 timestamp from [TSA name]

"RFC 3161" is a term compliance officers encounter in digital evidence contexts. It is more precise than "independent" (which could mean anything) and less jargon-heavy than "messageImprint" or "time-stamp token". For the web page, the description row can expand: "An independent timestamp authority cryptographically recorded the time of capture."

### 3. Qualified timestamp state is well-designed

The eIDAS Art. 41 citation is correct and trust-building. Lawyers in EU jurisdictions will recognize this immediately. The "(eIDAS Art. 41)" parenthetical is the single most valuable piece of information for that audience -- it answers "under what legal framework does this timestamp carry presumptive validity?"

### 4. "Both present" state correctly elevates the qualified timestamp

When both are present, showing only the qualified timestamp is the right call. The qualified timestamp strictly subsumes the standard one in terms of legal weight. Showing both would violate the progressive disclosure principle -- the user does not need to evaluate two timestamps when one is strictly superior.

However, the standard timestamp should remain accessible in metadata (the TSA/QTSA lines below the check table already handle this). Do not suppress it from the data -- just from the primary check row.

### 5. The "skip" status icon must not appear on the merged row

The current problem is precisely that a dash/skip icon appears where a check icon appears directly below it. The merged row eliminates this by design, but the implementation must ensure:
- When qualified timestamp is present but standard is absent: show check icon, not dash
- When neither is present: show dash icon (this is the only case)
- Never show a "fail" icon for absence -- failure means the timestamp *exists but is invalid*

This distinction (absent vs. invalid) matters enormously for trust. "We didn't get a timestamp" is neutral. "The timestamp failed verification" is a red flag.

### 6. CLI column width impact

The current `COL_WIDTH` is 22 characters. "Time verification" is 17 characters -- fits comfortably. The detail text after the status column will need to accommodate the longest variant: "Qualified electronic timestamp (eIDAS Art. 41)" is 47 characters. On an 80-column terminal, with 2-char indent + 22-char label + 4-char status + 2-char gap, that leaves 50 characters for detail -- just enough. Verify this does not wrap.

### 7. Web page description text per state

The web page has both `CHECK_LABELS` and `CHECK_DESCS`. The merged row needs a single label with state-dependent descriptions:

| State | Label | Description |
|-------|-------|-------------|
| Qualified | Time verification | Qualified electronic timestamp from an EU Trusted List TSA (eIDAS Article 41). |
| Standard only | Time verification | An independent timestamp authority recorded the time of capture (RFC 3161). |
| None | Time verification | No independent timestamp was obtained. Time is based on the capture service clock. |
| Both | Time verification | Qualified electronic timestamp from an EU Trusted List TSA (eIDAS Article 41). |

The description must be dynamic (driven by the check data), not static. This is a departure from the current pattern where each check name maps to exactly one description string.

### 8. Verdict sentence impact

The `buildVerdict()` function in `format.js` counts applicable vs. skipped checks. Merging two checks into one reduces the total check count. The verdict text "N of M applicable checks passed" will naturally show a lower denominator. This is correct behavior -- no special handling needed, but the test assertions that hard-code check counts will need updating.

## Proposed Tasks

1. **Define the merged check data model**: Decide whether the verifier emits a single `timestamp` check (with enriched detail) or continues emitting two checks that the formatter merges. The formatter-merge approach is lower risk (no API change) but adds display logic. The single-check approach is cleaner but changes the JSON output contract.

2. **Update CLI formatter** (`packages/verify/lib/format.js`):
   - Remove `qualifiedTimestamp` from `CHECK_LABELS` and `CHECK_ORDER`
   - Rename `timestamp` label to "Time verification"
   - Add merge logic: if both `timestamp` and `qualifiedTimestamp` checks exist in the result, display only one row with the qualified state's information
   - Update detail text per the four states above
   - Verify column width on 80-char terminal

3. **Update web verify page** (`src/verify-page.js`):
   - Make `CHECK_DESCS` dynamic for the timestamp row (description depends on which timestamp data is present)
   - Merge the two check rows into one in `renderChecks()`
   - Ensure the correct icon (check vs. dash) is shown based on merged state

4. **Update docs site** (`site/content/verification.md`):
   - Merge the two timestamp rows in the "What each check confirms" table
   - Update the example JSON if check names change

5. **Update test assertions** (`packages/verify/test/format.test.js`):
   - Adjust check count expectations
   - Add test cases for: qualified-only, standard-only, both-present, neither-present
   - Verify verdict sentence grammar for all four states

6. **Preserve JSON API backward compatibility**: If the JSON output still emits separate `timestamp` and `qualifiedTimestamp` checks, document that the human-readable formats merge them. If the JSON output changes, consider this a breaking change and version accordingly.

## Risks and Concerns

1. **JSON API breaking change**: If the merge happens at the data model level (single check instead of two), any API consumer parsing the JSON output will break. Recommend merging only at the display layer (formatter and web page) and leaving the JSON contract unchanged. The JSON already serves a different audience (developers integrating programmatically) than the display surfaces (lawyers evaluating evidence).

2. **"Timestamp chain" check orphaned**: The current `timestampChain` check validates the CMS certificate chain of the *standard* timestamp. If the standard timestamp is visually suppressed when a qualified timestamp is present, the chain check becomes contextually confusing ("chain of what?"). Consider whether `timestampChain` should also be folded into the merged row or suppressed when the qualified timestamp is the displayed one.

3. **Future timestamp states**: If a third timestamp type is added later (e.g., a blockchain anchor), the merged-row pattern must accommodate it. The current design handles this naturally -- "Time verification" is generic enough, and the detail text distinguishes the mechanism. But the implementation should use a clear priority order (qualified > standard > other) rather than hard-coding two cases.

4. **Accessibility**: The merged row changes the screen reader experience. Currently, a screen reader announces "Timestamp imprint: skip" followed by "Qualified timestamp: pass" -- which, while confusing visually, does give the user both data points. The merged row must ensure the screen reader text includes the mechanism type ("Time verification: pass, qualified electronic timestamp") so the user does not lose information.

## Additional Agents Needed

None.
