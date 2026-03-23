## Security Review: Stripe Legal Pages -- phase3-synthesis.md

**Verdict: ADVISE**

---

### Summary

The plan is well-constructed from a security and GDPR perspective. The privacy policy content accurately reflects the actual technical implementation (hashed credentials, HMAC-pseudonymized IPs, PKCE OAuth, session cookie attributes). No new runtime attack surface is introduced -- these are static HTML files with no JavaScript. Two issues warrant attention before or during execution.

---

### Findings

#### MEDIUM -- Operator PII permanently indexed on static pages

- **Location**: Footer HTML template (line 295), Privacy Policy controller block (lines 390-395), all four legal pages
- **Description**: The operator's full legal name, street address, and direct email are hardcoded into the footer of every page and repeated in the privacy policy controller section. These pages explicitly set `<meta name="robots" content="index, follow">` and are included in sitemap.xml. This is deliberate and legally required (German Telemediengesetz/DSGVO controller disclosure), but it means the operator's home address becomes permanently indexed by Google, scraped by data brokers, and embedded in the Wayback Machine in perpetuity.
- **Impact**: Personal safety risk for a sole proprietor operating from a residential address. Address will appear in targeted phishing, spam, and data broker databases.
- **Remediation**: This is a known trade-off, not a fixable flaw -- German law requires controller identification. The mitigation is operational: Ben should consider using a registered business address or postal box service (Postfach/Packstation) for future legal pages. For this phase, add a one-line note to the phase risks: "Operator home address is publicly indexed. Consider a commercial mail address for future revisions."

No code change needed for this phase; this is a flag for Ben to act on independently.

#### LOW -- DPA verification gap acknowledged but action item not surfaced

- **Location**: Phase synthesis Risks section, item 1 (line 890); Privacy Policy "Third-Party Processors" section (line 491)
- **Description**: The privacy policy asserts "We maintain data processing agreements with our infrastructure providers as required by GDPR Article 28." This assertion needs to be true at the time the page goes live. The synthesis flags this as a Ben action item but it is not tracked as a task. Coralogix in particular requires explicit DPA execution (it is not automatic under their standard ToS in the way Cloudflare's is).
- **Impact**: Publishing a false GDPR Art. 28 claim is a compliance violation, not just a risk. A supervisory authority complaint could cite the unverified assertion as evidence of inadequate compliance.
- **Remediation**: Before merging, Ben should verify: (1) Cloudflare DPA is active (it is part of their standard terms at cloudflare.com/gdpr/introduction -- confirm account acceptance), (2) Coralogix DPA is executed (requires explicit acceptance at coralogix.com/dpa or via their support), (3) DigiCert and GitHub have SCCs in place. If any DPA cannot be confirmed before launch, soften the privacy policy language to "We have contractual arrangements with processors" rather than asserting GDPR Art. 28 compliance specifically.

#### INFORMATIONAL -- Privacy policy accurately reflects implementation

The following technical claims in the privacy policy were cross-checked against the system description and are accurate:
- `__Host-` cookie prefix with HttpOnly, Secure, SameSite=Lax -- correct
- SHA-256 hashing of session tokens and API keys (raw values never stored) -- correct
- HMAC-SHA-256 with daily rotating key for IP pseudonymization -- correct
- PKCE for OAuth flow -- correct
- Ed25519 signing of capture bundles -- correct
- GitHub `read:user` scope only, access token discarded after identity fetch -- correct
- Coralogix EU (eu2 region) for data residency -- correct

No accuracy gaps found. The policy is technically sound and does not overclaim protections that are not implemented.

#### INFORMATIONAL -- CSP compatibility confirmed

The constraint `script-src 'none'` is already in effect on the landing site. The legal pages contain zero JavaScript, no inline event handlers, no `<script>` tags. Pages are CSP-safe as designed.

---

### Recommendations

1. **Before merge**: Ben verifies Coralogix DPA execution. If not executed, soften the Art. 28 language in the privacy policy before the pages go live.
2. **Post-launch (Ben action)**: Evaluate a commercial mail address / PO box for future legal document revisions to reduce residential address exposure.
3. **No code changes required** for the two informational findings. Task 1 and Task 2 as specified can proceed as written.
