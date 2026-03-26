# Margo -- Complexity Review

## Verdict: APPROVE

This plan is proportional to the problem. The complexity is justified.

### What I checked

**Is HMAC over-engineered for this use case?** No. The codebase already uses
HMAC-signed tokens for two other unauthenticated email link endpoints
(`unsubscribe.js`, `email-verify.js`). The invoice redirect is the same
pattern: an unauthenticated endpoint that must validate a link from an email.
Reusing the established HMAC approach is the simplest choice that meets the
security requirement. Anything simpler (e.g., random lookup keys stored in KV)
would introduce new infrastructure (a KV namespace for token storage, cleanup
logic, state management) that the HMAC approach avoids entirely. Stateless
tokens are simpler than stateful ones here.

**Is the module structure adding unnecessary files?** No. One new source file
(`src/invoice-redirect.js`) and one new test file
(`test/invoice-redirect.test.js`). Two existing files modified with small,
surgical changes (`src/index.js` for routing, `src/billing.js` for URL
generation). This is the minimum file footprint. The plan correctly avoids
extracting a shared HMAC module, which would be a YAGNI refactoring side-quest
touching two tested modules for the sake of one new consumer.

**Is the test plan proportional?** Yes. The test cases cover: token round-trip
(essential), tampered tokens (security boundary), domain allowlist enforcement
(security boundary), HTTP handler behavior (integration), and billing webhook
integration (end-to-end proof the email actually changes). No test categories
are speculative or testing implementation details. The cross-domain token test
(using an `"unsub."` prefix token against the `"inv."` verifier) is a good
low-cost check that domain separation actually works.

**Are the conflict resolutions sound from a complexity standpoint?** All five
resolved in favor of simplicity:
- `"inv."` over `"redir."` -- YAGNI, correct
- `/v1/billing/invoice?token=` over `/r/:token` -- consistency, correct
- Single-domain allowlist over four-domain -- YAGNI, correct
- 200 HTML over 302 redirect for errors -- pattern consistency, correct
- Duplicated helpers over shared module -- follows established convention, correct

**Scope alignment**: the request asks for one thing (rewrite Stripe links in
emails to use the WRL domain). The plan delivers exactly that. One task, four
files touched, no scope creep.

**Complexity budget**: zero new dependencies, zero new services, zero new
abstraction layers, one new module following an established pattern. Well within
budget.

### One observation (non-blocking)

Three copies of `toBase64url`/`fromBase64url`/`importHmacKey` is getting close
to the extraction threshold the plan itself acknowledges ("if a fourth appears,
that's the signal to extract"). Not a problem today, but worth noting as a
future simplification opportunity if another HMAC token type emerges. The plan
explicitly calls this out, which is the right awareness level.
