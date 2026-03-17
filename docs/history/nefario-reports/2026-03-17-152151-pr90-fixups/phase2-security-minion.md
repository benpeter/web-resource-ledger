# Security Review: PR #90 Fixups -- Auth Scope Bug and NAME_RE Tightening

## Bug #1: Legacy Scope Check -- Error Message Specificity

### Current state

The legacy path in `verifyApiKey` (auth.js:213-226) succeeds unconditionally
when `timingSafeEqual` matches. It returns `scopes: ['capture', 'read']` and
does not evaluate `requiredScope`. The bug is the absence of a scope check
before the `return { ok: true, ... }` at line 218.

The proposed fix is to add `hasScope(LEGACY_SCOPES, requiredScope)` and return
403 when the check fails. The question is: what does that 403 say?

### Security analysis: generic vs. specific message

The existing KV scope failure message is:

```
"API key does not grant 'capture' scope"
```

That message is already telling the caller which scope was required, which is
fine -- the scope name is not secret; it is in the API documentation. What it
does NOT do is reveal anything about the key itself (it does not say "your KV
key", nor does it say the tenant name).

Naming "legacy key" in the 403 response would be different. It reveals:

1. Which auth path authenticated the caller (KV vs. legacy). This is
   meaningful oracle information. An attacker who already has the legacy
   `CAPTURE_API_KEY` and is probing for escalation paths now knows they
   authenticated via the legacy path, which implies that the legacy key still
   works and that the KV path produced no match. This is additive signal.

2. That the legacy path exists at all. The existence of a fallback auth
   mechanism is not inherently secret, but announcing it in error responses
   accelerates reconnaissance.

However, both observations are marginal in practice because:

- The legacy key is a single fixed string configured at deploy time. Anyone
  who has it already knows it is the legacy key.
- The scope limitation (`capture` and `read` only) is architecturally fixed
  and documented -- a caller can probe for `admin` scope with any key and
  observe the 403 regardless.

The stronger argument for a generic message is consistency and future-proofing.
The auth module already has a documented design principle at line 167:
"same message as not-found to avoid revealing revocation." The same logic
applies here: avoid auth-path differentiation in error responses. Future
readers of the code will see a generic 403 and correctly infer that this is
the pattern; a specific "legacy" message creates an inconsistency they must
reason about.

### Recommendation

**Use the same generic message as KV keys:**

```js
response: problemResponse(403, `API key does not grant '${requiredScope}' scope`),
```

Do not name "legacy key" in the response body. The `reason` field in the
returned object (which goes to internal logs, not the HTTP response) can and
should be specific -- e.g., `reason: 'legacy_scope_insufficient'` -- so
operators can distinguish the two paths in Coralogix without leaking the
distinction externally.

The internal log entry via `log()` can include `authMethod: 'legacy'` if
useful. The HTTP body should not.

This is consistent with the existing revocation handling, which deliberately
uses the same external message for two distinct internal states.

---

## Bug #5: NAME_RE Tightening

### Current regex

```js
const NAME_RE = /^[\x20-\x7E]{1,128}$/;
```

This is the full printable ASCII range (space through tilde, 95 characters).
It permits: backtick, double-quote, single-quote, angle brackets, curly
braces, square brackets, pipe, backslash, semicolons, and other shell
metacharacters.

### Proposed regex

```js
/^[a-zA-Z0-9 _.:-]{1,128}$/
```

### Security assessment of the proposed set

The proposed set is significantly tighter and defensively sound. The allowed
characters are:

| Character | Rationale |
|-----------|-----------|
| `a-zA-Z0-9` | Alphanumeric identifiers |
| space (` `) | Human-readable names ("production capture key") |
| `_` | Separator in snake_case names |
| `.` | Version-style names ("key.v2") |
| `:` | Namespace-style names ("tenant:service") |
| `-` | Hyphenated names ("read-only") |

None of these characters are shell metacharacters, HTML injection vectors,
SQL metacharacters, or JSON structure characters. The set is free of:
`"`, `'`, `<`, `>`, `&`, `;`, `|`, `` ` ``, `\`, `{`, `}`, `(`, `)`,
`[`, `]`, `^`, `$`, `*`, `?`, `!`, `#`, `%`, `+`, `=`, `~`, `@`, `/`.

The security concern with `[\x20-\x7E]` is not that `name` is currently used
in an injection-vulnerable context -- it is stored in KV and returned in JSON
responses where it is serialized. But the validation layer is where you enforce
the contract for all future uses. Once `name` values with backticks, quotes,
and angle brackets are in KV, a future code path that renders `name` in HTML
or passes it to a shell (however unlikely given the architecture) inherits that
risk. Tightening now costs nothing.

### Should `/` be included?

The question is whether operators need path-like names (e.g.,
`"service/read-key"` or `"team/project/capture"`).

Arguments for `/`:
- Hierarchical naming is a real operator pattern
- It is not a shell injection character in this context (it is not a separator
  in any operation performed on `name`)

Arguments against `/`:
- It is the URL path separator -- if `name` ever appears in a URL, it creates
  path traversal risk
- The existing allowed characters (`:` and `-` and `.`) already cover all
  practical namespace/hierarchy patterns without ambiguity
- `"service:read-key"` or `"service.read-key"` is as readable as
  `"service/read-key"` and carries no path-traversal risk in future uses

Verdict: exclude `/`. The `:` character covers the namespace use case.

### Should `@` be included?

The question is whether operators need email-style names (e.g.,
`"api-key@tenant.com"` or `"user@domain"`).

Arguments for `@`:
- Email-like identifiers are a common naming pattern
- `@` is not a shell metacharacter in most contexts

Arguments against `@`:
- The `tenantId` field already captures tenant identity
- `name` is a human label for the key, not an identity anchor -- combining
  identity information into the label couples two concerns
- `@` can be confusing in log queries (it is a special character in some
  log query languages and LDAP expressions)
- Excluding it keeps the set unambiguously safe for all current and plausible
  future rendering contexts

Verdict: exclude `@`. Operators who want to express email-like associations
should use the `tenantId` field and a descriptive `name` like
`"ben.peter-admin"`.

### Should `()` be included?

Arguments for:
- Description-style names ("capture (primary)", "read only (backup)")

Arguments against:
- Parentheses are shell metacharacters
- The space character already enables descriptive phrases without grouping
- No legitimate key-naming pattern requires grouping syntax

Verdict: exclude `()`.

### Final recommendation

The proposed set `^[a-zA-Z0-9 _.:-]{1,128}$` is correct. No additions are
needed.

One implementation note: the regex as written allows a name that is entirely
spaces (e.g., `"   "`). Whether that is acceptable depends on whether `name`
is ever used as a display label in a UI or matched against. Consider whether
to require at least one non-space character -- e.g., require the name to start
and end with `[a-zA-Z0-9_.-]` and allow spaces only in the interior. That
said, this is a usability concern more than a security concern, and the current
proposal is a net improvement over `[\x20-\x7E]` regardless.

The error message at admin.js:98 should be updated to reflect the new
constraint:

```js
// current:
"Field 'name' must be 1-128 printable ASCII characters"

// after tightening:
"Field 'name' must be 1-128 characters using letters, digits, spaces, and _ . : -"
```

---

## Summary

| Item | Recommendation |
|------|----------------|
| Legacy 403 message | Generic (`"API key does not grant 'X' scope"`) -- no "legacy" mention in HTTP body |
| Legacy 403 reason code | Specific in internal log object (`reason: 'legacy_scope_insufficient'`) |
| NAME_RE proposal | Approved as-is: `^[a-zA-Z0-9 _.:-]{1,128}$` |
| `/` in NAME_RE | Exclude -- `:` covers namespace patterns, `/` adds path-traversal risk in future uses |
| `@` in NAME_RE | Exclude -- not needed given `tenantId` field exists |
| `()` in NAME_RE | Exclude -- shell metacharacters, no legitimate use case |
| All-space name | Low-priority edge case; worth a note but not a blocker |
| Error message update | Update to reflect new character set in the 400 response body |
