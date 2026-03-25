# Phase 0083: Merge timestamp checks into single hierarchical Time verification row

Source: GitHub Issue #167

## Problem

When a capture has a Qualified Timestamp (eIDAS) but no standard RFC3161 timestamp, both the CLI and the verify page show contradictory information:

**CLI:**
```
  Timestamp imprint     skip  No independent timestamp was obtained for this capture
  Qualified timestamp   pass
```

**Verify page:** Shows a dash icon with "No independent timestamp was obtained for this capture" directly above a green check for "Qualified timestamp (eIDAS)".

This is confusing because a Qualified Timestamp is a **strictly stronger** form of independent time verification. Showing "not present" for the weaker form when the stronger form exists is like showing "No driver's license" next to "Has pilot's license."

For the target audience (lawyers, compliance, archivists), this undermines trust in the verify page — the one place where trust matters most.

## Solution

Merge the two timestamp checks into a single **"Time verification"** row that displays the strongest available tier:

| State | Display |
|-------|---------|
| Qualified timestamp present | ✓ Time verification — Qualified electronic timestamp (eIDAS Art. 41) |
| Standard RFC3161 only | ✓ Time verification — Independent timestamp from [TSA name] |
| None | — Time verification — No independent timestamp was obtained |
| Both present | ✓ Time verification — Qualified electronic timestamp (eIDAS Art. 41) |

When both timestamps are present, show the strongest in the check row. Individual TSA details remain available in the expanded details section.

## Scope

Presentation-layer only — the underlying verification logic and data model stay unchanged:

- `packages/verify/lib/format.js` — rename label, add pre-processing step to merge timestamp checks
- `src/verify-page.js` — same merge logic for web rendering
- Tests in `packages/verify/test/` — update assertions
