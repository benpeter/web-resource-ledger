# Phase 0082: Backend fixes batch — Decisions

## D1: Consolidation (4 tasks → 2)

**Chosen**: One task per issue (2 tasks total)
**Over**: 4 separate tasks (period helper extraction, dedup short-circuit, filename helper, handler wiring) as proposed by api-design-minion
**Why**: Each fix is small enough to implement in a single pass. Splitting adds coordination overhead for trivial operations.

## D2: Period computation — inline vs extracted utility

**Chosen**: Inline 1-line period computation at the call site
**Over**: Extracting a shared `computeNotificationPeriod()` function
**Why**: The computation is `YYYY-MM` from `new Date()` — a single template literal. Both call sites compute the same trivially obvious format independently. No reuse benefit from extraction.

## D3: Notification short-circuit — call-site pre-check vs modified dispatch

**Chosen**: Call-site `checkNotificationSent()` pre-check in index.js before `dispatchNotification()`
**Over**: Modifying `dispatchNotification()` to accept an early-return flag or lightweight cache
**Why**: Keeps `dispatchNotification()` unchanged as a correct, self-contained unit. The internal dedup remains as a race-condition safety net. The call-site check is purely a performance optimization.

## D4: Filename sanitization — ASCII-only vs RFC 5987 UTF-8

**Chosen**: ASCII-only sanitization with `[a-z0-9.-]` allowlist
**Over**: RFC 5987 `filename*` UTF-8 encoding for international domains
**Why**: KISS. ASCII covers all practical domains after punycode. IDN Unicode domains hit the sanitization regex and produce readable ASCII. Adding `filename*` doubles the header complexity for zero practical benefit.

## D5: Date sanitization in Content-Disposition

**Chosen**: Sanitize `createdAt` date value with `replace(/[^0-9-]/g, '')`
**Source**: security-minion Phase 3.5 advisory
**Why**: DB values should not be trusted in HTTP headers even when expected to be well-formed. One extra regex costs nothing and closes a theoretical header injection vector.
