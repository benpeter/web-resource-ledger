# Terms of Service

**Effective: 2026-03-16**

## What WRL Is

Web Resource Ledger (WRL) is a web archival service. It captures web page screenshots, rendered HTML, and HTTP response headers, then packages them into Ed25519-signed WACZ bundles. Each capture is independently verifiable -- anyone with the capture URL can confirm the content has not been tampered with.

## Acceptance

By using this API, you agree to these terms. If you do not agree, do not use the service.

## Permitted Use

WRL is provided for lawful archival purposes only. You may use WRL to create verifiable records of publicly accessible web content for documentation, research, legal evidence, journalism, or personal reference.

## Prohibited Uses

You may not use WRL to:

- **Harass, stalk, or intimidate** -- capturing URLs to build dossiers on individuals, monitor someone without consent, or gather material for harassment campaigns.
- **Archive illegal content** -- knowingly capturing child sexual abuse material (CSAM), classified government documents, or other content whose possession is unlawful.
- **Circumvent access controls** -- capturing content behind paywalls, login walls, or authentication barriers that you are not authorized to access.
- **Conduct surveillance** -- automated mass capture of URLs to monitor individuals or populations.
- **Attack infrastructure** -- submitting URLs designed to exploit SSRF vulnerabilities, probe internal networks, or otherwise attack WRL or third-party systems.

## Operator Rights

The operator reserves the unrestricted right to:

- Remove any capture at sole discretion, without notice or explanation.
- Suspend or revoke any API key at any time.
- Block any IP address or range.
- Modify rate limits, storage quotas, or service availability.

No reason is required. No appeal process is guaranteed.

## No Warranty and Limitation of Liability

WRL is provided "as-is" without warranty of any kind, express or implied. The operator does not guarantee availability, uptime, data durability, or permanence of captures.

To the maximum extent permitted by applicable law, the operator's total liability for any claim arising from use of the service is limited to the amount paid for the service (zero, if the service is provided at no charge). The operator is not liable for indirect, incidental, special, or consequential damages.

## Data Handling

**What WRL stores for each capture:**
- The submitted URL
- A full-page screenshot (PNG)
- Rendered HTML (the DOM after JavaScript execution)
- HTTP response headers from the target server
- Timestamps (creation and completion)
- A signed WACZ bundle containing all of the above

**What WRL does not store:**
- Your identity beyond the API key used for submission
- Cookies or session data from the target site
- Credentials or authentication tokens from the target site
- Your IP address in the capture record (rate limiting uses IP transiently)

**Retention:** Captures are stored indefinitely unless removed by the operator.

**Personal data in captures:** If the captured web page contains third-party personal data, you (the submitter) are the data controller for that data under GDPR. The operator processes it on your instruction (the capture request). You are responsible for ensuring you have a lawful basis for capturing content that includes personal data.

## Copyright and Takedown

WRL captures publicly accessible web content as-is. The operator does not endorse or verify the content at captured URLs.

If you believe a capture infringes your copyright, contact the operator (see [Content Moderation Policy](CONTENT-POLICY.md#abuse-reporting) for contact details). Include:

- Identification of the copyrighted work
- The WRL capture ID or URL
- Your contact information
- A statement of good faith belief that the use is not authorized

The operator will review valid complaints and may remove content that infringes copyright.

## Governing Law

These terms are governed by the laws of the Federal Republic of Germany.

## Changes to Terms

These terms may be updated at any time. The effective date at the top of this document reflects the most recent revision. Continued use of the service after changes constitutes acceptance of the updated terms.

## Disclaimer

This document is a reasonable-effort template for a small, early-stage project. It is not professional legal advice. If your use case requires legal certainty, consult a qualified attorney.
