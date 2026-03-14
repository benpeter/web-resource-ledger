## UX Strategy Review: mvp-step-6-verification-endpoint

**Verdict: ADVISE**

---

- [ux-strategy-minion]: The `wacz` field in the verification response body carries signing metadata (`bundleHash`, `signature`, `publicKey`, `signedAt`), but the field name signals file data to an API consumer.
  SCOPE: `src/index.js` Task 2, Step 7 -- `body.wacz = result.capture || null`
  CHANGE: Rename the field to `signingMetadata` (or `signing`). The `capture` field already refers to the capture record; `wacz` as a sibling field implies file-level data (size, format, download URL), not cryptographic fields. A developer reading the response shape cold will form the wrong mental model before opening the docs.
  WHY: Recognition beats recall (Nielsen #6). Field names are the primary UX of an API -- a consumer should not need to read docs to understand that `body.wacz.publicKey` is the key that was used to sign, not metadata about the WACZ file. The confusion risk compounds because there is already a `wacz` object in the retrieval endpoint (`body.wacz`) which does contain file-level data (size, key, timestamp). Using the same field name for different shapes across two endpoints violates Nielsen #4 (consistency).
  TASK: Task 2 (handler), Task 4 (integration tests referencing `body.wacz`)

---

Everything else in the plan is sound from a UX strategy perspective:

- Journey coherence: the POST -> status -> capture -> verify chain is complete. The `verifyUrl` link in Task 2 and the integration tests covering it (tests 18/19) close the loop correctly.
- Response shape: three named checks with `pass/fail/skip` strings rather than booleans is the right call -- scannable, forward-compatible, maps to real user mental models ("did it pass or fail?").
- Scope: correctly excludes UI, docs, and observability. No feature creep.
- The conditional Cache-Control split (public/max-age for verified:true, no-store for verified:false) correctly models the user reality: a failed verification should never be cached because it might reflect a transient condition.
- The 404 for no-WACZ captures is the right call -- returning 200 with a degraded result for a structurally incomplete capture would create false expectations.
