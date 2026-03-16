## Security Review: TSA Error Logging (#72)

**Verdict: APPROVE**

### Scope

Reviewed: `src/log.js` (INVARIANT), `src/rfc3161.js` (all error throw sites),
`src/wacz.js` (catch block), `phase3-synthesis.md` (proposed changes).

### Findings

#### Attacker-controlled content in errorMessage -- CLEAR

Every `throw new Error(...)` in `rfc3161.js` interpolates only:
- Static string literals
- Integer values (`resp.status`, `arrayBuf.byteLength`, DER offsets, lengths,
  tag bytes rendered as hex)

No TSA response body string content is ever interpolated into an error message.
The DER parser decodes binary bytes as integers and formats them with
`.toString(16)` or arithmetic -- it never reflects attacker-supplied UTF-8
strings into error text. The log.js INVARIANT is honored.

#### TSA URL exposure -- CLEAR

`env.TSA_URL` is the Sectigo public TSA endpoint (operator config, not a
credential). Logging it is appropriate and operationally useful.

#### Credential leakage -- CLEAR

The log payload `{ event, tsaUrl, errorName, errorMessage }` contains no
credentials. `CORALOGIX_SEND_KEY` is consumed only inside `log.js` as an
`Authorization` header and never appears in the `data` object.

#### Log injection -- CLEAR

`data` is serialized by `JSON.stringify` inside `log.js`. Any control
characters or newlines in `errorMessage` are JSON-escaped before transmission.

#### 256-char truncation -- SUFFICIENT

All error messages in `rfc3161.js` are short static strings (longest plausible
instance is under 100 chars). The 256-char cap is consistent with the
`capture.js:119` pattern and is appropriate.

### Recommendations

None required. The synthesis plan is correct that `classifyTsaError()` is
unnecessary -- the existing error surface is already safe. Approve as written.
