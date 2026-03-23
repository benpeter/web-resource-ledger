# Security Assessment: Staged Fallback for Capture Timeout

## Summary

A degraded capture is defensible evidence -- but only if the degradation is
cryptographically bound to the signed bundle. The core security risk is not
the partial capture itself, but **misrepresentation**: a consumer treating
a 25-second snapshot of a still-loading page as if it were a complete render.
The mitigation is straightforward -- embed render quality metadata inside
`datapackage.json` so it falls under the Ed25519 signature, making it
tamper-evident. The attacker-controlled timeout vector is real but bounded,
and acceptable for WRL's current threat model.

---

## Question 1: What metadata must be signed into the WACZ?

### Required fields in `datapackage.json`

The following metadata must be included in the `datapackage.json` object
(which flows into the canonical JSON -> SHA-256 -> Ed25519 signing chain)
to prevent misrepresentation:

```json
{
  "captureQuality": {
    "renderComplete": false,
    "waitUntilReached": "timeout",
    "waitUntilTarget": "networkidle",
    "timeoutMs": 25000,
    "domContentLoaded": true,
    "loadEventFired": true
  }
}
```

**Required fields, explained:**

1. **`renderComplete`** (boolean) -- the single most important signal. `true`
   means `networkidle` was reached within the timeout. `false` means the
   timeout fired and the capture represents a point-in-time snapshot of a
   still-loading page. This field MUST be present on every WACZ going forward,
   including successful captures (`renderComplete: true`), so that the absence
   of the field cannot be confused with a pre-feature capture.

2. **`waitUntilReached`** (string enum: `"networkidle"` | `"load"` |
   `"domcontentloaded"` | `"timeout"`) -- the actual load state the page had
   reached at the moment of capture. "timeout" indicates the target was never
   reached; the other values record the highest milestone achieved. This
   gives verifiers a machine-readable quality gradient.

3. **`waitUntilTarget`** (string) -- what WRL was trying to reach. Currently
   always `"networkidle"`. Included for forward compatibility if the target
   changes (e.g., a future mode that only waits for `load`).

4. **`timeoutMs`** (number) -- the configured timeout. Evidence consumers
   need this to assess whether the timeout was generous or tight.

5. **`domContentLoaded`** and **`loadEventFired`** (booleans) -- which
   milestones had been passed at capture time. A page that has fired `load`
   but not reached `networkidle` is very different from a page that never
   passed `domcontentloaded`. These two booleans let consumers make that
   distinction.

### Why these must be in `datapackage.json`, not just KV

The signing chain is: `datapackage.json` -> `canonicalize()` ->
`sha256()` -> Ed25519 `signBytes()`. Any metadata in `datapackage.json` is
covered by the signature and cannot be altered without invalidating the
bundle. Metadata that exists only in KV is:

- Not signed, so it can be altered after the fact without detection
- Not portable -- KV records are internal state, not part of the evidence
  artifact that a third party receives

The WACZ must be a self-contained evidence package. A verifier who receives
only the `.wacz` file must be able to determine whether the capture was
complete or degraded without access to WRL's internal systems.

### Backward compatibility

Existing WACZ bundles do not have a `captureQuality` object. Verifiers should
treat the absence of `captureQuality` as "unknown" (pre-feature capture), not
as "complete." This is an unavoidable ambiguity for historical captures.
Once the field is introduced, it must be present on every subsequent capture.

---

## Question 2: Attacker-Controlled Timeout as an Attack Vector

### The attack

An attacker who controls a page could deliberately delay loading to force a
degraded capture that omits content that would have loaded later. The
mechanism is simple:

```html
<script>
  // Drip-feed network requests to prevent networkidle
  function keepAlive() {
    fetch('/beacon?t=' + Date.now());
    setTimeout(keepAlive, 2000);
  }
  keepAlive();

  // Load incriminating content after 30s (beyond WRL timeout)
  setTimeout(() => {
    document.body.innerHTML = '<p>The real content</p>';
  }, 30000);
</script>
```

This would produce a degraded capture showing only whatever was visible before
the 25s timeout, while the "real" page content appears later.

### Assessment: real but bounded

**Likelihood: 2/5.** This attack requires the target to know they are being
captured by WRL specifically and to know the timeout value. It also requires
them to control the page content -- which means they are the publisher, not a
third party. WRL captures what the publisher chose to show; it does not claim
to capture what the publisher hid.

