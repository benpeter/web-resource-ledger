# Domain Plan Contribution: security-minion

## Recommendations

### Executive Summary

The autoconsent integration is architecturally sound from a security perspective.
The critical distinction -- and the reason this integration is safer than general
capture parameterization -- is that **the server chooses what code to run, not the
caller**. The API caller submits a URL and receives back two screenshots; they
have no control over the consent dismissal logic, the library version, or the
execution parameters. This satisfies the spirit of all 12 Phase 0017 constraints.

However, the integration introduces a new class of risk that does not exist today:
**server-controlled code executing inside a page controlled by an attacker**. The
current `page.evaluate()` calls are trivial one-liners (`document.readyState`,
`document.body.scrollHeight`). Autoconsent runs a 168KB library that interacts with
the DOM, clicks elements, evaluates page-context JavaScript via eval snippets, and
mutates CSS. A malicious target page can craft its DOM to influence autoconsent's
behavior in ways that the existing one-liner evaluations are immune to.

The integration is **approvable with specific safeguards** enumerated below.

### Constraint-by-Constraint Validation

#### Constraint #1: No caller-supplied JavaScript execution

**Status: SATISFIED**

The proposed integration uses `page.evaluate()` to inject the autoconsent library
bundle -- a server-bundled, version-pinned artifact. The API caller has zero control
over what JavaScript runs. This is fundamentally different from parameterization
scenarios where the caller supplies `waitForFunction` expressions.

The distinction matters: constraint #1 prohibits **caller-supplied** JS, not all
`page.evaluate()`. The existing codebase already uses `page.evaluate()` three times
(lines 372, 385, 420 of `capture.js`). Autoconsent adds more evaluate calls, but
they are all server-controlled.

**Caveat**: Autoconsent's eval snippets (`EVAL_CONSENTMANAGER_1`, `EVAL_COOKIEBOT_1`,
etc.) execute in the page's main world context. These are hardcoded in the library
and not caller-influenced, but they interact with page-provided globals
(`window.__cmp`, `window.Cookiebot`, `window.OnetrustActiveGroups`, etc.). See
"New Attack Surfaces" below for implications.

#### Constraint #2: No caller-supplied CSS injection

**Status: SATISFIED**

Autoconsent does inject CSS via `hideElements()` / `prehideElements()` using
`getStyleElement()` to create `<style>` tags. However, the CSS selectors come from
the server-bundled ruleset, not from the API caller. The caller cannot influence
which selectors are used or what CSS is injected.

The CSS mutations (hiding consent banners) will affect the "after" screenshot.
This is the intended behavior and is transparently recorded in `captureSettings`.

#### Constraint #3-8: Cookie/viewport/wait constraints

**Status: SATISFIED (not applicable)**

The proposed integration adds no caller-controllable parameters. The viewport
remains 1280x720. Cookies remain uninjected. Wait conditions are server-controlled
(autoconsent decides when to take the second screenshot based on its own internal
state machine, not caller input).

#### Constraint #9: Parameterization flag in capture metadata and WACZ manifest

**Status: REQUIRES IMPLEMENTATION**

The issue specifies that `captureSettings` in `datapackage.json` must record:
consent library used, consent action attempted, and success/failure status. This
is the right approach. The metadata must be specific enough that a verifier can
reconstruct what happened:

