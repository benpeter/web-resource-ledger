# Margo Assessment: Auth Context Threading Through performCapture()

## Verdict: BLOCK the threading approach. Log at handler level only.

---

## What Was Examined

`performCapture()` in `src/capture.js` currently has this signature:

```
performCapture(env, url, ip, captureId, tenantId, cip, renderer)
```

The proposal adds `keyName` and `authMethod`, making it:

```
performCapture(env, url, ip, captureId, tenantId, cip, renderer, keyName, authMethod)
```

These two values would be used exclusively for log decoration -- they carry
no behavior inside the function.

---

## Complexity Assessment

### Parameter count before and after

- Before: 7 parameters (env, url, ip, captureId, tenantId, cip, renderer)
- After: 9 parameters (adds keyName, authMethod)

Seven is already at the edge of comfortable. Nine is objectively hard to
call correctly without named-parameter destructuring, and this codebase
uses positional parameters throughout. Every call site must pass two
additional values or explicitly pass undefined/null placeholders.

### What the threading buys

Every log event inside `performCapture()` would gain two fields: `keyName`
and `authMethod`. The events affected are:

- `capture.start`
- `capture.stage.fail`
- `capture.header_fail`
- `capture.key_archive_fail`
- `capture.wacz_fail`
- `capture.partial`
- `capture.success`
- `capture.consent_error`
- `capture.fail` (catch-all)
- `capture.kv_fail`

That is a lot of decoration for fields that serve a single diagnostic
purpose: correlating a pipeline event back to which API key and auth method
initiated the request. That correlation is already achievable without
threading.

---

## Why This Is Accidental Complexity

### 1. Wrong layer of ownership

Auth context (which key, which method) belongs to the request handling
layer, not the capture pipeline. The capture pipeline's job is browser
orchestration and artifact storage. It does not need to know how the caller
authenticated. Giving it auth fields violates the single responsibility this
function already has, and it creates a coupling between two layers that have
no other relationship.

### 2. Parameter pollution for a logging-only concern

Two parameters that carry no behavior -- they exist only so log() calls can
include them -- is the textbook case of threading the wrong thing. If the
requirement were "the capture pipeline needs to make decisions based on
which key was used," threading would be justified. It is not. The requirement
is "I want these fields in the log." That is a logging concern, not a
pipeline concern.

### 3. The correlation problem is already solved by captureId

Every log event in `performCapture()` already includes `captureId`. The
request handler knows `captureId` and knows `keyName`/`authMethod`. The
handler can emit one log event that joins all three. Downstream log
correlation (e.g., in Coralogix) can then join on `captureId` to link any
pipeline event to the auth context without the pipeline knowing anything
about auth.

This is the correct approach: log the association at the boundary where the
association is known, then correlate via the shared identifier.

### 4. YAGNI check

Are there pipeline events where having `keyName`/`authMethod` inline (rather
than correlated via `captureId`) would be materially better for operations?
No specific case justifies it. The operational question "which key triggered
this failed capture?" is answered by: look up the `capture.start` or
`capture.request` event at the handler level for that `captureId`. That is
one query step, not a capability gap.

---

## Simpler Alternative

**Log auth context once, at handler level, before the waitUntil handoff.**

The request handler already knows `captureId`, `keyName`, and `authMethod`
at the point it enqueues the capture. It should emit a single event:

```js
await log(env, 3, 'request', {
  event: 'capture.request',
  captureId,
  tenantId,
  keyName,
  authMethod,
  url,
  cip,
});
```

All pipeline events are then correlated to this record via `captureId`. No
changes to `performCapture()` signature. No new coupling. The association
is present in the log system exactly where it should be: at the boundary
where auth was verified.

---

## Complexity Budget Impact

Threading approach:
- New abstraction concern crossing a layer boundary: 3 points (abstraction layer)
- Call-site changes at every `performCapture()` invocation: maintenance cost with no operational return

Handler-level logging approach:
- One new log event at an existing log site: 0 points (no new abstraction, no new dependency, no new layer)

---

## Summary

Threading `keyName`/`authMethod` into `performCapture()` is accidental
complexity. The parameters serve no purpose other than log decoration, they
cross a layer boundary that should stay clean, they inflate an already-long
parameter list, and the correlation problem they solve is already solved by
`captureId`. Log at handler level. Keep the capture pipeline focused on
capturing.