**Impact: 3/5.** A degraded capture is transparently marked as degraded (per
the metadata above). An investigator seeing `renderComplete: false` with a
25s timeout and `loadEventFired: true` can draw their own conclusions about
whether the publisher was cooperating. The capture still proves *something*
was published at that URL at that time -- it just does not prove completeness.

**Risk: 6/25 (Low-Medium).** Acceptable for the current threat model.

### Mitigations already in place

1. **The capture is marked as degraded.** The `captureQuality` metadata
   explicitly communicates that `networkidle` was not reached. An attacker
   cannot suppress this marking because it is signed.

2. **The degraded capture still has evidentiary value.** It proves:
   - The URL was accessible at the stated time
   - The page rendered specific HTML and visual content
   - The page was still loading (which itself is informative)

3. **WRL does not claim completeness for degraded captures.** The "evidence"
   claim is "this is what was visible at the time of capture," not "this is
   everything the page would ever show."

### Mitigations to consider (not required for MVP)

- **Log the `networkidle` failure reason** -- "timeout" vs. "navigation
  error" vs. "browser crash." This aids post-hoc analysis.
- **Record the number of pending network requests at timeout** -- available
  from Playwright's network tracking. Helps distinguish "nearly done" (1
  pending request) from "deliberately stalling" (continuous beacon requests).
  This would go into the WARC metadata record, not datapackage.json.
- **Retry with longer timeout via Queues** -- R16 is already in the backlog
  for this. A Queue consumer worker gets 15 minutes, which defeats most
  stalling attacks. Do not implement now; let the data (timeout rate >5%)
  trigger R16.

### Comparison: what happens today

Today, the attacker-controlled timeout attack has a **worse** outcome: the
capture fails entirely, producing no evidence at all. A degraded capture is
strictly better than no capture from an evidence perspective. The attacker
gains more by causing a total failure (status: `"failed"`) than by causing a
degraded capture that still contains whatever was rendered.

---

## Question 3: `captureQuality` in `datapackage.json` vs. KV Metadata

### Recommendation: both, but `datapackage.json` is mandatory

**`datapackage.json` (inside WACZ, signed)**:
- MUST contain `captureQuality` as defined above
- This is the authoritative, tamper-evident record of render quality
- Portable: travels with the evidence artifact
- Verifiable: covered by Ed25519 signature

**KV record (internal, unsigned)**:
- SHOULD also contain render quality metadata (e.g., a `renderQuality` field)
- Serves the API: consumers polling `GET /v1/captures/:id` see quality
  immediately without downloading and parsing the WACZ
- Not the source of truth -- if KV and WACZ disagree, the signed WACZ wins

### Trade-offs

| Aspect | datapackage.json only | KV only | Both |
|--------|----------------------|---------|------|
| Tamper-evident | Yes | No | Yes |
| API-accessible | No (must parse WACZ) | Yes | Yes |
| Portable | Yes | No | Yes |
| Implementation cost | Low | Low | Low (marginal) |
| Consistency risk | N/A | N/A | KV could diverge from WACZ |

**Consistency risk mitigation**: The `captureQuality` object is computed once
in `defaultRenderer()` and passed through to both `buildWacz()` and
`completeCapture()`. There is no separate computation for each path, so
divergence is a code defect (testable), not a race condition.

### What changes in `buildWacz()`

The `buildWacz()` function signature needs a new parameter for capture quality
metadata. The `datapackage` object construction (line 68-81 of `wacz.js`)
would add:

```javascript
const datapackage = {
  profile: 'data-package',
  wacz_version: '1.1.1',
  // ... existing fields ...
  captureQuality: artifacts.captureQuality,  // NEW
  resources: [ /* ... */ ],
};
```

Because `captureQuality` becomes part of the canonical JSON that produces
`bundleHash`, it is automatically covered by the Ed25519 signature. No
changes to the signing pipeline itself are needed.

---

## Question 4: Does a Partial Capture Qualify as "Evidence"?

### Yes, with caveats

The answer depends on what "evidence" means in context:

**For accountability ("prove what was published"):** A degraded capture is
strong evidence. It proves that a specific URL served specific content at a
specific time. The HTML and screenshot are authentic artifacts of the page
state at the moment of capture. The fact that additional content *might* have
loaded later does not invalidate what was captured.

