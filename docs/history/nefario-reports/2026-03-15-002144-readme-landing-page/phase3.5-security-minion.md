## Security Review: README Restructure

**Verdict: ADVISE**

The plan is fundamentally sound. No blocking issues. Three specific items need to be addressed during execution.

---

### Advisory 1 -- Entropy guidance for CAPTURE_API_KEY (MEDIUM)

The plan mandates documenting `openssl rand -hex 32` as the key generation command. This produces 32 hex-encoded bytes, which is 256 bits of entropy encoded as a 64-character hex string. This is correct and sufficient.

**Required wording in the README**: The key generation instruction must use exactly this command:

```bash
openssl rand -hex 32
```

Do NOT use alternatives like `uuidgen` (only 122 bits), `date | md5`, or any variant that reduces entropy. The devx-minion prompt already specifies this command -- verify the output matches it exactly. If the generated README uses any other command, reject and fix before merging.

---

### Advisory 2 -- Capture ID security model needs a precise warning (LOW-MEDIUM)

The plan already includes this note:

> The capture ID is the only way to access a capture -- there is no list endpoint. Treat capture IDs like credentials.

This is the right instinct but the framing needs strengthening in one specific way. The capture ID (`cap_` + 32 hex chars = 128 bits) is effectively an unguessable bearer token for unauthenticated artifact retrieval -- the API enforces no auth on GET endpoints. The README must communicate:

1. Anyone with the capture ID can retrieve all artifacts (screenshot, HTML, headers, WACZ)
2. Sharing the verify URL (`/v1/verify/{id}`) is safe for public attestation -- that is the intended sharing mechanism
3. Sharing the raw capture ID gives full artifact access to the recipient

The current plan note covers point 1 implicitly. The devx-minion should be explicit that the verify URL (not the capture ID) is what you share publicly. This distinction matters for operators who use WRL for sensitive content.

**Suggested addition** to the note at the end of the Usage section:

> To share a capture publicly, use the verification URL -- it confirms authenticity without exposing raw artifacts. The capture ID itself grants access to all artifacts including rendered HTML and headers.

---

### Advisory 3 -- `.dev.vars` security note placement (LOW)

The plan correctly notes that `.dev.vars` is gitignored and that the key must never be committed. Verify the generated README puts this warning in both the CAPTURE_API_KEY section AND the SIGNING_KEY section (the existing README already has it for SIGNING_KEY). Do not rely on a single note covering both -- operators configure these keys separately, often at different times.

---

### No Issues Found

- `openssl rand -hex 32` is safe to copy-paste and produces adequate entropy
- `wrangler secret put CAPTURE_API_KEY` is the correct production pattern -- no secrets touch the filesystem
- Bearer token in curl examples uses `$WRL_API_KEY` (env var interpolation) -- not a hardcoded placeholder that could be mistaken for a real key
- The naming bridge (CAPTURE_API_KEY in setup, $WRL_API_KEY in examples) is documented in the plan -- this is the right approach
- No secrets appear in the example values or openapi.yaml responses
- Auth asymmetry (POST requires auth, GET endpoints do not) is architecturally intentional and documented in the spec -- the README's planned callout is accurate
