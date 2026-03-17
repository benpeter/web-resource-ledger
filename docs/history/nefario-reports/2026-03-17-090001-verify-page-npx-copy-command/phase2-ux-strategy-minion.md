# Domain Plan Contribution: UX Strategy

## Recommendations

### Strong yes -- this section should exist

The trust gap identified in the planning question is real, specific, and the
proposed solution is well-fitted to the problem. Here is the case:

**The trust narrative has a visible seam.** The verify page currently shows
a timestamp check labeled "Independent time verification" with the
parenthetical "(not verified cryptographically)." That parenthetical is
honest, but for technically literate users it reads as a qualification --
a trust promise the page explicitly declines to make. The CLI tool *does*
make that promise (the `timestampChain` check performs full CMS/PKCS#7
chain validation against a bundled DigiCert root). By surfacing a path
to the CLI, the page closes the loop: "We showed you what we can verify
in a browser. Here is how to verify the rest yourself."

**Progressive disclosure is the correct pattern here.** The page already
uses `<details>` disclosures for "Capture details" and "Cryptographic
details." A third disclosure for independent verification fits the
established visual hierarchy and interaction model. Casual users see
the green checkmark and move on -- zero additional cognitive load.
Technical users who expand "Cryptographic details" (already self-selecting
as deeply interested) can continue downward to the independent verification
section. The information architecture is already layered; this adds one
more layer at the bottom for the smallest, most skeptical audience.

**It aligns with the trust journey, not just the verification result.**
The verify page serves two jobs (JTBD):

1. **Casual confirmation** -- "When I receive a WRL link, I want to see
   quickly whether the capture is authentic, so I can trust (or distrust)
   what it shows." Served by the status banner and check list.

2. **Cryptographic accountability** -- "When I need to prove this capture
   is independently verifiable, I want a way to run the checks myself,
   so I don't have to trust the server that created the capture." Served
   today only by the CLI README. Bringing the CLI into the verify page
   puts the tool where the job is happening.

The moment *after* viewing checks is exactly the right time. The user has
just seen the evidence the server provides. For most users, that is
sufficient. For the small audience that needs more, the natural next
question is "but I am seeing the server's own verdict about its own
capture -- how do I check independently?" The disclosure answers that
question at the moment it forms.

### Show it on failed verifications too

Yes, and this is important. The value of independent verification is
*higher* when the web page shows a failure, not lower. Consider the
scenarios:

- **Pass on page, pass in CLI**: Confirms trust. Nice to have.
- **Fail on page, pass in CLI**: Critical. Indicates the failure might be
  a server-side issue (network glitch, TSA timeout) rather than actual
  tampering. The CLI can resolve ambiguity.
- **Fail on page, fail in CLI**: Confirms failure independently. The user
  now has two independent signals, which is the whole point.
- **Pass on page, fail in CLI**: Extremely important. Could indicate the
  server is lying. This is the adversarial scenario the CLI exists for.

Hiding the CLI option on failure would remove it from the exact moment
where independent verification matters most. The section should appear
regardless of verification outcome.

### Summary text: use "Verify independently"

"Verify independently" is the right choice. Here is the analysis of
alternatives:

| Candidate | Problem |
|-----------|---------|
| "Verify offline" | Misleading -- the CLI fetches the capture and key over HTTP. It is not offline. |
| "Run your own check" | Too casual, slightly patronizing. Does not communicate *why* you would. |
| "Verify with CLI" | Implementation-specific. Tells you the mechanism, not the benefit. |
| "Verify independently" | States the benefit: independence from this server's verdict. Matches the trust narrative. |

"Verify independently" wins because it communicates the *job* (independence),
not the *tool* (CLI). It also creates a natural conceptual contrast with
the checks above, which are the server's own verification.

### The section should acknowledge the deeper check

The body text inside the disclosure should briefly explain what the CLI
adds beyond the page checks. Something like:

> This page verifies file integrity, bundle integrity, and the digital
> signature. The CLI tool additionally validates the timestamp certificate
> chain against a trusted root -- a check that cannot be performed in the
> browser.

