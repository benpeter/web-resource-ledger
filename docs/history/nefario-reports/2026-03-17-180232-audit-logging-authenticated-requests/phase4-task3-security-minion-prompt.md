## Task: Update log.js INVARIANT comment and add subsystem registry

You are updating the INVARIANT documentation in `src/log.js` to acknowledge
the URL exception, the new `audit` subsystem, and tighten the permitted
identifier enumeration.

### Context

The INVARIANT in `src/log.js` (lines 9-15) states that `data` must contain
only static values and predetermined strings, never attacker-controlled input.
However, `capture.start` already logs the capture URL (which is attacker-provided
but WHATWG-normalized and SSRF-validated). Adding audit logging introduces a new
`audit` subsystem. The severity docstring is also incomplete (severity 6 is used
in production but not documented).

### What to do

1. Update the INVARIANT comment in `src/log.js` to add:

   a. An explicit exception for WHATWG-normalized URLs that have passed
      `validateUrl()`: "WHATWG-normalized URLs from validateUrl() are an
      accepted exception: scheme-restricted to http/https, no credentials,
      length-capped at 2048 chars. This applies to the `url` field in
      capture.start events."

   b. Tighten the permitted identifier language. Instead of a generic
      "server-generated identifiers", enumerate specifically: "server-generated
      identifiers whose construction does not incorporate attacker-controlled
      input: captureId (UUID v4, random), keyId (SHA-256 prefix of
      operator-managed secret)." This prevents future implementers from
      treating values derived from attacker input as safe.

   c. A subsystem registry listing all valid subsystem names with brief
      descriptions:
      - `capture` -- capture pipeline lifecycle (start, success, partial, fail)
      - `security` -- auth failures, SSRF blocks, rate limits, key issues
      - `list` -- list captures operations (success, error)
      - `audit` -- authenticated request audit trail (tenant activity, compliance)

   d. A security constraint note for the `audit` subsystem:
      "Audit subsystem events follow the same INVARIANT. All fields are either
      static strings, server-generated identifiers (captureId, keyId), or
      HMAC-derived values (cip). The raw API key, bearer token, and raw IP
      address must NEVER appear in any log entry."

2. Update the severity `@param` JSDoc to include severity 6:
   Current: `3=info, 4=warn, 5=error`
   Updated: `3=info, 4=warn, 5=error, 6=verbose`
   Severity 6 is used by `list.success` in production.

### What NOT to do

- Do NOT change any functional code in log.js. Only update comments/JSDoc.
- Do NOT add code validation or runtime checks.
- Do NOT add severity 6 as a new feature -- just document that it exists.

### Files to modify
- `src/log.js` -- update INVARIANT comment block and severity JSDoc only

### After completing
When you finish, mark task #3 completed with TaskUpdate and send a message to
the team lead with:
- File paths with change scope and line counts
- 1-2 sentence summary of what was produced
