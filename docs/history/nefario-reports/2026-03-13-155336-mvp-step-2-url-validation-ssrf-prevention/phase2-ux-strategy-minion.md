# Domain Plan Contribution: ux-strategy-minion

## Recommendations

### 1. Return a result object, never throw

The module should return a plain result object for every call -- not throw on invalid input. This is the single most important API design choice for developer UX.

**Why:**

- Thrown errors require the caller to remember to wrap every call in try/catch. Forgetting a try/catch is silent and catastrophic -- an unhandled throw crashes the request handler. In a security-critical module, "forgetting to handle the error path" must not be possible.
- A result object forces the caller to destructure and inspect the outcome. The happy path and the rejection path are structurally identical -- you always get an object back, you always check a field. This is the "pit of success" pattern: the correct usage path is also the easiest path.
- The existing codebase already uses this pattern implicitly. `problemResponse()` returns a Response object; it does not throw. The validation module should follow the same control-flow style.

**Proposed shape:**

```js
// Success
{ ok: true, url: 'https://example.com/page', ip: '93.184.216.34' }

// Rejection
{ ok: false, status: 422, detail: "URL scheme 'ftp' is not allowed; use http or https" }
```

The `ok` boolean is the discriminant. Callers check one field. The resolved `ip` is only present on success -- this makes it structurally impossible to use an IP from a failed validation (you would have to reach into a rejection result and find nothing).

**Why `ok` and not `valid`:** `ok` matches the convention established by the Fetch API's `Response.ok` and is the de facto JS standard for success/failure discriminants. Fewer letters, universally understood.

### 2. Error messages should be dual-purpose, favoring the API consumer

The `detail` string in the rejection result should follow the same convention already established in `responses.js`:

> Name the specific resource. State what is wrong and what to do. Human-readable, not machine-parseable. Never leak internals.

This convention is already defined at the top of `responses.js`. It means the detail string can flow directly into `problemResponse(result.status, result.detail)` without transformation. The caller does zero message-formatting work.

**Specifically:**
- Detail strings should be useful to the developer who submitted the URL via the API. They are not system-internal debug messages.
- They should name the problem and, where possible, state what to fix: `"URL scheme 'ftp' is not allowed; use http or https"`, `"Host resolves to a private IP address"`, `"URL exceeds 2048 character limit"`.
- They must not leak internal state: no resolved IP addresses in rejection messages (that tells an attacker which IPs the system considers private), no DNS resolution details, no stack traces.
- The `status` field in the rejection result maps directly to the HTTP status code the caller should return: `400` for malformed URLs, `422` for URLs that parse but violate policy (private IP, embedded credentials, etc.). This eliminates a decision the caller would otherwise have to make.

### 3. Make the pit of success as wide as possible

Three design constraints work together to prevent callers from accidentally skipping validation:

**a) Single entry point, single return type.** One exported function: `validateUrl(urlString)`. It does everything -- parsing, normalization, scheme checking, credential checking, length checking, DNS resolution, IP range checking. The caller cannot call "step 2 without step 1." There is no `parseUrl()` + `checkScheme()` + `resolveDns()` pipeline to misuse.

**b) The resolved IP is only available through successful validation.** If the caller needs the IP for DNS pinning (and it does -- the MVP spec is explicit), the only way to get it is from `result.ip` after `result.ok === true`. This creates a structural dependency: you cannot pin DNS without having validated the URL. Skipping validation means you have no IP to pin.

**c) The result object maps directly to the existing error response pattern.** On rejection, the caller does:

```js
const result = await validateUrl(urlString);
if (!result.ok) return problemResponse(result.status, result.detail);
// use result.url and result.ip
```

That is the entire integration. Three lines. No error code lookup tables, no message formatting, no status code decisions. The validation module has already made all the choices. If the caller forgets the `if (!result.ok)` check and tries to use `result.ip`, they get `undefined` -- which will fail loudly downstream rather than silently proceeding with an invalid URL.

### 4. Include the normalized URL in the success result

The success result should include the normalized URL (`result.url`), not just the IP. The caller should use this normalized form for all downstream operations (metadata storage, logging, display). This prevents a class of bugs where the raw user input diverges from what was actually validated:

- User submits `HTTP://EXAMPLE.COM/page/../other`
- Module validates and normalizes to `https://example.com/other`
- Caller stores the normalized form

