## Security Review: Feature List and Competitor Comparison Table

### Verdict: APPROVE

### Assessment

This plan adds two static HTML sections and a static docs page. There is no
user input, no backend surface, no JavaScript, no dynamic rendering, and no
auth changes. The security attack surface introduced is effectively zero.

**Specific checks:**

**XSS**: No XSS vectors. All content is hardcoded static text authored by the
developer, not user-supplied or fetched from any external source. The
`content: attr(data-label)` CSS pseudo-element reads from HTML attributes that
are also hardcoded -- no injection path exists.

**Injection**: Not applicable. No SQL, no server-side templating with
user-controlled variables, no shell execution. The `.njk` template uses
hardcoded Nunjucks frontmatter with no variable interpolation on untrusted
data.

**Information disclosure**: No credentials, API keys, internal endpoints, or
architecture details are added to the public page. The competitor data
references publicly documented capabilities only. The GitHub issues link in
the methodology section points to the already-public repo.

**External links**: Two external links are present -- the GitHub issues link
in the compare page (`github.com/benpeter/web-resource-ledger/issues`) and the
cross-link from landing to docs (`docs.webresourceledger.com/compare/`). Both
are first-party or controlled destinations. No user-controlled redirect targets.
No `target="_blank"` links are specified, but if the frontend-minion adds them,
`rel="noopener noreferrer"` should be included -- flag this at the approval gate
review, not a blocker.

**Supply chain / dependency risk**: No new dependencies introduced. Pure HTML
and CSS only.

**Content risk (not a blocker)**: The comparison data about competitors
(PageFreezer, Hanzo, MirrorWeb, etc.) contains factual claims about their
products. This is a reputational/legal risk to the operator, not a security
vulnerability. The plan already flags this with an approval gate and a
methodology section stating claims are based on public documentation. This is
appropriately handled outside the security review scope.

### Recommendations

One non-blocking advisory: if the frontend-minion adds `target="_blank"` to
any of the outbound links (GitHub, docs cross-link), ensure `rel="noopener
noreferrer"` is included. This is a standard hardening measure for blank-target
links. Verify at the Task 1 and Task 2 approval gates.

No security blockers identified. Proceed.
