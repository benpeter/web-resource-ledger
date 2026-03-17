# API Design Recommendations: Unknown Field Rejection for POST /v1/admin/keys

## Summary

Add a check after JSON parsing that rejects any top-level key not in the
known set `{tenantId, scopes, name}`. Return 400 with a detail message that
names all unknown fields.

---

## Q1: Where in the validation sequence?

**Recommendation: immediately after JSON parsing, before any individual field
validation.**

Rationale:

- Unknown field rejection is a structural/shape check, not a semantic check.
  It answers "does this object have the right shape?" before asking "are the
  values correct?". Placing it first is consistent with that ordering.
- Returning early on an unknown field prevents the caller from receiving
  confusing field-level errors about a request that is structurally wrong.
  For example, if a caller sends `{ "tenant_id": "acme", "scopes": [...],
  "name": "..." }`, rejecting early with "unknown field 'tenant_id'" is more
  helpful than passing through to get "Field 'tenantId' is required."
- The existing validation sequence in `handleAdminCreateKey` already follows
  structure-then-semantics order (Content-Type check → parse → field checks).
  The unknown-field check slots naturally between "parse" and "validate
  tenantId" without disturbing that flow.

Insertion point in `handleAdminCreateKey`:

```
Content-Type check
Parse body
--> NEW: unknown field check <--
Validate tenantId
Validate scopes
Validate name
Generate key / store / respond
```

---

## Q2: Report first unknown field or all of them?

**Recommendation: report all unknown fields in a single 400 response.**

Rationale:

- `problemResponse` takes a plain string `detail`. The current codebase does
  not have a multi-error envelope (no `errors` array). Adding one solely for
  this case would be over-engineering relative to the KISS principle in the
  project's engineering philosophy.
- However, reporting only the first unknown field forces the caller to fix
  one error, retry, discover another, retry again -- a frustrating loop. That
  is bad developer UX for an admin API.
- The middle ground is a single 400 response with a detail string that lists
  all unknown fields: `"Unknown field(s): 'foo', 'bar'"`. This stays within
  the existing `problemResponse` contract while giving the caller everything
  they need to fix the request in one shot.
- This approach is consistent with how the existing scopes validation works:
  it names the invalid value in the detail string rather than returning a
  generic message.

---

## Q3: Edge cases with prototype-inherited properties and `__proto__`

This is a real concern. `JSON.parse` in V8/Node/workerd (the Cloudflare
Workers runtime) does handle `__proto__` as a literal key in modern engines
without performing prototype pollution -- but the check must still be written
defensively.

**The safe pattern:**

```js
const ALLOWED_FIELDS = new Set(['tenantId', 'scopes', 'name']);

const unknown = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
if (unknown.length > 0) {
  return problemResponse(400,
    `Unknown field(s): ${unknown.map(k => `'${k}'`).join(', ')}`);
}
```

Why `Object.keys()` is the right choice here:

- `Object.keys()` returns only own enumerable properties. It does NOT walk
  the prototype chain, so inherited properties (including anything on
  `Object.prototype`) are never enumerated. This eliminates the prototype
  chain concern entirely.
- `for...in` would be wrong here -- it walks the prototype chain and would
  false-positive on inherited properties.
- `Object.getOwnPropertyNames()` includes non-enumerable own properties,
  which is unnecessary and theoretically could include `__proto__` as a
  string key on older engines. `Object.keys()` is the correct scope.

The `__proto__` edge case specifically: modern V8 (workerd is V8-based)
treats `__proto__` as a regular string key when it appears in JSON.parse
output -- prototype pollution via JSON is not a risk in current runtimes.
But using `Object.keys()` means it would be caught as an unknown field anyway,
which is the right outcome.

The existing validation already uses `Object.prototype.hasOwnProperty.call(body, k)`
for required-field presence checks, which is the correct defensive pattern.
The unknown-field check using `Object.keys()` is consistent with that
defensive style.

**One additional guard worth noting:** the check should verify that `body` is
a plain object before calling `Object.keys()`. If `JSON.parse` returns a
non-object (e.g., a top-level array or string), `Object.keys()` would either
return array indices or an empty array -- neither is the right behavior.

The existing code already guards with:
```js
if (!body || !Object.prototype.hasOwnProperty.call(body, 'tenantId')) { ... }
```

That guard happens *after* the proposed check. Move the null/non-object guard
to before the unknown-field check, or add an explicit `typeof body !== 'object'
|| Array.isArray(body)` check before calling `Object.keys()`.

Suggested guard order:

```js
// Guard: body must be a plain object
if (!body || typeof body !== 'object' || Array.isArray(body)) {
  return problemResponse(400, 'Request body must be a JSON object');
}

// Unknown field check
const ALLOWED_FIELDS = new Set(['tenantId', 'scopes', 'name']);
const unknown = Object.keys(body).filter(k => !ALLOWED_FIELDS.has(k));
if (unknown.length > 0) {
  return problemResponse(400,
    `Unknown field(s): ${unknown.map(k => `'${k}'`).join(', ')}`);
}

// Individual field validation follows...
```

This replaces the existing `if (!body || ...)` guard that is currently
duplicated across each field check.

---

## Summary of Recommendations

| Question | Recommendation |
|----------|----------------|
| Where in sequence? | After parse, before field validation. Slot between parse and tenantId check. |
| First or all unknown fields? | All unknown fields, listed in detail string. |
| Prototype / __proto__ safety? | Use `Object.keys()` (own enumerable only). Add plain-object guard before the check. |

The implementation is small: ~8 lines inserted between the parse block and
the tenantId validation block. No changes to `problemResponse`, no new
dependencies, no new data structures beyond a Set literal.
