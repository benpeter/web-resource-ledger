# Decisions: Phase 0115

- Getting Started gets a short "No code" section before the API steps, with
  sign-in (`from=docs`, already an allowed attribution source) and web UI
  links. The landing hero hint names the three ways in: browser, API, agent.
- Step 2 of Getting Started told readers to fetch `GET /v1/captures/{id}` and
  retry while it was "pending". That endpoint answers 404 until a capture is
  complete, so a first API call met "Capture not found". Step 2 now polls the
  `statusUrl` from Step 1 and fetches the record once it says complete. The
  quality battery had the same mistake (phase 0111).
- Not done: a live demo capture linked from the landing hero. It is a
  production capture under Ben's tenant and needs his go.
