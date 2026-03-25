# Phase 0083: Decisions

## 1. Inline duplication over shared utility file

**Chosen:** Duplicate the ~20-line `mergeTimestampChecks()` function in both `format.js` and `verify-page.js`.

**Over:** Creating a separate `checks.js` utility file that `format.js` imports and `verify-page.js` copies inline (frontend-minion Option C).

**Why:** The browser inline script constraint means we cannot avoid duplication regardless. Adding a third file for a 20-line function that will rarely change violates YAGNI. Both copies are covered by the test suite.

## 2. Generic detail text (no TSA name in merged row)

**Chosen:** Merged row shows mechanism type only ("Independent RFC 3161 timestamp"). TSA identity shown in metadata section below.

**Over:** Including TSA name in the check row detail (ux-strategy-minion suggestion).

**Why:** Keeps the merge function decoupled from the capture metadata shape. The check table answers "what kind of verification?" while the metadata section answers "who verified it?"

## 3. State-dependent descriptions via `.desc` property

**Chosen:** Merge function sets a `.desc` property on the merged check object; `renderChecks()` prefers `c.desc` over static `CHECK_DESCS` lookup.

**Over:** Making `CHECK_DESCS` a function that takes check data.

**Why:** One-line change to `renderChecks()` (`c.desc || CHECK_DESCS[c.name] || ''`). Avoids refactoring the static object pattern used by all other checks.

## 4. JSON output unchanged

**Chosen:** `formatJson()` continues emitting raw `timestamp` and `qualifiedTimestamp` entries.

**Over:** Merging in JSON output too (would be a breaking API change).

**Why:** Presentation-layer only change per issue scope. Machine consumers may depend on the granular check names. Confirmed by Lucy (team gate adjustment) that this was the correct approach.

## 5. Pre-process pattern over renderer modification

**Chosen:** A `mergeTimestampChecks()` function transforms the checks array before any rendering.

**Over:** Modifying the rendering loops to handle timestamp merging inline.

**Why:** Keeps renderers as simple iterators. Single responsibility — merge logic is isolated and testable. Both renderers (CLI and web) consume the same array shape.
