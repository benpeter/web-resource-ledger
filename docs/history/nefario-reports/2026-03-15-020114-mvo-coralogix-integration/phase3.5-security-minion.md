# Security Minion Review: mvo-coralogix-integration

**Verdict: ADVISE**

The plan incorporates every constraint I contributed in the earlier specialist
round. The conflict resolutions are correct from a security standpoint. Three
issues remain that are not blocking but carry real risk if left unaddressed
in the implementation task prompts.

---

## ADVISE 1: `result.detail` from the scheme rejection leaks attacker-supplied protocol

**SCOPE**: Task 5, Event 4 (SSRF block), `src/index.js`

**CHANGE**: The Task 5 prompt says `result.detail` from `validateUrl()` is
safe, noting "the scheme is not sensitive -- it is from a small fixed set."
This is partially wrong. The scheme rejection message in `url-validation.js`
line 341-344 is:

```js
`URL scheme '${parsed.protocol}' is not allowed; use http or https`
```

`parsed.protocol` is set by the WHATWG URL constructor from attacker-supplied
input. While the parser normalises many inputs, it does not restrict the
protocol string to a bounded set -- an attacker can supply an arbitrarily long
or syntactically crafted scheme value and see it reflected in the
`security.ssrf_block` log. This is low-severity information disclosure but it
means the log field is not fully safe to treat as a static string.

**WHY**: The claim in the plan ("from a small fixed set") is incorrect. The
WHATWG URL spec normalises to lowercase and appends ":" but does not restrict
length or character set beyond what makes a valid URL. Unusual values would
appear in Coralogix logs and could be used to exfiltrate short strings through
log channels (log injection / covert channel).

**TASK**: In the Task 5 prompt under Event 4, replace:

> Log the `result.detail` from `validateUrl()` as the reason -- this is safe
> because `validateUrl()` returns static rejection messages (never includes the
> actual URL, hostname, or resolved IP). The detail strings are enumerated in
> `url-validation.js` and all are predetermined strings like "Host resolves to
> a private IP address".
>
> One exception: the scheme rejection includes `parsed.protocol` in the message...

With:

> Log `result.detail` except when it may contain attacker-supplied input. Safe
> `detail` strings (static text, no caller data) are: "Host resolves to a
> private IP address", "URLs with embedded credentials are not allowed", "URL
> is not valid", "URL exceeds 2048 character limit", "Could not resolve
> hostname", "URL contains double-encoded characters". For the scheme rejection
> case, log a static string instead: use `reason: 'url_scheme_not_allowed'`
> rather than the raw `result.detail`.
>
> Concretely: if `result.status === 400 && result.detail.includes('scheme')`,
> log `{ event: 'security.ssrf_block', reason: 'url_scheme_not_allowed' }`.
> For all other SSRF rejections, `result.detail` is safe to log verbatim.

---

## ADVISE 2: `JSON.stringify()` can throw on circular references -- `log()` is not infallible

**SCOPE**: Task 1, `src/log.js` implementation spec

**CHANGE**: The plan documents this risk ("JSON.stringify() can throw on
circular references") and rates it LOW after mitigation, citing that "all data
objects are plain literals." That is correct for the instrumentation in this
phase. However, the `log()` function spec as written does not guard against it,
and the contract says `log()` is "infallible." If a future caller passes a
data object with a circular reference or a non-serializable value (e.g., a
`BigInt`), the throw escapes the `.catch(() => {})` because it occurs before
`fetch()` is called -- `.catch()` only catches Promise rejections, not
synchronous throws.

**WHY**: A synchronous throw from `JSON.stringify()` inside a capture pipeline
try-block would propagate to the catch-all and mark a successful capture as
failed. The plan acknowledges this but does not add the guard.

**TASK**: Add the following to the Task 1 implementation spec:

> Wrap `JSON.stringify(data)` in a try/catch and return undefined on error:
>
> ```js
> let body;
> try {
>   body = JSON.stringify([{ applicationName: 'wrl', subsystemName: subsystem,
>     severity, timestamp: Date.now(), text: JSON.stringify(data) }]);
> } catch {
>   return;
> }
> return fetch(env.CORALOGIX_ENDPOINT, { ... body ... }).catch(() => {});
> ```
>
> This keeps the function under 30 lines and makes the infallibility guarantee
> unconditional rather than dependent on caller discipline.

Also update Task 2 test case 5 to include a test for a circular-reference data
object (e.g., `const d = {}; d.self = d; log(mockEnv, 3, 'test', d)`) and
assert it resolves rather than throws.

---

## ADVISE 3: `CORALOGIX_SEND_KEY` exfiltration via log injection into `text` field

**SCOPE**: Task 1, `src/log.js`; informational for the operator

**CHANGE**: The log payload structure places `data` content into `text` as a
JSON string: `text: JSON.stringify(data)`. Coralogix auto-parses JSON in the
`text` field. If a future caller (or a future phase that relaxes field
constraints) passes attacker-influenced content into `data`, Coralogix may
interpret embedded JSON keys as log metadata. This is not a risk in the
current phase since all data fields are literals from the instrumentation spec.
However the `log()` function accepts an arbitrary `data` object with no
validation, and the plan explicitly says "do not validate the `data` parameter
-- callers are responsible."

**WHY**: This is a latent risk, not an active one. The current callers are all
controlled. The concern is that `log()` will be reused in future phases and
the "no validation" policy may be carried forward by callers who do not read
the security constraints as carefully.

**TASK**: Add a comment to the `log()` function JSDoc (not a code change):

> `@param {object} data Structured payload. Must contain only static values --
> never include user-supplied strings, URL components, request headers, or any
> content derived from attacker-controlled input. Callers are responsible for
> this constraint. log() does not validate or sanitize data fields.`

This makes the invariant explicit at the call site for future maintainers.

---

## Items confirmed correct -- no action needed

- Skipping IP logging for MVP: correct. HMAC approach deferred cleanly.
- `result.detail` for non-scheme SSRF rejections: correct (static strings).
- `err.constructor.name` in catch-all only, not WACZ path: correct.
- No URL logging anywhere: correct.
- No API key, auth header, or IP in any log payload: confirmed by code review.
- `ctx.waitUntil(log(...) ?? Promise.resolve())` pattern: correct.
- Guard on both `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY`: correct.
- `CORALOGIX_SEND_KEY` as Worker secret only, not in `[vars]`: correct.
- 404 path not instrumented (no rate limiter, unbounded volume): correct.
- Coralogix Send Key IP allowlisting added to backlog: noted and correct.
