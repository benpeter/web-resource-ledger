APPROVE

This is a pure CSS selector specificity fix in a static landing page stylesheet. No attack surface changes:

- No user input handling added or modified
- No authentication or authorization logic touched
- No secrets, credentials, or tokens involved
- No new dependencies introduced
- No server-side code affected
- No changes to CSP, CORS, or security headers
- No executable code paths modified

The `:not(.btn)` pseudo-class and `:visited` rule are passive visual styling with no security implications. Nothing in this change creates or expands any injection vector, authentication bypass, or privilege escalation path.