If the module only returns the IP, the caller has to carry the original URL string alongside the validated IP, creating an opportunity for the raw URL to leak into places where the validated form should be used.

### 5. Async by default

The function must be async (it performs DNS resolution). Make this explicit in the signature: `export async function validateUrl(urlString)`. The caller will always `await` it. This is the only reasonable shape given the DNS requirement -- no need for a sync-with-callback alternative.

---

## Proposed Tasks

### Task 1: Define and document the module's API contract

**What to do:** Before writing implementation code, define the exact function signature, return shapes (success and rejection), and the mapping from validation failure types to HTTP status codes and detail messages. Write this as a JSDoc block on the exported function.

**Deliverables:**
- Function signature: `export async function validateUrl(urlString) -> { ok, url, ip } | { ok, status, detail }`
- A table mapping each validation check to its rejection status and detail template (scheme check -> 400, credential check -> 422, private IP -> 422, length limit -> 400, DNS failure -> 422, etc.)
- JSDoc on the exported function covering both return shapes

**Dependencies:** Security-minion's validation ordering recommendation (the order of checks determines which rejection fires first when multiple apply). Edge-minion's DNS resolution strategy (determines whether the function is async, which it almost certainly is).

### Task 2: Validate the integration seam with the capture handler pattern

**What to do:** Write a three-line usage example showing how the capture handler (Step 3) will call `validateUrl()` and branch on the result. Verify that the result object's `status` and `detail` fields plug directly into `problemResponse()` with no transformation. Verify that the `url` and `ip` fields provide everything the Browser Rendering call needs.

**Deliverables:** A usage example in the module's JSDoc or as a code comment, demonstrating the happy path and the rejection path. This is documentation-as-design-verification -- if the example requires more than 5 lines to express both paths, the API is too complex.

**Dependencies:** Task 1.

---

## Risks and Concerns

### Risk 1: Error message content leaking security-sensitive information

**Severity:** High. **Likelihood:** Medium.

The detail messages will flow directly into API responses. If a rejection message says `"Host 10.0.0.5 is in a private IP range"`, an attacker learns that the system resolved their crafted hostname to 10.0.0.5 -- confirming the internal network topology. Detail messages must describe the *category* of the failure (`"Host resolves to a private IP address"`) without revealing the specific resolved IP. This constraint should be documented in the module's JSDoc and tested: no test assertion should expect a specific IP in any rejection message.

### Risk 2: Callers ignoring the result object

**Severity:** High. **Likelihood:** Low (design mitigates this, but not impossible).

Even with a result object, a caller could write `await validateUrl(url)` without capturing the return value and then proceed to use the raw URL. In plain JavaScript there is no compiler to catch this. The structural mitigation (the resolved IP is only available via the result) makes this self-correcting for the DNS pinning use case -- the caller literally cannot proceed without the result. But for a hypothetical future caller who does not need the IP, this risk exists. It is acceptable for MVP because there is exactly one caller (the capture handler), and it needs the IP.

### Risk 3: Status code ambiguity between "bad input" and "policy violation"

**Severity:** Low. **Likelihood:** Medium.

The module needs to distinguish between URLs that are malformed (cannot be parsed at all -- HTTP 400) and URLs that are syntactically valid but violate security policy (private IP, embedded credentials -- HTTP 422). If all rejections return the same status code, the API consumer cannot distinguish "you gave me garbage" from "you gave me a real URL but it is not allowed." The proposed two-status approach (400 for parse failures, 422 for policy violations) aligns with the existing RFC 9457 pattern in `responses.js` and gives API consumers actionable information without leaking internals.

### Risk 4: Expanding the return type over time

**Severity:** Low. **Likelihood:** Medium.

Future steps may want additional data from validation (e.g., the redirect chain for logging, the final URL after redirects). The result object is trivially extensible -- add fields. But each addition increases the cognitive load on callers who must understand what is available. For MVP, keep the success result to three fields (`ok`, `url`, `ip`) and resist adding more until a concrete caller needs them.

---

## Additional Agents Needed

None. The current team (security-minion for threat model, test-minion for test architecture, edge-minion for runtime constraints, software-docs-minion for documentation standards) covers all the expertise needed. The API shape question I am answering is the only developer-UX concern for this internal module, and it does not require additional specialist input beyond what is already planned.
