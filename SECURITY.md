# Security Policy

## Supported Versions

Web Resource Ledger does not publish versioned releases yet. Security fixes are applied to the `main` branch. We recommend always running the latest commit on `main`.

## Reporting a Vulnerability

Please report security vulnerabilities through [GitHub Security Advisories](https://github.com/benpeter/web-resource-ledger/security/advisories/new). This creates a private discussion where we can assess the issue before any public disclosure.

**Please do not open a public issue for security vulnerabilities.**

## What to Expect

We will acknowledge receipt of your report within 72 hours and aim to provide an initial assessment within 7 days. These are goals, not guarantees -- this is a small project maintained in spare time. We do take every report seriously.

## Scope

The following are considered security issues:

- SSRF bypasses or unintended outbound requests
- Authentication or API key bypass
- Signature verification flaws (e.g., accepting tampered archives as valid)
- Cross-site scripting (XSS) on the verification page
- Exposure of signing keys or secrets through any code path

The following are regular bugs, not security issues:

- Incorrect capture output for unusual page types
- Performance or reliability issues
- UI/layout problems on the verification page

## Disclosure

We will coordinate with you before any public disclosure. We will credit you in the advisory unless you prefer to remain anonymous.
