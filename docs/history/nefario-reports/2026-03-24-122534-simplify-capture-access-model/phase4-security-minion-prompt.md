Task 1: Worker core -- remove share tokens, make capture GET endpoints public.

See full prompt in synthesis phase3-synthesis.md, Task 1 section.

Additional implementation notes from architecture review:
- CRITICAL: handleGetCapture (~line 1486-1490) and handleCaptureStatus (~line 1845-1850) dereference captureAuth.scopedCaptureId and captureAuth.tenantId without null checks. After auth removal, captureAuth will be undefined for public requests. Guard with `if (captureAuth)` checks.
- Ensure the existing VERIFY_RATE_LIMITER block still fires for all public artifact types after removing the 401 guard in handleGetCaptureArtifact.
- After changes, run: grep -r 'share.token\|shareToken\|share_token' src/ to verify clean removal.