This gives technical users a reason to run the command (they learn they
get something the page cannot provide) and makes the trust architecture
transparent. Keep it to two sentences maximum -- this is explanation, not
documentation.

### The npx command should be pre-populated with the capture URL

The command should use the remote-capture syntax from the CLI README:

```
npx @w-r-l/verify <full-capture-URL>
```

Not the local-file syntax. The user is looking at a capture on the web;
the natural action is to verify that same capture by URL. The CLI resolves
the signing key automatically from the origin, so the command is a single
copy-paste with zero configuration. This is critical for reducing friction
-- any command that requires the user to first download something, or to
figure out flags, will not be used.

### Copy-to-clipboard interaction

A single "copy" button next to the command is correct. Do not add a
"Run in terminal" link (there is no standard for that). The copy button
should provide immediate visual feedback (e.g., brief "Copied" text
replacement or checkmark) so the user knows the action succeeded
(Nielsen: visibility of system status).

The command text itself should be displayed in a monospace code block
that is visually distinct from the surrounding prose. The existing
`.crypto-value` style (monospace, `word-break: break-all`) is close
but the command block should be selectable as a unit and not look like
a crypto hash.

## Proposed Tasks

1. **Add `<details>` section to `buildResult()` in `verify-page.js`** --
   positioned after "Cryptographic details" (last in the page). Contains:
   - Summary text: "Verify independently"
   - One-to-two sentence explanation of what CLI adds (timestamp chain
     validation)
   - Pre-populated `npx @w-r-l/verify {captureURL}` in a monospace block
   - Copy button with feedback state

2. **Construct the command dynamically** -- use the `origin` and
   `captureId` already available in the page script to build
   `npx @w-r-l/verify {origin}/v1/captures/{captureId}`. No hardcoding.

3. **Show regardless of verification outcome** -- the section renders for
   both `verified: true` and `verified: false` results. It does NOT
   render in the error state (when the API call itself fails and no
   verification data is available).

4. **Style the code block and copy button** -- inline CSS within the
   existing `<style>` block. Monospace block with subtle background,
   copy button right-aligned. Feedback state on click ("Copied" for
   ~2 seconds). Use the Clipboard API (`navigator.clipboard.writeText`).

5. **Graceful degradation** -- if `navigator.clipboard` is unavailable
   (HTTP context, older browser), hide the copy button entirely. The
   command is still visible and manually selectable. Do not show a
   broken button.

## Risks and Concerns

### Low risk: npx and Node.js as prerequisites

The command requires Node.js 20+. This limits the audience to developers
and technical users. However, this is the *intended* audience for
independent verification -- the casual user who just wants a green
checkmark will never open the disclosure. The progressive disclosure
pattern ensures this prerequisite does not create confusion for the
wrong audience.

### Low risk: additional disclosure visual weight

A third `<details>` element adds visual weight to the bottom of the page.
However, the existing pattern (Capture details, Cryptographic details)
has established that the page deepens in technical specificity as you
scroll down. "Verify independently" is the natural terminus of that
gradient: see results -> see details -> verify yourself. The visual
weight is earned.

### Medium risk: command rot if package name changes

If `@w-r-l/verify` is renamed or unpublished, the command will fail.
This is an inherent risk of recommending a specific npm package. Mitigate
by ensuring the package name is constructed or referenced in one place
in the codebase, not scattered as magic strings.

### Non-risk: CSP implications

The copy button uses `navigator.clipboard.writeText()`, which does not
require any CSP changes. It is a same-origin JavaScript API, not a
network request. The existing `script-src 'unsafe-inline'` covers it.

## Additional Agents Needed

- **frontend-minion**: Implementation of the `<details>` section, copy
  button with clipboard API, feedback animation, and CSS styling within
  the existing verify-page.js inline template. The implementation should
  follow the existing pattern of the other `<details>` sections precisely.

- **No other agents needed.** This is a small, contained addition to an
  existing page with established patterns. No security review needed
  (no new data flows, no CSP changes, no user input). No API changes.
  No new dependencies.
