# UX Strategy Review: MVP Step 4 -- WACZ Bundling and Signing

**Verdict: ADVISE**

This is a backend infrastructure change. The operator-facing surface is narrow:
(1) the key generation script and its stdout output, (2) the README key setup
section, and (3) the KV metadata schema that downstream consumers read. All three
are well-considered. One advisory worth flagging.

---

- [ux-strategy]: The key generation script outputs both private and public keys to
  stdout, but only the private key is actionable for the operator. The public key
  line has no next step attached to it, which creates a cognitive gap -- the operator
  reads it, doesn't know what to do with it, and must hold it in working memory
  while parsing the rest of the output.
  SCOPE: `scripts/generate-signing-key.js` stdout format
  CHANGE: Either append a one-line annotation to the public key ("keep for
  verification -- embedded in every signed WACZ automatically") or move it below
  the actionable instructions. The private key block and its `wrangler secret put`
  command should be contiguous and terminate the output -- the last thing the
  operator reads is the action they need to take.
  WHY: Krug's law: the operator is in a setup flow, not a reading flow. The output
  as specified puts the public key between the private key and its instruction,
  interrupting the action sequence. Information the operator cannot act on
  immediately increases extraneous cognitive load in a sensitive credential-handling
  moment.
  TASK: Task 1 (Part B -- key generation script stdout format)

---

No other concerns within this domain. The graceful degradation design (KV
`wacz.status` absent rather than a failed field) is clean -- absence is a valid
and legible signal for downstream consumers without adding a spurious state.
The README task prompt correctly scopes the documentation to operator audience and
avoids WACZ format internals, which is the right call. APPROVE on all other
touchpoints.
