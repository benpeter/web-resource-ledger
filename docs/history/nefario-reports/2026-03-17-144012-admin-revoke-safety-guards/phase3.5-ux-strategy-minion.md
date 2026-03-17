---
agent: ux-strategy-minion
verdict: APPROVE
---

## Operator Experience Assessment: 409 Error Message

**Message under review:**
`"Cannot revoke the last admin-scoped key for tenant '${record.tenantId}'. Create a replacement key first."`

### Verdict: APPROVE

The 409 response is actionable and recovery-guiding. No changes recommended.

### Assessment

**The message does all three required things:**

1. States what failed: "Cannot revoke the last admin-scoped key"
2. States why: it is the last one (implicit in "last")
3. States what to do next: "Create a replacement key first"

The tenant name is interpolated directly into the message. An operator managing multiple tenants does not have to infer context -- the detail is self-contained.

**Status code choice is correct.**

409 communicates "structurally valid request, but conflicts with current resource state" -- which is precisely the situation. Operators who read HTTP semantics get the signal without reading the body. The body then confirms and guides recovery. Layered messaging (status code as signal, body as instruction) reduces cognitive load: a well-equipped operator can act on the status code alone; a less-experienced operator gets the full detail.

**RFC 9457 shape adds no friction.**

This is already the established error pattern on this API. Operators familiar with other endpoints will recognize the shape immediately. No new mental model required.

**Terminology note.**

"admin-scoped" is marginally more precise than the original prompt's "admin key" because it frames the constraint in terms of the scopes array, which is the actual data model. An operator reading this message and then looking at the key record will see `scopes: ['admin']` and immediately understand the constraint. Good signal-to-referent alignment.

**TODO comment for self-revocation.**

Operators will never see this comment. It is correctly scoped to developer context and explanatory enough to orient a future implementer without cluttering the runtime path.

### No Issues Found

The error experience is complete. The operator has everything they need to recover without consulting documentation.
