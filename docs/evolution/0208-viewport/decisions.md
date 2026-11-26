# Decisions

- `viewport: { width, height }` on `POST /v1/captures`, whole CSS pixels,
  width 320-1920, height 320-1440, nothing else in the object. Default
  1280x720 as before; the queue message carries it only when the caller
  sent one.
- The height cap is not a caller setting. It can't go above 8000 CSS px: at
  2x device scale that is 16000 device pixels, close to Chromium's
  screenshot limit, and #99 just bounded Worker memory around it. Lowering
  it on request saves nobody anything. Instead the cap follows the width:
  `min(8000, floor(1280 * 8000 / width))`, so the pixel count of a
  screenshot never exceeds today's largest.
- `captureSettings.viewport` is recorded on every new capture, the default
  included, so a verifier never has to guess. `captureSettings` is therefore
  never null any more.
- Shown on the verification page, the dashboard, the certificate PDF and
  MCP `get_capture`. Batch, schedules, MCP `capture_url` and the dashboard
  form keep 1280x720 for now; the verify CLI shows it in its next release.
