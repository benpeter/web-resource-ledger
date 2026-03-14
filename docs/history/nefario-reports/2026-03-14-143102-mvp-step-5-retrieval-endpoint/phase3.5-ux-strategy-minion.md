## UX Strategy Review: mvp-step-5-retrieval-endpoint

**Verdict: APPROVE**

No blocking concerns from the UX strategy domain.

All prior ux-strategy-minion recommendations were adopted or resolved with
sound rationale:

- Named artifact URL strings (flat shape) -- adopted
- `status: const "complete"` -- adopted
- Single static 404 message for all non-200 cases -- adopted
- No `note` field in retrieval response -- adopted
- WACZ nested object with verification fields (bundleHash, size) -- adopted
- Worker-proxied URLs instead of direct R2 -- overridden by technical
  consensus on three security grounds; the rationale is sound and the
  tradeoff is correctly documented

The user-facing API delivers a clean mental model: POST to submit, poll
status, GET to retrieve when complete. The lifecycle is coherent and
minimises cognitive load for API callers -- the only state the caller
must track is the capture ID. Complexity is hidden at the right layer.

The schema's separation of concerns (status endpoint owns lifecycle,
retrieval endpoint owns completed captures) reduces the caller's decision
surface and avoids the double-tracking problem that would arise from a
single endpoint serving all states.

No new concerns to raise.
