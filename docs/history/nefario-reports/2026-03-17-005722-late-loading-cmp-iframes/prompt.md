#81 (refinement) -- Fix autoconsent injection timing for late-loading CMP iframes

CAUTION: This runs on top of nefario/cmp-navigation (PR #82). The route
handler fix (capture.js) and multi-frame injection (consent.js) are
already committed. Do NOT re-implement or revert those changes. This
refinement addresses a gap discovered during staging validation.

REQUIRED SPECIALISTS: frontend-minion and edge-minion must be included
on every team roster (planning and review).

## Problem

After deploying the capture.js route handler fix and consent.js
multi-frame injection (PR #82), staging validation shows:

| Site | CMP | Result | Explanation |
|------|-----|--------|-------------|
| theguardian.com | Sourcepoint | failed, cmp=Sourcepoint-frame | Detected but opt-out fails |
| spiegel.de | Sourcepoint | failed, cmp=Sourcepoint-frame | Detected but opt-out fails |
| nytimes.com | OneTrust | notDetected | CMP iframe not present at injection time |
| bbc.co.uk | none | notDetected | Correct -- no CMP |

Root cause: page.frames() is called once at injection time. CMP iframes
that load lazily miss the injection window.

## Success criteria

- Autoconsent injected into late-loading CMP iframes
- Existing Sourcepoint detection not regressed
- Sourcepoint opt-out failure investigated and fixed if feasible
- All 503 tests pass
- Staging validation against 14-site test set

## Scope

- In: consent.js injection timing, Sourcepoint opt-out diagnosis
- Out: vendored autoconsent changes, new CMP rules, capture.js route handler

## Constraints

- Use Playwright frame events (frameattached/framenavigated), not polling
- Keep consent timeout at 8s
