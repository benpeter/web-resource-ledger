# Outcome

- `src/capture.js`: `DEVICE_SCALE_FACTOR = 2`, used for the browser context.
- `site/content/limits.md`: largest screenshot is 2,560 by 16,000 pixels.
- Red test committed first; capture tests pass.

Effect to check after a week in production: the average stored bytes per capture
(admin overview, storage divided by captures) should drop well below the 9 to
19 MB seen in October.
