# Phase 0082: Backend fixes batch

## Source

GitHub Issue #214: Backend fixes batch: notification skip, Content-Disposition filenames

## Task Description

Small backend improvements that individually don't warrant a full phase session.

### 1. Skip approaching_limit dispatch when already sent (#187)
Captures between 161–200 currently execute unnecessary D1 queries to check if the approaching_limit email was already sent. Short-circuit the `dispatchNotification` call when the notification was already sent this billing period. Eliminates ~2 wasted D1 round-trips per capture for free-tier tenants in the post-notification window.

### 2. Set descriptive Content-Disposition filenames for capture downloads (#181)
Download responses should include a `Content-Disposition` header with a descriptive filename (e.g., `capture-example.com-2026-03-24.wacz`) instead of opaque UUIDs. Filename should include captured domain and date at minimum.

## Constraints
- All existing tests must pass
- New behavior must have test coverage