**Legal analogy:** A photograph of a crime scene taken during the event (while
things are still happening) is still evidence -- it just requires more careful
interpretation than a photograph taken after everything has settled. The
photograph's evidentiary value is not diminished by the fact that the scene
continued to evolve after the shutter clicked. What matters is that the
photograph is authentic, timestamped, and its limitations are documented.

**For completeness ("prove the full page"):** A degraded capture is explicitly
not this. It cannot prove what the page would have looked like after
`networkidle`. This limitation must be clearly communicated through the
`captureQuality` metadata.

**For absence ("prove something was NOT on the page"):** A degraded capture
is dangerous for this use case. An adversary could argue that the missing
content would have appeared if the capture had completed. The `renderComplete:
false` flag prevents consumers from making absence-of-content claims based on
degraded captures.

### Evidence hierarchy

The project should define a clear hierarchy:

1. **Full capture** (`renderComplete: true`): Strongest evidence. Page reached
   `networkidle`; all resources loaded. Suitable for both presence and
   absence claims.

2. **Degraded capture** (`renderComplete: false`, `loadEventFired: true`):
   Good evidence of presence. The page's main document and critical resources
   loaded (the `load` event fired). Not suitable for absence claims.
   Explicitly marked as incomplete.

3. **Minimal capture** (`renderComplete: false`, `loadEventFired: false`,
   `domContentLoaded: true`): Weak evidence. Only the HTML was parsed;
   many resources may not have loaded. Still proves the URL was accessible
   and served specific HTML. Visual state (screenshot) may be incomplete.

4. **Failed capture** (`status: 'failed'`): No evidence. The capture could
   not be completed. Currently, all timeouts produce this outcome.

The staged fallback moves timeouts from category 4 to categories 2-3.
This is a strict improvement in evidence coverage.

---

## Additional Security Considerations

### Fail-closed behavior is preserved

The fallback does not introduce fail-open behavior. The system still:
- Fails the capture if the page never passes `domcontentloaded`
- Signs the quality metadata into the bundle (tampering is detectable)
- Marks degraded captures explicitly (no silent quality reduction)

This aligns with OWASP A10 (Mishandling of Exceptional Conditions): the
timeout is handled as a degraded-but-documented outcome, not silently
swallowed.

### No new SSRF risk

The fallback does not change the URL validation, route interception, or
cross-domain navigation blocking. The page object used for screenshot and
HTML capture is the same one that was already navigated to. No additional
network requests are made by the fallback path.

### Timing side-channel

The `timeoutMs` field in `captureQuality` is a constant (25000), not a
measurement. However, the `completedAt` minus `createdAt` timestamps in KV
do leak approximate rendering time. This is existing behavior and not
worsened by the fallback.

### Verification endpoint implications

The verification endpoint (`src/verify.js`) validates the WACZ signature
chain. Adding `captureQuality` to `datapackage.json` does not break
verification -- the verifier re-canonicalizes the entire `datapackage.json`,
hashes it, and checks the signature. New fields are automatically included
in verification.

However, the verification endpoint should surface `captureQuality` in its
response so that API consumers can see whether a verified capture was
degraded. A capture that verifies cryptographically but was degraded is not
the same as a verified full capture.

---

## Recommendations (Priority Order)

1. **Include `captureQuality` in `datapackage.json`** -- this is the
   minimum viable change for evidence integrity. Without it, degraded
   captures are cryptographically identical to full captures, which is
   a misrepresentation risk.

2. **Mirror `captureQuality` in the KV record** -- for API accessibility.
   Compute once, write to both destinations.

3. **Surface `captureQuality` in the verification endpoint response** --
   a verified-but-degraded capture should be clearly distinguishable from
   a verified-and-complete capture.

4. **Do not gate the fallback on `loadEventFired`** -- if only
   `domcontentloaded` has fired, capture anyway and mark it as minimal.
   Some evidence is better than no evidence, and the metadata makes the
   quality transparent.

5. **Log pending network request count at timeout** -- for operational
   insight and future R16 activation analysis. Not security-critical but
   useful for distinguishing slow pages from stalling pages.

6. **Do not implement retry-with-longer-timeout now** -- R16 (Queue
   migration) is the right mechanism for this, and it has a clear activation
   trigger (timeouts >5%). The fallback is the right near-term solution.
