# Outcome

- `src/pirsch.js`: `_send` returns the rejection and failure log promises.
- Six other failure logs in `src/index.js` and `src/capture.js` are returned.
- Red tests first: `trackHit` resolves only after the rejection log and the
  network-failure log are sent.
- After deploy: request a docs page and read `pirsch.*` events from `wrl-docs`
  in Coralogix to find out what Pirsch answers the deployed docs Worker.
