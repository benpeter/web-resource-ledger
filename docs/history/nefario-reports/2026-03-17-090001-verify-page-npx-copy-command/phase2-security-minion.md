# Security Minion -- Domain Plan Contribution

## Feature Under Review

Add a collapsible "Verify independently" section to the verify page containing
a copy-to-clipboard `npx` command that lets users run the `@w-r-l/verify` CLI
tool against the capture URL.

The command template: `npx @w-r-l/verify https://{origin}/v1/captures/{captureId}`

---

## Recommendations

### 1. Command injection risk from captureId: LOW (acceptable)

The `captureId` is validated server-side by the route regex `cap_[a-f0-9]{32}`
(index.js line 25) before the verify page is ever rendered. The character class
`[a-f0-9]` with the fixed `cap_` prefix produces a 36-character string that
contains **zero shell metacharacters** -- no spaces, quotes, backticks,
semicolons, pipes, dollar signs, parentheses, or newlines. This string is safe
to embed in a shell command without escaping.

The `captureId` also passes through `JSON.stringify()` when injected into the
inline script (verify-page.js line 282), and through `escapeHtml()` for the
HTML template context. Both are defense-in-depth layers but the regex is the
authoritative gate.

**Verdict: No mitigation needed.** The regex validation is sufficient. The
character class makes injection structurally impossible.

### 2. Origin URL in the command: LOW (acceptable)

The `origin` value is derived from `new URL(request.url).origin` (index.js
line 537), which returns the scheme + host + port of the worker's own URL.
This is **server-controlled, not user-controlled** -- Cloudflare Workers
resolve `request.url` from the actual request target, not from a
user-supplied Host header. An attacker cannot inject arbitrary values into
the origin.

The origin will be `https://wrl.benpeter.workers.dev` (or a custom domain),
which contains only `[a-z0-9.:-/]` -- again, no shell metacharacters.

**Verdict: No mitigation needed.** The origin is server-derived and safe.

### 3. Clipboard API and CSP: COMPATIBLE

The Clipboard API (`navigator.clipboard.writeText()`) is a browser API, not
a network request. It does not violate any CSP directive. The relevant CSP
constraints are:

- `default-src 'none'` -- blocks fetches, not browser APIs
- `script-src 'unsafe-inline'` -- the inline script can call any JS API
- No `clipboard-write` Permissions-Policy is set, so the API is available by
  default

The Clipboard API requires:
1. **Secure context (HTTPS)** -- Cloudflare Workers always serve over HTTPS. OK.
2. **User activation** -- `writeText()` must be called inside a user gesture
   handler (click, tap). The copy button click handler satisfies this.
3. **Permissions** -- `clipboard-write` is granted by default in secure contexts
   when triggered by user activation. No prompt is shown.

**Verdict: No mitigation needed.** The implementation should call
`navigator.clipboard.writeText()` inside the button's click handler, which
is the standard pattern.

### 4. XSS via the constructed command string: LOW (acceptable)

The command string will be constructed in JavaScript from `origin` (server-
controlled) and `captureId` (regex-validated hex). Neither contains HTML
metacharacters. The string should be inserted into the DOM using
`textContent`, consistent with the existing pattern throughout verify-page.js
(see lines 469, 496-498, 507, 514-515, 552, 606, 617, 629).

**Recommendation:** Use `textContent` or `createElement` to render the
command. Do NOT use `innerHTML` to insert the command string. The existing
codebase already follows this discipline -- just maintain it.

### 5. Social engineering risk: INFORMATIONAL

Displaying a `npx` command on the page means users will copy-paste it into
their terminal. This is an intentional feature, but it creates a trust
relationship: users trust that the displayed command is safe. Consider:

- **The command is deterministic and verifiable** -- users can read it before
  pasting. It contains only the package name and a URL, no flags or pipes.
- **The package `@w-r-l/verify` is under project control** -- the scoped npm
  namespace prevents typosquatting of the package name itself.
- **`npx` fetches and executes code** -- this is inherent to the tool and
  not a new risk introduced by this feature.

**Verdict: Acceptable.** The command is simple enough for users to visually
inspect. No obfuscation, no pipes, no shell operators. The scoped package
name mitigates typosquatting.

### 6. CSP `script-src 'unsafe-inline'` is pre-existing: INFORMATIONAL

The page already uses `script-src 'unsafe-inline'` because the entire
verify page is a single self-contained HTML response with an inline script.
The copy-to-clipboard feature adds no new CSP risk -- it operates within the
existing inline script. This is noted for completeness, not as a finding
against this feature.

---

## Proposed Tasks

### Task 1: Implement copy button with textContent rendering

Build the collapsible section and copy button. Security requirements:

- Construct the command string in JavaScript: `'npx @w-r-l/verify ' + origin + '/v1/captures/' + captureId`
- Render the command using `textContent` on a `<code>` element, never `innerHTML`
- Call `navigator.clipboard.writeText(command)` inside the button's `click` handler
- Provide a visual confirmation (e.g., button text changes to "Copied") that
  auto-resets after 2 seconds
- Graceful degradation: if `navigator.clipboard` is unavailable (HTTP context,
  old browser), hide the copy button and show the command as selectable text

### Task 2: No server-side changes required

The captureId and origin values already flow safely into the inline script
via `JSON.stringify()`. No new server-side validation, sanitization, or CSP
changes are needed.

---

## Risks and Concerns

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Shell injection via captureId | Low | Near-zero | Regex `cap_[a-f0-9]{32}` makes this structurally impossible |
| Shell injection via origin | Low | Near-zero | Server-derived, not user-controlled |
| XSS via command string | Low | Near-zero | Use `textContent`, maintain existing discipline |
| Clipboard API unavailable | Low | Low | Feature detection with graceful degradation |
| User pastes command into wrong terminal | Informational | Low | Command is visually inspectable, scoped package name |

**No Critical or High risks identified.** This feature has a clean security
profile because:

1. Both inputs (captureId, origin) are tightly constrained by validation and
   provenance
2. The output context (clipboard text) does not interpret the content as code
3. The rendering context (DOM textContent) does not interpret the content as HTML
4. The CSP already permits inline scripts and the Clipboard API is orthogonal
   to CSP

---

## Additional Agents Needed

None. The security surface of this feature is minimal. The implementation can
proceed without further security review, provided the `textContent` rendering
discipline is maintained.
