APPROVE

## Assessment

The plan correctly closes the TOCTOU gap. All three questions in the review
brief have clear affirmative answers after reading the code.

### Does `AND pending_email = ?` fully close the TOCTOU gap?

Yes. The current WHERE clause (`AND pending_email IS NOT NULL`) allows any
non-NULL pending_email to be promoted — a concurrent request that changes
`pending_email` between the application-level cross-check and the UPDATE would
promote the wrong address. Replacing it with `AND pending_email = ?` pins the
UPDATE to the exact address that was verified. If `pending_email` changes
between the check and the swap, `changes === 0` and the caller returns
`{ ok: false }`. NULL exclusion is preserved implicitly (NULL != any string
value in SQL). The fix is correct.

### Is `expectedEmail` sourced correctly?

Yes. At line 407 of `src/email-verify.js`:

```js
const { tenantId, email } = result;
```

`result` is the return value of `verifyEmailVerifyToken(env.SESSION_SECRET, token)`
(line 393). That function verifies an HMAC-SHA256 signature over the token
payload before extracting `email` from the parsed JSON (line 160). The HMAC
is computed against `env.SESSION_SECRET` (a server-held key). An attacker
cannot forge a token containing an arbitrary email without knowing the secret.
The `email` value passed as `expectedEmail` is therefore attacker-controlled
only to the extent that the attacker chose the email at enrolment time — it is
not read from any request parameter at the point of the swap. This is the
correct sourcing.

### Remaining race conditions or security concerns?

None introduced by this change. The defense-in-depth model (application-level
cross-check at line 427, then DB-level pin at the UPDATE) is sound. The two
checks use the same `email` value from the same verified token, so they are
consistent. The post-swap SELECT (line 1418) is a separate read but is used
only to return the updated prefs to the caller — it does not gate any security
decision, so its non-atomic nature is acceptable.

One minor observation that does not warrant blocking or advising: the
`swap_failed` log reason (line 446) does not distinguish between "no pending
email found" and "pending email changed under us." Both map to `changes === 0`.
This is acceptable for the current threat model — the two cases are both
treated as verification failure and logged. If future forensics need to
distinguish replay from TOCTOU, the error string from `swapVerifiedEmail`
(`'no pending email verification found'`) could be surfaced in the log. This
is a logging quality concern, not a security gap, and is out of scope for this
fix.

No issues from the security domain.