Required fields in `captureSettings`:
- `consentLibrary`: `"@duckduckgo/autoconsent"` (string, not version -- see #4 below)
- `consentLibraryVersion`: `"14.59.0"` (or whatever is pinned)
- `consentAction`: `"optOut"` (what was attempted)
- `consentResult`: `"success"` | `"failure"` | `"noCmpDetected"` (what happened)
- `cmpDetected`: `"cookiebot"` | `null` (which CMP was found, if any)
- `screenshotBefore`: `true` (confirms pre-dismissal screenshot exists)
- `screenshotAfter`: `true` (confirms post-dismissal screenshot exists)

This metadata is covered by the Ed25519 signature (it's part of `datapackage.json`
which feeds into `bundleHash`), making it tamper-evident.

#### Constraint #10: Strict input validation

**Status: SATISFIED (no new inputs)**

The integration adds no new API parameters. The request body remains `{ url }`.
Dual screenshots happen automatically on every capture.

#### Constraint #11: `serviceWorkers: 'block'` remains hardcoded

**Status: REQUIRES VERIFICATION (see detailed analysis below)**

Autoconsent does not register service workers. Its CMP detection and dismissal
operates entirely through DOM manipulation, CSS injection, and page-context JS
evaluation. None of these mechanisms require or interact with service workers.

However, some CMPs (e.g., OneTrust, Cookiebot) may use service workers for
consent state persistence. Blocking service workers means autoconsent's opt-out
may not persist in the way the CMP expects. This is **not a security concern**
(the block is defense-in-depth for route interception), but it could cause
behavioral differences:

- A CMP might re-show its banner after opt-out because the consent state was not
  persisted via the service worker it expected to use
- This would affect the "after" screenshot quality, not security

**Recommendation**: No change to the constraint. Document in implementation notes
that service worker blocking may cause some CMPs to behave unexpectedly.

#### Constraint #12: Cross-domain navigation blocking remains hardcoded

**Status: REQUIRES VERIFICATION (see detailed analysis below)**

Autoconsent's opt-out flow sometimes causes cross-origin navigations:

1. **Iframe-based consent flows**: Some CMPs (TrustArc, Didomi) open consent
   management in a cross-origin iframe. Autoconsent's `runContext.frame = true`
   rules operate inside these iframes. Cross-origin iframes are *not* blocked by
   the current route interceptor (it blocks top-level cross-origin navigation
   only, per the documented "accepted gap" in `capture.js` line 52-54).

2. **Redirect-based consent flows**: Some CMPs redirect to a consent preferences
   page on a different domain (e.g., `consent.cmp-provider.com`). The current
   route interceptor blocks these as top-level cross-origin navigations. This
   means autoconsent's multi-page consent flows will fail silently.

3. **`intermediate: true` rules**: Autoconsent supports multi-page consent flows
   where the user is redirected between pages. These will be blocked by
   constraint #12. This is the correct behavior -- WRL should not follow
   cross-domain redirects even to dismiss consent.

**Recommendation**: No change to the constraint. Autoconsent should be configured
to **not** attempt multi-page flows. If a CMP requires cross-domain navigation,
the dismissal simply fails and the capture completes with a single screenshot
plus metadata indicating `consentResult: "failure"`. This is the correct
degradation path.

### New Attack Surfaces

#### MEDIUM: Target page influencing autoconsent behavior via crafted DOM

**This is the primary new risk.**

Autoconsent detects CMPs by probing the DOM for specific selectors and JavaScript
globals. A malicious target page can craft elements that autoconsent interprets as
a CMP, causing it to:

1. **Click attacker-controlled elements**: Autoconsent's `click` action clicks
   elements matching CSS selectors from its ruleset. A malicious page could create
   a `<button id="reject-all">` that actually triggers an action beneficial to the
   attacker (e.g., form submission, download initiation). However:
   - Clicks occur in the headless browser context with no file system access
   - No credentials are injected (constraint #3-8)
   - Cross-domain navigation is blocked (constraint #12)
   - The browser is sandboxed by Cloudflare's gVisor
   - **Impact: LOW** -- the attacker controls their own page, so they could
     already auto-execute any action a click would trigger

2. **Feed poisoned values to eval snippets**: Autoconsent's eval snippets access
   `window.__cmp`, `window.Cookiebot`, `window.OnetrustActiveGroups`, etc. A
   malicious page can define these globals with crafted values. The snippets
   evaluate in page context, so they execute whatever code the page has placed
   behind these APIs. However:
   - The eval snippets only *read* state (check consent status) or call CMP APIs
     that the page itself provides
   - The results flow back to autoconsent's decision engine, not to WRL's capture
     pipeline
   - A malicious return value could trick autoconsent into thinking opt-out
     succeeded when it did not -- but this only affects the `consentResult`
     metadata field, not evidence integrity (both screenshots are always taken)
   - **Impact: LOW** -- the page already controls its own CMP globals

3. **Trigger autoconsent to modify the DOM before the "before" screenshot**: If
   autoconsent's `prehideSelectors` CSS is applied before the first screenshot is
   taken, the "before" screenshot will already have the banner hidden. This defeats
   the purpose of dual screenshots.
   - **Impact: MEDIUM** -- evidence quality degradation, not a security breach
   - **Mitigation**: The implementation must take the "before" screenshot BEFORE
     injecting autoconsent's content script. The issue description implies this
     sequence ("one with the cookie banner visible (first-visit state) and one
     after server-controlled dismissal"), but it must be enforced in code.

**Recommendation**: The sequence must be strictly enforced:
1. Navigate to URL
2. Wait for page load (existing `networkidle`)
3. Take "before" screenshot (existing screenshot logic)
4. Inject autoconsent and run opt-out
5. Wait for autoconsent to complete (with timeout)
6. Take "after" screenshot
7. Record results in `captureSettings`

#### LOW: Autoconsent's `page.evaluate()` of eval snippets as code execution surface

The autoconsent Playwright test runner (in `playwright/runner.ts` lines 136-139)
shows the eval message handling pattern:

```javascript
case 'eval': {
    const result = await frame.evaluate(msg.code);
    await frame.evaluate(`autoconsentReceiveMessage({ id: "${msg.id}", type: "evalResp", result: ${JSON.stringify(result)} })`);
    break;
}
```

This evaluates `msg.code` -- which comes from the eval snippets -- in the page
context via `frame.evaluate()`. The snippets are hardcoded strings in the library
bundle (not caller-supplied), but they contain code like:

```javascript
() => window.__cmp && typeof __cmp('getCMPData') === 'object'
() => __cmp('setConsent', 0)
() => window.Cookiebot.withdraw() || true
```

These call into page-provided APIs. A malicious page could define `window.__cmp`
or `window.Cookiebot` as Proxy objects that perform side effects when accessed.
However, the side effects are limited to the page's own context (not WRL's worker
context), and the browser is sandboxed.

**Risk**: A malicious page could cause autoconsent's eval snippets to trigger
arbitrary side effects on the page itself. Since the page controls its own
execution environment anyway, this is not a meaningful escalation. The eval
snippets do not exfiltrate data to WRL or influence WRL's behavior beyond the
`consentResult` metadata field.

**Impact: LOW**. No remediation required beyond documenting that eval snippets
interact with page-provided globals.

#### LOW: Timing side channel via consent detection duration

The time autoconsent takes to detect and dismiss a CMP varies by CMP type and
page complexity. This timing difference is observable in the capture duration
metadata. An attacker could potentially fingerprint which CMP rules matched by
observing capture duration patterns. This leaks minimal information (the CMP
name is already recorded in `captureSettings`).

**Impact: INFORMATIONAL**. No remediation required.

### Question #3: MPL-2.0 bundling within Apache-2.0 Worker

**MPL-2.0 is compatible with Apache-2.0 for bundling.**

MPL-2.0 is a "file-level copyleft" license. The obligations are:

1. **Source availability**: Modified MPL-2.0 files must have their source made
   available. If WRL bundles autoconsent without modification (which it should),
   no source disclosure obligation is triggered beyond what DuckDuckGo already
   publishes.

2. **Larger work**: MPL-2.0 Section 3.3 explicitly permits combining MPL-2.0
   code with code under different licenses (including Apache-2.0) in a "Larger
   Work." The Apache-2.0 licensed WRL worker code is not "infected" by the
   MPL-2.0 autoconsent dependency.

3. **Notice requirements**: The MPL-2.0 license text must be included in the
   distribution. For a Cloudflare Worker (server-side), there is no
   "distribution" in the traditional sense -- the bundled code runs server-side
   and is never delivered to end users. However, if WRL ever distributes its
   source (it's on GitHub), the `LICENSE` file from autoconsent should be
   preserved in `node_modules` (npm handles this automatically).

**Recommendation**: No action required for server-side bundling. If the WRL
source repository is public, include autoconsent's MPL-2.0 notice in a
`THIRD-PARTY-NOTICES` file or equivalent (good practice, not strictly required
for server-side-only deployment).

### Question #4: Library version hash in captureSettings

**Yes, include the library version. A content hash is better than a version string.**

The `captureSettings` should record:
- `consentLibraryVersion`: The npm package version (e.g., `"14.59.0"`)
- `consentLibraryHash`: SHA-256 of the bundled autoconsent JS file

The version string is for human readability. The hash is for reproducibility --
it proves exactly which code ran, even if the npm registry is compromised or a
version is republished. The hash should be computed at build time and embedded
as a constant, not computed at runtime (runtime hashing of the bundle adds
latency and complexity).

**Implementation detail**: Generate the hash during `npm run build` or equivalent,
write it to a constants file (e.g., `src/autoconsent-meta.js`), and import it in
`capture.js`. This keeps the runtime path simple.

### Question #5: Library executing alongside target page scripts

**This is the core architectural question and the answer depends on the injection
method.**

There are two integration models, with fundamentally different security properties:

**Model A: Content script in isolated world (lower risk)**

The autoconsent library runs in an isolated JavaScript context (like a browser
extension's content script). It can access the DOM but cannot access page-defined
globals (`window.__cmp`, etc.) directly. Eval snippets that need page globals must
be explicitly bridged via `page.evaluate()`.

In Playwright, this is achieved via `page.addInitScript()` which runs in the main
world, or via `page.evaluate()` which also runs in the main world. Playwright does
**not** natively support Chrome extension-style isolated worlds. However, autoconsent
is designed to run in a content script's isolated world.

For the Playwright integration, the test runner uses `page.evaluate(contentScript)`
to inject the entire library into the page's main world. This means the library
code and the page's code share the same JavaScript context.

**Model B: Main world injection via `page.evaluate()` (the likely approach)**

Based on the Playwright test runner pattern (`runner.ts` line 123:
`await pageOrFrame.evaluate(contentScript)`), the integration will inject the entire
autoconsent bundle into the page's main world via `page.evaluate()`.

This means:
- Autoconsent's code runs in the same JS context as the target page's scripts
- The target page's scripts can observe, intercept, or interfere with autoconsent's
  operations (prototype pollution, Proxy objects on `document.querySelector`, etc.)
- Autoconsent can access page globals directly (which some rules require)

**Security implications of Model B**:

1. **Prototype pollution from target page**: A malicious page could modify
   `Element.prototype.click`, `Document.prototype.querySelector`, etc. before
   autoconsent runs. This could cause autoconsent to click wrong elements or
   miss CMP detection. However:
   - The page already controls its own prototype chain
   - Autoconsent failure is the expected degradation (single screenshot + failure metadata)
   - No WRL secrets or internal state is exposed to the page context

2. **Autoconsent globals leaking to page**: The injected autoconsent code defines
   functions and objects in the page's global scope (e.g., `window.autoconsentSendMessage`,
   `window.autoconsentReceiveMessage`). A malicious page could:
   - Override `autoconsentReceiveMessage` to intercept autoconsent's message flow
   - Call `autoconsentSendMessage` to forge messages back to the Playwright runner
   - This could cause WRL to record incorrect `consentResult` metadata
   - **Impact: LOW** -- affects metadata accuracy, not evidence integrity (both
     screenshots are still taken and signed)

3. **`page.exposeBinding()` as a bridge**: The issue mentions `page.exposeBinding()`.
   This creates a binding that the page can call. If autoconsent uses
   `exposeBinding('autoconsentSendMessage', ...)`, the target page's scripts can
   also call this binding. The binding callback runs in Node.js/Worker context
   (outside the page). If the callback handler processes messages without
   validation, a malicious page could inject crafted messages.
   - **Impact: MEDIUM** -- depends entirely on what the message handler does
   - **Mitigation**: The message handler must validate message types against an
     allowlist and reject unexpected message shapes. It must never execute
     arbitrary code or access sensitive resources based on page-originated messages.

**Recommendation**: Use `page.exposeBinding()` + `page.evaluate()` as shown in
the test runner. Implement a strict message handler that:
- Validates `msg.type` against `['init', 'cmpDetected', 'popupFound', 'optOutResult',
  'autoconsentDone', 'autoconsentError', 'eval', 'selfTestResult']`
- For `eval` messages: executes ONLY the hardcoded snippet identified by `msg.snippetId`,
  never arbitrary `msg.code`. This is the critical guard -- the test runner evaluates
  `msg.code` directly, but WRL must look up the snippet by ID from the bundled
  snippet map and evaluate that instead.
- Ignores unknown message types
- Rate-limits messages (a malicious page could spam the binding)

### Question #7: Does `page.evaluate()` with autoconsent open new attack surface?

**Yes, but the incremental risk is low.**

Current `page.evaluate()` usage in `capture.js`:
- `() => document.readyState` -- reads a single DOM property, no interaction
- `() => document.body.scrollHeight` -- reads a single DOM property, no interaction

Autoconsent's `page.evaluate()` usage:
- Injects the entire 168KB library bundle into the page context
- The library then clicks elements, modifies CSS, reads cookies, accesses page globals
- Eval snippets call into CMP-provided APIs (`__cmp('setConsent', 0)`, `Cookiebot.withdraw()`)

The qualitative difference is significant: from "read two DOM properties" to
"run a complex library that interacts with page-provided APIs." However, the
threat model shows the incremental risk is bounded:

| Capability | Before | After | Risk Delta |
|---|---|---|---|
| Read DOM properties | Yes (2 calls) | Yes (many calls) | None -- page controls its own DOM |
| Click page elements | No | Yes | LOW -- page controls what happens on click |
| Modify page CSS | No | Yes | LOW -- only affects "after" screenshot, transparently recorded |
| Call page JS globals | No | Yes (eval snippets) | LOW -- page controls its own globals |
| Expose Worker-side binding | No | Yes (`exposeBinding`) | MEDIUM -- requires strict message validation |

The MEDIUM risk item (`exposeBinding`) is the only one that creates a channel
from the page back to WRL's execution context. All other interactions are
contained within the page's sandbox.

---

## Proposed Tasks

1. **Enforce screenshot-before-injection sequencing** -- The "before" screenshot
   MUST be taken before any autoconsent code is injected or CSS is applied. This
   is the single most important implementation detail for evidence integrity.
   Violation means the "before" screenshot is already corrupted by prehide CSS.

2. **Implement strict `exposeBinding` message handler** -- The handler for
   `autoconsentSendMessage` must validate message type against an allowlist,
   reject unexpected fields, and for `eval` messages must resolve snippet code
   from the bundled snippet map by `snippetId` rather than evaluating raw
   `msg.code`. This closes the one channel from the page to WRL's context.

3. **Pin autoconsent version with integrity hash** -- Use `npm:@duckduckgo/autoconsent@14.59.0`
   (or current) with an integrity field in `package-lock.json`. Compute SHA-256
   of the bundled JS at build time and embed as a constant for `captureSettings`.

4. **Add `captureSettings` to `datapackage.json` schema** -- Fields:
   `consentLibrary`, `consentLibraryVersion`, `consentLibraryHash`,
   `consentAction`, `consentResult`, `cmpDetected`, `screenshotBefore`,
   `screenshotAfter`. All covered by the Ed25519 signature.

5. **Configure autoconsent to disable multi-page flows** -- Filter out rules
   with `intermediate: true` to prevent cross-domain navigation attempts that
   will be blocked by constraint #12 anyway. Cleaner than letting them fail.

6. **Disable cosmetic-only rules** -- Set `enableCosmeticRules: false` in the
   autoconsent config. Cosmetic rules only hide banners with CSS without actually
   dismissing consent. For WRL's evidence use case, a hidden-but-not-dismissed
   banner is worse than a visible banner (it creates a misleading "after"
   screenshot without actually changing consent state).

7. **Cap autoconsent execution timeout** -- Autoconsent should have a hard timeout
   (e.g., 3000ms) independent of the page navigation timeout. If autoconsent
   hasn't completed within this window, take the "after" screenshot anyway and
   record `consentResult: "timeout"`. This preserves the 30s `ctx.waitUntil`
   budget.

8. **Do not include the `extra` bundle (filterlist rules)** -- The issue already
   scopes this out. Confirming: the `extra` bundle adds ~400KB of filterlist
   rules from EasyList Cookie, introduces the `@ghostery/adblocker` dependency
   chain, and performs DOM mutations via CSS that could interact unpredictably
   with the target page. Stick with the base bundle.

---

## Risks and Concerns

### MEDIUM: `exposeBinding` as a page-to-Worker channel

The `page.exposeBinding('autoconsentSendMessage', callback)` pattern creates a
JavaScript function in the page context that, when called, invokes a callback
in the Worker/Node.js context. The target page's scripts can call this function
with arbitrary arguments. If the callback handler is not strict about validation,
this is a confused deputy attack: the page tricks WRL into performing actions
(recording incorrect metadata, evaluating unexpected code) via the exposed binding.

**Likelihood**: 3/5 (any page can call the binding; exploitation requires crafting
messages that the handler acts on unsafely)

**Impact**: 2/5 (metadata corruption; no access to WRL secrets, signing keys, or
KV/R2 storage from the page context)

**Risk score**: 6/25

**Mitigation**: Strict allowlist validation on message type and shape. Never pass
`msg.code` to `page.evaluate()` -- resolve from bundled snippet map only.

### MEDIUM: Prehide CSS applied before "before" screenshot

If the implementation applies autoconsent's `prehideSelectors` CSS before taking
the first screenshot, the "before" screenshot will already have the consent banner
hidden via `opacity: 0` and `z-index: -1`. This defeats the dual-screenshot
evidence model.

**Likelihood**: 3/5 (easy to get the sequencing wrong; autoconsent's default
behavior is to prehide "as early as possible")

**Impact**: 3/5 (evidence quality degradation; the "before" screenshot no longer
proves the banner was visible)

**Risk score**: 9/25

**Mitigation**: Disable `enablePrehide` in autoconsent config. Take the "before"
screenshot before injecting autoconsent entirely. Only inject autoconsent after
the "before" screenshot is captured.

### LOW: Autoconsent dependency supply chain risk

Autoconsent has three runtime dependencies: `@ghostery/adblocker`,
`@ghostery/adblocker-content`, and `tldts-experimental`. The base bundle
(non-`extra`) may not include the adblocker dependencies, but they are in the
`package.json` `dependencies` field and will be installed.

**Mitigation**: Verify which dependencies are actually bundled into
`autoconsent.esm.js`. If the adblocker dependencies are tree-shaken out of the
base bundle, the supply chain surface is just autoconsent itself plus
`tldts-experimental`. Pin all transitive dependencies via `package-lock.json`.

### LOW: Autoconsent rule updates changing behavior between captures

Autoconsent rules are bundled at build time. However, if WRL's CI/CD runs
`npm update` or uses floating version ranges, a new autoconsent release could
change which CMPs are detected and how they are dismissed. Two captures of the
same page taken a week apart could produce different "after" screenshots solely
due to rule changes.

**Mitigation**: Pin the exact version. Include the version and content hash in
`captureSettings` so that captures are self-documenting about which rules were
active.

### INFORMATIONAL: Autoconsent's eval snippets have `@ts-nocheck`

The `eval-snippets.ts` file starts with `// @ts-nocheck`, disabling TypeScript
checking for all snippet functions. Many snippets access globals without null
checks, parse cookies with naive string splitting, and call CMP APIs without
error handling. If a page provides adversarial values for these globals, the
snippets could throw unhandled exceptions. Autoconsent's eval handler has a
1000ms timeout (`new Deferred(id, timeout = 1000)`) that will reject on
exception, so this degrades to a failed CMP detection -- not a crash.

---

## Additional Agents Needed

1. **implementation-minion (margo)** -- The screenshot sequencing (before/after)
   is the most implementation-sensitive aspect. The exact point at which
   autoconsent is injected relative to the first screenshot must be reviewed
   in the implementation PR. Get this wrong and the evidence model is broken
   without any visible error.

2. **test-minion** -- Security tests needed:
   - Verify "before" screenshot is taken before autoconsent injection
   - Verify `exposeBinding` handler rejects malformed messages
   - Verify `exposeBinding` handler does not evaluate raw `msg.code`
   - Verify `captureSettings` is present in signed `datapackage.json`
   - Verify cross-domain navigation is still blocked during autoconsent execution
   - Verify `serviceWorkers: 'block'` is preserved during autoconsent execution
   - Verify autoconsent timeout does not exceed the overall capture budget

3. **api-design-minion** -- The `captureSettings` schema needs review for
   consistency with the existing WACZ `datapackage.json` schema and the
   verification endpoint response shape. The schema should be defined once
   (JSON Schema or equivalent) and referenced by both the WACZ builder and the
   verification endpoint.
