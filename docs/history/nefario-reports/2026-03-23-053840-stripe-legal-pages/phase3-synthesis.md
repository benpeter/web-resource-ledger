# Delegation Plan -- Stripe Legal Pages

**Team name**: stripe-legal-pages
**Description**: Add four legal/policy pages to webresourceledger.com so the site passes Stripe's business website verification. Static HTML under the existing Cloudflare Workers Static Assets landing site.

## Task 1: Add article/prose CSS and restructure footer CSS

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |

    ## Task: Add article/prose CSS styles and footer restructuring CSS to landing.css

    You are adding CSS styles to `landing/public/css/landing.css` to support two things:
    1. A new `.article` prose layout for long-form legal pages
    2. A restructured footer with two nav columns, section headings, and an operator identity line

    ### File to modify

    `landing/public/css/landing.css` -- add a new section 15 ("Article / prose layout") after the current section 14 ("Responsive adjustments"). Also modify the existing section 13 ("Footer") to add new footer classes.

    ### What to add

    #### Section 15: Article / prose layout

    Add these styles for the `.article` class used on legal pages. All values must use existing design tokens from `design-system.css` and `landing.css` -- no hardcoded colors, sizes, or spacing.

    ```css
    /* ===================================================================
       15. Article / prose layout (legal pages)
       =================================================================== */

    .article {
      max-width: 72ch;
      margin: 0 auto;
      padding: var(--space-16) 0;
    }

    .article h1 {
      font-size: var(--text-3xl);
      font-weight: var(--weight-bold);
      line-height: var(--leading-tight);
      letter-spacing: -0.02em;
      margin: 0 0 var(--space-4);
      color: var(--color-text);
    }

    .article .article__meta {
      font-size: var(--text-sm);
      color: var(--color-text-muted);
      margin: 0 0 var(--space-12);
    }

    .article h2 {
      font-size: var(--text-2xl);
      font-weight: var(--weight-bold);
      margin: var(--space-12) 0 var(--space-4);
      color: var(--color-text);
    }

    .article h3 {
      font-size: var(--text-xl);
      font-weight: var(--weight-bold);
      margin: var(--space-8) 0 var(--space-3);
      color: var(--color-text);
    }

    .article p {
      margin: 0 0 var(--space-4);
      line-height: var(--leading-relaxed);
      color: var(--color-text);
    }

    .article ul, .article ol {
      margin: 0 0 var(--space-4);
      padding-left: var(--space-6);
      line-height: var(--leading-relaxed);
    }

    .article li {
      margin-bottom: var(--space-2);
    }

    .article strong {
      font-weight: var(--weight-bold);
    }

    .article a {
      color: var(--color-accent);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .article a:hover {
      color: var(--color-accent-hover);
    }

    .article a:focus-visible {
      outline: 2px solid var(--color-primary);
      outline-offset: 2px;
    }
    ```

    Also add a table style for the article context (the privacy policy uses tables):

    ```css
    .article table {
      width: 100%;
      border-collapse: collapse;
      margin: 0 0 var(--space-4);
      font-size: var(--text-sm);
    }

    .article th {
      background: var(--color-surface-muted);
      font-weight: var(--weight-medium);
      font-size: var(--text-xs);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: var(--space-2) var(--space-3);
      text-align: left;
      border-bottom: 1px solid var(--color-border);
    }

    .article td {
      padding: var(--space-3);
      border-bottom: 1px solid var(--color-border-subtle);
      vertical-align: top;
    }
    ```

    Add a responsive override inside the existing `@media (max-width: 767px)` block:

    ```css
    .article {
      padding: var(--space-12) 0;
    }

    .article h2 {
      margin-top: var(--space-8);
    }
    ```

    #### Footer CSS additions

    Add these new classes to section 13 ("Footer"), after the existing `.site-footer__bottom` rule:

    ```css
    .site-footer__links {
      display: flex;
      gap: var(--space-12);
    }

    .site-footer__heading {
      font-size: var(--text-xs);
      font-weight: var(--weight-medium);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: rgba(248, 248, 250, 0.5);
      margin: 0 0 var(--space-3);
    }

    .site-footer__operator {
      font-size: var(--text-sm);
      color: rgba(248, 248, 250, 0.6);
      margin: 0 0 var(--space-2);
    }

    .site-footer__operator a {
      color: rgba(248, 248, 250, 0.7);
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .site-footer__operator a:hover {
      color: var(--color-primary-text);
    }
    ```

    Also modify the existing `.site-footer nav` rule. Currently it is:
    ```css
    .site-footer nav {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
    ```

    Change it to:
    ```css
    .site-footer nav {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    ```

    The nav elements now stack vertically within each column (Product, Legal), while the parent `.site-footer__links` provides the horizontal layout between columns.

    Add a responsive override inside the existing `@media (max-width: 767px)` block:

    ```css
    .site-footer__links {
      flex-direction: column;
      gap: var(--space-8);
    }
    ```

    ### Design tokens reference

    All tokens are defined in `landing/public/css/design-system.css` and the `:root` block of `landing.css`. Key tokens you will use:
    - Spacing: `--space-1` through `--space-24`
    - Typography: `--text-xs` through `--text-3xl`, `--text-hero`
    - Weights: `--weight-normal` (400), `--weight-medium` (600), `--weight-bold` (700)
    - Leading: `--leading-tight` (1.2), `--leading-normal` (1.5), `--leading-relaxed` (1.6)
    - Colors: `--color-text`, `--color-text-muted`, `--color-accent`, `--color-accent-hover`, `--color-primary`, `--color-primary-text`, `--color-surface-muted`, `--color-border`, `--color-border-subtle`

    ### Constraints
    - Do NOT create a separate CSS file. All styles go in `landing.css`.
    - Do NOT modify `design-system.css`.
    - Use ONLY existing design tokens. No hardcoded color values, font sizes, or spacing -- except for the rgba footer colors which match the existing pattern in the footer section.
    - Keep the section numbering consistent with the existing file structure.
    - Do NOT add any JavaScript.

    ### Deliverables
    - Modified `landing/public/css/landing.css` with article styles and footer CSS additions

- **Deliverables**: Modified `landing/public/css/landing.css`
- **Success criteria**: Article styles and footer CSS additions are present in landing.css using only design system tokens, section numbering is consistent

---

## Task 2: Create legal HTML pages, update footers, update sitemap

- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |

    ## Task: Create 4 legal HTML pages, update footer on all pages, update sitemap

    You are creating the legal/policy pages for webresourceledger.com and updating the site footer across all pages. The CSS styles you need (`.article`, footer restructuring) are already in `landing.css` from a prior task.

    ### Overview of work

    1. Create 4 new HTML files in `landing/public/`: `privacy.html`, `refund-policy.html`, `terms.html`, `content-policy.html`
    2. Update the footer in `landing/public/index.html` to the new two-column structure with operator identity
    3. Update the footer in `landing/public/404.html` to the new structure
    4. Update `landing/public/sitemap.xml` to include the 4 new pages

    ### New footer structure (used on ALL pages)

    Replace the existing footer on index.html and 404.html, and use this same footer on all 4 new pages.

    **On index.html** (homepage), the footer is:
    ```html
    <!-- Shared footer: update in all pages (index, 404, privacy, refund-policy, terms, content-policy) -->
    <footer class="site-footer" role="contentinfo">
      <div class="container">
        <div class="site-footer__inner">
          <div>
            <div class="site-footer__brand">
              <img src="/assets/logo-w-check-light.svg" width="28" height="28" alt="" aria-hidden="true">
              <span class="site-footer__wordmark">Web Resource Ledger</span>
            </div>
            <p class="site-footer__tagline">Open source under Apache 2.0. Independently verifiable by design.</p>
          </div>

          <div class="site-footer__links">
            <nav aria-label="Product">
              <h4 class="site-footer__heading">Product</h4>
              <a href="https://docs.webresourceledger.com">Docs</a>
              <a href="https://api.webresourceledger.com/ui">Web UI</a>
              <a href="https://docs.webresourceledger.com/api-reference/">API Reference</a>
              <a href="https://github.com/benpeter/web-resource-ledger">GitHub</a>
            </nav>
            <nav aria-label="Legal">
              <h4 class="site-footer__heading">Legal</h4>
              <a href="/terms">Terms of Service</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/refund-policy">Refund Policy</a>
              <a href="/content-policy">Content Policy</a>
            </nav>
          </div>
        </div>

        <div class="site-footer__bottom">
          <p class="site-footer__operator">Gerhard Benjamin Peter &middot; Weidenh&auml;user Str. 73, 35037 Marburg &middot; <a href="mailto:bp@ben-peter.com">bp@ben-peter.com</a></p>
          <p>&copy; 2026 Web Resource Ledger</p>
        </div>
      </div>
    </footer>
    ```

    **On 404.html and all legal pages** (sub-pages), the footer is identical EXCEPT:
    - The 404.html currently uses an inline SVG for the logo instead of `<img>`. Replace the inline SVG with the same `<img src="/assets/logo-w-check-light.svg" ...>` tag used on index.html to keep all footers consistent.

    ### Header for sub-pages (legal pages and 404.html)

    The header on sub-pages uses `/#` prefixed anchor links (not `#`) so they navigate back to the homepage sections. The 404.html already follows this pattern. Use this header on all 4 new legal pages:

    ```html
    <!-- Shared header: update in all pages (index, 404, privacy, refund-policy, terms, content-policy) -->
    <header class="site-header" role="banner">
      <div class="container">
        <a href="/" class="site-header__logo" aria-label="Web Resource Ledger home">
          <img src="/assets/logo-w-check.svg" width="28" height="28" alt="" aria-hidden="true">
          <span class="site-header__wordmark">Web Resource Ledger</span>
        </a>
        <nav aria-label="Main">
          <a href="/#how-it-works">How It Works</a>
          <a href="/#use-cases">Use Cases</a>
          <a href="/#pricing">Pricing</a>
          <a href="https://docs.webresourceledger.com">Docs</a>
          <a href="https://api.webresourceledger.com/auth/login" class="btn btn--primary btn--sm">Sign in</a>
        </nav>
      </div>
    </header>
    ```

    Note: The 404.html header currently uses an inline SVG for the logo and is missing the "Sign in" button. Update the 404.html header to match this sub-page header template (using the `<img>` tag and including the Sign in button).

    ### Page template for legal pages

    Each legal page follows this structure:

    ```html
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>{PAGE TITLE} -- Web Resource Ledger</title>
      <meta name="description" content="{DESCRIPTION}">
      <meta name="robots" content="index, follow">
      <link rel="canonical" href="https://webresourceledger.com/{path}">
      <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
      <link rel="stylesheet" href="/css/design-system.css">
      <link rel="stylesheet" href="/css/landing.css">
    </head>
    <body>

      <a class="sr-only skip-link" href="#content">Skip to content</a>

      {HEADER -- sub-page version with /# prefixed anchors}

      <main id="content">
        <div class="container">
          <article class="article">
            <h1>{PAGE TITLE}</h1>
            <p class="article__meta">Effective: {DATE}</p>

            {PROSE CONTENT IN SEMANTIC HTML}

          </article>
        </div>
      </main>

      {FOOTER}

    </body>
    </html>
    ```

    ### Page-specific meta tags

    | Page | `<title>` | `<meta name="description">` | Canonical path |
    |------|-----------|----------------------------|----------------|
    | privacy | Privacy Policy -- Web Resource Ledger | How Web Resource Ledger collects, uses, and protects your data. | /privacy |
    | terms | Terms of Service -- Web Resource Ledger | Terms governing use of the Web Resource Ledger API and services. | /terms |
    | refund-policy | Refund Policy -- Web Resource Ledger | Refund and dispute policy for Web Resource Ledger paid plans. | /refund-policy |
    | content-policy | Content Policy -- Web Resource Ledger | Acceptable use policy for content captured through Web Resource Ledger. | /content-policy |

    ### Content for each page

    Convert the markdown content below to semantic HTML. Use `<h2>`, `<h3>`, `<p>`, `<ul>`, `<ol>`, `<strong>`, `<a>`, and `<table>` elements as appropriate. Do NOT use `<br>` for spacing -- use proper block elements.

    #### privacy.html -- Privacy Policy

    Effective: 2026-03-23

    **Controller**

    Gerhard Benjamin Peter (sole proprietor)
    Weidenhaeuser Str. 73
    35037 Marburg, Germany
    Email: bp@ben-peter.com

    **What This Policy Covers**

    This policy describes how Web Resource Ledger ("WRL", "the service") collects, uses, stores, and protects personal data when you use the WRL API or web interface at api.webresourceledger.com.

    **Data We Collect**

    *Account Data (GitHub OAuth)*

    When you sign in with GitHub, we receive and store:

    - **GitHub user ID** -- a stable numeric identifier assigned by GitHub
    - **GitHub username** -- your current GitHub display name (updated on each login)

    We request the `read:user` scope from GitHub. We do **not** receive or store your GitHub email address, repositories, or any data beyond your public profile identity. The GitHub access token used during login is discarded immediately after fetching your identity -- it is never stored.

    *Session Data*

    When you log in, we create a server-side session:

    - A **session cookie** (`__Host-wrl_session`) is set in your browser. It is HttpOnly, Secure, SameSite=Lax, and expires after 7 days.
    - Only a **SHA-256 hash** of the session value is stored on our servers. The raw session value exists only in your browser cookie.

    This cookie is strictly necessary for authentication. It is not used for tracking or advertising.

    *API Keys*

    When you create an API key, we store a **SHA-256 hash** of the key for authentication. The raw key is shown once at creation and never stored.

    *IP Addresses*

    We do **not** store your raw IP address. For rate limiting and abuse prevention, we compute a **pseudonymized identifier** from your IP address using HMAC-SHA-256 with a daily rotating key. This identifier:

    - Cannot be reversed to recover your IP address
    - Changes every 24 hours (a different IP hash is produced each day)
    - Is used in operational logs for abuse detection

    This constitutes pseudonymized data under GDPR Article 4(5).

    *Capture Data*

    Each capture you submit records:

    - The **URL** you requested to capture
    - **Timestamps** (creation, completion)
    - **Capture artifacts** (screenshot, rendered HTML, HTTP headers, signed WACZ bundle)
    - The **resolved IP address of the target website** (not your IP -- this is the IP address of the server hosting the page you captured)

    Capture data is attributed to your tenant ID, not to your personal identity directly.

    *Terms of Service Acceptance*

    We record when you accepted the Terms of Service and which version you accepted.

    *Usage Data*

    We track monthly capture counts and storage usage per tenant for quota enforcement. This is operational data tied to your tenant ID.

    **Legal Basis for Processing**

    Render this as a table:

    | Data | Legal Basis | GDPR Article |
    |------|-------------|--------------|
    | GitHub identity | Contract performance (providing the service you signed up for) | Art. 6(1)(b) |
    | Session data | Contract performance (authenticating your requests) | Art. 6(1)(b) |
    | API key hashes | Contract performance (authenticating your API requests) | Art. 6(1)(b) |
    | Pseudonymized IP | Legitimate interest (abuse prevention, service security) | Art. 6(1)(f) |
    | Capture data | Contract performance (the core service you requested) | Art. 6(1)(b) |
    | Usage counters | Contract performance (quota enforcement) | Art. 6(1)(b) |

    **Data Retention**

    Render this as a table:

    | Data | Retention |
    |------|-----------|
    | Account data (GitHub ID, username) | Until you request deletion or the service is discontinued |
    | Sessions | 7 days from creation, then automatically deleted |
    | API key hashes | Until you revoke the key or request account deletion |
    | Pseudonymized IP hashes | In operational logs for up to 90 days |
    | Capture data | Indefinitely, unless removed by the operator or upon your deletion request |
    | Usage counters | Retained for the current and previous billing periods |

    **Third-Party Processors**

    Render this as a table:

    | Processor | Purpose | Data Processed | Location |
    |-----------|---------|----------------|----------|
    | Cloudflare | Infrastructure (Workers, D1 database, KV storage, R2 object storage, Browser Rendering) | All service data | Global (Cloudflare network) |
    | GitHub | Authentication (OAuth identity provider) | GitHub user ID and username during login only | USA |
    | Coralogix | Operational logging and monitoring | Pseudonymized IP, tenant ID, event metadata (no raw personal data) | EU (eu2 region) |
    | DigiCert | RFC 3161 timestamping | SHA-256 hash of capture bundle only (no personal data) | USA |
    | Stripe | Payment processing (when applicable) | Payment and billing information you provide to Stripe | USA |

    We maintain data processing agreements with our infrastructure providers as required by GDPR Article 28.

    **Your Rights**

    Under GDPR, you have the following rights regarding your personal data:

    - **Access** (Art. 15) -- request a copy of the personal data we hold about you
    - **Rectification** (Art. 16) -- request correction of inaccurate data (note: your GitHub username is automatically updated on each login)
    - **Erasure** (Art. 17) -- request deletion of your account and associated data
    - **Restriction** (Art. 18) -- request that we limit processing of your data
    - **Portability** (Art. 20) -- request your data in a structured, machine-readable format
    - **Object** (Art. 21) -- object to processing based on legitimate interest (pseudonymized IP processing)

    To exercise any of these rights, email **bp@ben-peter.com** with the subject line "Data Request". Include your GitHub username so we can locate your account. We will respond within 30 days.

    *Account Deletion*

    You may request complete deletion of your account and all associated data. Upon receiving a verified deletion request, we will:

    1. Delete your GitHub user record and all sessions
    2. Revoke all API keys
    3. Delete all capture records and stored artifacts
    4. Remove your tenant record and usage data

    Pseudonymized IP hashes in operational logs cannot be attributed back to you after deletion and will expire naturally within 90 days.

    **Data Security**

    We implement the following security measures:

    - All API keys and session tokens are stored as **SHA-256 hashes** -- raw values are never persisted
    - Session cookies use **HMAC signing**, the **`__Host-` prefix**, and the **Secure, HttpOnly, SameSite=Lax** attributes
    - **Ed25519 cryptographic signatures** ensure capture integrity
    - IP addresses are **pseudonymized** with daily key rotation
    - All data in transit is encrypted via **TLS**
    - OAuth authentication uses **PKCE** (Proof Key for Code Exchange) to prevent authorization code interception
    - Rate limiting protects against abuse at multiple levels

    **Supervisory Authority**

    If you believe your data protection rights have been violated, you have the right to lodge a complaint with a supervisory authority. The competent authority for the controller is:

    Der Hessische Beauftragte fuer Datenschutz und Informationsfreiheit
    Postfach 31 63
    65021 Wiesbaden, Germany
    https://datenschutz.hessen.de

    **International Data Transfers**

    Some of our processors (GitHub, DigiCert, Stripe) are based in the USA. Cloudflare processes data globally across its network. These transfers are conducted under appropriate safeguards, including the EU-US Data Privacy Framework and Standard Contractual Clauses where applicable.

    **Children**

    WRL is not directed at children under 16. We do not knowingly collect personal data from children. If you believe a child has provided us with personal data, contact us at bp@ben-peter.com and we will delete it.

    **Changes to This Policy**

    We may update this policy from time to time. The effective date at the top reflects the most recent revision. We will not reduce your rights under this policy without your explicit consent.

    **Disclaimer**

    This document is a reasonable-effort privacy policy for a small, early-stage project. It is not professional legal advice. If your situation requires legal certainty, consult a qualified attorney.

    ---

    #### refund-policy.html -- Refund & Dispute Policy

    Effective: 2026-03-23

    **How WRL Billing Works**

    Web Resource Ledger is a **usage-based API service**. You pay per capture. There are no subscriptions, recurring charges, or long-term commitments.

    - **Free tier**: A limited number of captures per month at no cost. If you are on the free tier, there is nothing to refund.
    - **Paid usage**: When you exceed the free tier, you pay only for the captures you use. Each capture consumes compute resources (headless browser rendering, cryptographic signing, storage) immediately and irreversibly.

    Payment is processed by **Stripe**. WRL does not store your credit card number or payment details -- Stripe handles all payment data.

    **Refund Eligibility**

    Because each capture consumes resources immediately upon submission, **completed captures are non-refundable**. Once a capture request is processed, the resources have been consumed and the artifacts (screenshot, HTML, signed WACZ bundle) have been generated and stored.

    You **may** be eligible for a refund or credit in the following cases:

    - **Service error**: Your capture failed due to a WRL system error (not a target website error) and was charged. We will credit your account or issue a refund for failed captures that were incorrectly billed.
    - **Duplicate charges**: You were charged twice for the same capture or billing period. We will refund the duplicate.
    - **Billing error**: The amount charged does not match your actual usage. We will investigate and correct the discrepancy.

    **How to Request a Refund**

    Email **bp@ben-peter.com** with:

    - Your tenant ID or GitHub username
    - The capture ID(s) or billing period in question
    - A description of the issue

    We aim to acknowledge refund requests within **3 business days** and resolve them within **10 business days**.

    **Disputes**

    If you believe a charge is incorrect, please contact us **before** opening a dispute with your payment provider. We can usually resolve billing issues faster through direct communication.

    **Direct dispute window**: Contact us within **30 days** of the charge in question. We will investigate and respond with a resolution.

    If we cannot reach a satisfactory resolution, or if you prefer, you may open a dispute through Stripe's standard process. Note that payment provider disputes may take longer to resolve.

    **Cancellation**

    There is nothing to cancel. WRL has no subscriptions or recurring charges. To stop using the service, simply stop making API requests. You will not be charged for anything you do not use.

    If you want to close your account entirely, you may request account deletion by emailing bp@ben-peter.com. See our Privacy Policy (/privacy) for details on what data is removed.

    **Contact**

    For any billing questions or disputes:

    Email: bp@ben-peter.com
    Subject line: "Billing" or "Refund Request"

    Include your tenant ID or GitHub username so we can locate your account quickly.

    **Disclaimer**

    This document is a reasonable-effort policy for a small, early-stage project. It is not professional legal advice. If your situation requires legal certainty, consult a qualified attorney.

    ---

    #### terms.html -- Terms of Service

    Convert the existing TERMS.md from the repo root to HTML. The content is:

    Effective: 2026-03-16

    **What WRL Is**

    Web Resource Ledger (WRL) is a web archival service. It captures web page screenshots, rendered HTML, and HTTP response headers, then packages them into Ed25519-signed WACZ bundles. Each capture is independently verifiable -- anyone with the capture URL can confirm the content has not been tampered with.

    **Acceptance**

    By using this API, you agree to these terms. If you do not agree, do not use the service.

    **Permitted Use**

    WRL is provided for lawful archival purposes only. You may use WRL to create verifiable records of publicly accessible web content for documentation, research, legal evidence, journalism, or personal reference.

    **Prohibited Uses**

    You may not use WRL to:

    - **Harass, stalk, or intimidate** -- capturing URLs to build dossiers on individuals, monitor someone without consent, or gather material for harassment campaigns.
    - **Archive illegal content** -- knowingly capturing child sexual abuse material (CSAM), classified government documents, or other content whose possession is unlawful.
    - **Circumvent access controls** -- capturing content behind paywalls, login walls, or authentication barriers that you are not authorized to access.
    - **Conduct surveillance** -- automated mass capture of URLs to monitor individuals or populations.
    - **Attack infrastructure** -- submitting URLs designed to exploit SSRF vulnerabilities, probe internal networks, or otherwise attack WRL or third-party systems.

    **Operator Rights**

    The operator reserves the unrestricted right to:

    - Remove any capture at sole discretion, without notice or explanation.
    - Suspend or revoke any API key at any time.
    - Block any IP address or range.
    - Modify rate limits, storage quotas, or service availability.

    No reason is required. No appeal process is guaranteed.

    **No Warranty and Limitation of Liability**

    WRL is provided "as-is" without warranty of any kind, express or implied. The operator does not guarantee availability, uptime, data durability, or permanence of captures.

    To the maximum extent permitted by applicable law, the operator's total liability for any claim arising from use of the service is limited to the amount paid for the service (zero, if the service is provided at no charge). The operator is not liable for indirect, incidental, special, or consequential damages.

    **Data Handling**

    What WRL stores for each capture:
    - The submitted URL
    - Full-page screenshots (PNG) -- up to two per capture (before and after cookie consent dismissal)
    - Rendered HTML (the DOM after JavaScript execution)
    - HTTP response headers from the target server
    - Timestamps (creation and completion)
    - A signed WACZ bundle containing all of the above

    What WRL does not store:
    - Your identity beyond the API key used for submission
    - Cookies or session data from the target site
    - Credentials or authentication tokens from the target site
    - Your IP address in the capture record (rate limiting uses IP transiently)

    Retention: Captures are stored indefinitely unless removed by the operator.

    Personal data in captures: If the captured web page contains third-party personal data, you (the submitter) are the data controller for that data under GDPR. The operator processes it on your instruction (the capture request). You are responsible for ensuring you have a lawful basis for capturing content that includes personal data.

    **Copyright and Takedown**

    WRL captures publicly accessible web content as-is. The operator does not endorse or verify the content at captured URLs.

    If you believe a capture infringes your copyright, contact the operator (see Content Policy for contact details). Include:

    - Identification of the copyrighted work
    - The WRL capture ID or URL
    - Your contact information
    - A statement of good faith belief that the use is not authorized

    The operator will review valid complaints and may remove content that infringes copyright.

    **Governing Law**

    These terms are governed by the laws of the Federal Republic of Germany.

    **Changes to Terms**

    These terms may be updated at any time. The effective date at the top of this document reflects the most recent revision. Continued use of the service after changes constitutes acceptance of the updated terms.

    **Disclaimer**

    This document is a reasonable-effort template for a small, early-stage project. It is not professional legal advice. If your use case requires legal certainty, consult a qualified attorney.

    ---

    #### content-policy.html -- Content Policy

    Convert the existing CONTENT-POLICY.md from the repo root to HTML. The content is:

    Effective: 2026-03-16

    **What WRL Stores**

    Web Resource Ledger captures publicly accessible web pages and stores: a full-page screenshot, rendered HTML, HTTP response headers, and a cryptographically signed WACZ bundle. These artifacts are retained indefinitely unless removed by the operator.

    WRL does not crawl the web. Every capture is initiated by an authenticated API request. The operator does not select, curate, or endorse the content at captured URLs.

    **Content Standards**

    WRL archives web content as-is. The presence of a capture does not imply endorsement, verification, or approval of the content at the captured URL.

    The operator does not pre-screen captured content. Captures that violate this policy may be removed after the fact.

    **Prohibited Content**

    The following captures may be removed at the operator's discretion:

    - **Harassment material** -- captures made to stalk, harass, intimidate, or build dossiers on individuals without their consent.
    - **Child sexual abuse material (CSAM)** -- any capture containing CSAM will be removed immediately and reported to the appropriate authorities.
    - **Unlawful content** -- captures of content whose possession or distribution violates applicable law.
    - **Access-controlled content** -- captures of non-public content obtained by circumventing authentication or access controls.

    **Abuse Reporting**

    If you believe a capture violates this policy, or if you are the subject of a capture and want it removed, contact us:

    Email: bp@ben-peter.com

    What to include in your report:
    - The capture ID or verification URL
    - The nature of your concern (e.g., harassment, copyright, illegal content)
    - Evidence of authority or ownership, if applicable
    - Your contact information for follow-up

    What to expect:
    - We aim to acknowledge reports within 3 business days.
    - We aim to provide a substantive response within 5 business days.
    - We will review the reported capture and may remove it if it violates this policy.
    - For CSAM reports, we act immediately without waiting for the review cycle.

    These timelines are goals for a small project maintained by a solo operator. Urgent matters (CSAM, imminent harm) are prioritized.

    **Copyright Complaints**

    If you believe a capture infringes your copyright:

    - Identify the copyrighted work.
    - Provide the WRL capture ID or verification URL.
    - Include your contact information.
    - State your good faith belief that the capture is not authorized by the copyright owner, its agent, or the law.

    The operator will review valid copyright complaints and may remove captures that infringe copyright.

    **Disclaimer**

    This document is a reasonable-effort template for a small, early-stage project. It is not professional legal advice. If your situation requires legal certainty, consult a qualified attorney.

    ---

    ### Cross-links between pages

    In the Terms page, the copyright section mentions "see Content Policy for contact details". Link this to `/content-policy`.

    In the Refund Policy page, the cancellation section mentions "See our Privacy Policy". Link this to `/privacy`.

    ### Sitemap update

    Replace the contents of `landing/public/sitemap.xml` with:

    ```xml
    <?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url>
        <loc>https://webresourceledger.com/</loc>
        <lastmod>2026-03-23</lastmod>
        <changefreq>monthly</changefreq>
        <priority>1.0</priority>
      </url>
      <url>
        <loc>https://webresourceledger.com/terms</loc>
        <lastmod>2026-03-23</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
      </url>
      <url>
        <loc>https://webresourceledger.com/privacy</loc>
        <lastmod>2026-03-23</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
      </url>
      <url>
        <loc>https://webresourceledger.com/refund-policy</loc>
        <lastmod>2026-03-23</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
      </url>
      <url>
        <loc>https://webresourceledger.com/content-policy</loc>
        <lastmod>2026-03-23</lastmod>
        <changefreq>yearly</changefreq>
        <priority>0.3</priority>
      </url>
    </urlset>
    ```

    ### File ownership

    You own these files exclusively:
    - `landing/public/privacy.html` (new)
    - `landing/public/refund-policy.html` (new)
    - `landing/public/terms.html` (new)
    - `landing/public/content-policy.html` (new)
    - `landing/public/index.html` (footer update only)
    - `landing/public/404.html` (header + footer update)
    - `landing/public/sitemap.xml` (update)

    ### Constraints

    - Flat `.html` files in `landing/public/` (NOT subdirectories like `privacy/index.html`). Cloudflare Workers Static Assets serves `privacy.html` at `/privacy` automatically.
    - No JavaScript on any page. `script-src 'none'` CSP is in effect.
    - No Open Graph / Twitter Card meta tags on legal pages (not needed).
    - No JSON-LD structured data on legal pages (not applicable).
    - Use HTML entities for German characters: `&auml;` for ae, `&middot;` for the separator dot.
    - All internal links use relative paths (`/terms`, `/privacy`, etc.), not absolute URLs.
    - The refund policy links to `/privacy` (not to the GitHub markdown file).
    - The terms page links to `/content-policy` (not to the GitHub markdown file).
    - Tables in the privacy policy use `<table>`, `<thead>`, `<tbody>`, `<th>`, `<td>` elements -- the `.article table` CSS handles styling.
    - Use `<code>` elements for technical identifiers like `__Host-wrl_session`, `read:user`, etc.
    - Include the `<!-- Shared header -->` and `<!-- Shared footer -->` HTML comments on all pages for maintainability.
    - Do NOT modify `landing.css` or `design-system.css` -- CSS is already done.

    ### Deliverables
    - 4 new HTML files: `privacy.html`, `refund-policy.html`, `terms.html`, `content-policy.html`
    - Updated footer in `index.html`
    - Updated header + footer in `404.html`
    - Updated `sitemap.xml`

- **Deliverables**: 4 new HTML files, updated index.html footer, updated 404.html header+footer, updated sitemap.xml
- **Success criteria**: All 4 legal pages accessible at clean URLs, footer consistent across all 6 pages, sitemap includes all pages, all internal links correct, no JavaScript

---

## Cross-Cutting Coverage

- **Testing**: Not included. These are static HTML pages with no logic, no JavaScript, no build step. Visual verification (does it render correctly in a browser) is the only meaningful test, handled by the user at PR review. Phase 6 test execution will find nothing to run.
- **Security**: Covered during planning by security-minion. Key findings incorporated: accurate data processing inventory in privacy policy, CSP compatibility confirmed (no JS), session cookie documented as strictly necessary. No runtime security surface added.
- **Usability -- Strategy**: Not included as a separate task. These are commodity legal pages -- the user journey is "find the policy, read it." The article layout (72ch max-width, clear heading hierarchy) and footer restructuring (two labeled nav columns) address readability and findability. No novel UX decisions to review.
- **Usability -- Design**: Not included. The design system tokens and existing visual language provide all needed guidance. Legal pages are long-form text with headings and lists -- the article CSS handles this.
- **Documentation**: Not included as a separate task. The pages themselves are the documentation (legal policies). No API or architecture changes. Phase 8 will assess if anything else needs updating.
- **Observability**: Not included. Static HTML pages served by Cloudflare's edge. No runtime components, no logging, no metrics beyond what Cloudflare provides by default.

## Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**: none
  - ux-design-minion: Not selected. No novel UI components or interaction patterns -- the article layout is standard long-form prose using existing design tokens.
  - accessibility-minion: Not selected. The pages are semantic HTML (headings, lists, tables, nav landmarks) with proper aria labels. The existing skip link, focus styles, and color contrast from the design system apply. No custom widgets or interactions that need accessibility review.
  - sitespeed-minion: Not selected. Static HTML pages with two CSS files, no JavaScript, no images in the content. Performance is inherently excellent.
  - observability-minion: Not selected. No runtime components.
  - user-docs-minion: Not selected. The legal pages are the user-facing content. No separate documentation needed.

## Decisions

- **Footer nav structure: two column layout vs. single flat list**
  Chosen: Two `<nav>` elements with `aria-label` ("Product" and "Legal") and `<h4>` headings, arranged in columns.
  Over: Keeping the existing single flat `<nav>` with all links in one row (current pattern).
  Why: Stripe reviewers need to find legal links quickly. Semantic grouping with labeled nav regions also improves screen reader navigation. The site now has 10+ footer links which don't fit well in a single row.

- **Flat .html files vs. directory-based (privacy/index.html)**
  Chosen: Flat files (`privacy.html`, `terms.html`, etc.) in `landing/public/`.
  Over: Directory structure (`privacy/index.html`) which some static site generators prefer.
  Why: Cloudflare Workers Static Assets `auto-trailing-slash` mode produces cleaner canonical URLs (`/privacy` vs `/privacy/`) from flat files and avoids a 307 redirect when users type the path without trailing slash. Matches existing `index.html` and `404.html` pattern.

## Risks and Mitigations

1. **MEDIUM: No DPAs verified** -- The privacy policy states "We maintain data processing agreements with our infrastructure providers." Ben should verify that Cloudflare's and Coralogix's DPAs are in place. Cloudflare's standard ToS includes a DPA. Coralogix likely has one too. This is a Ben action item, not a code task.

2. **LOW: Footer duplication across 6 files** -- The restructured footer is ~30 lines across 6 files. HTML comment markers (`<!-- Shared footer: update in all pages -->`) mitigate this. If the site grows beyond these pages, a build step or server-side includes would be warranted. For 6 pages, copy-paste is the right call per YAGNI.

3. **LOW: Existing GitHub links for Terms and Content Policy** -- The current footer links to GitHub markdown files. After this change, they point to on-site pages. The GitHub markdown files should remain (they're useful for contributors) but the canonical versions are now on the website. No code change needed -- this is informational.

4. **LOW: Refund Policy dispute window** -- 30-day direct contact window vs. Stripe's 120-day dispute window. The 30-day window encourages direct resolution before Stripe gets involved. After 30 days, users can still dispute through Stripe. This is intentional.

## Execution Order

```
Task 1: CSS styles (article + footer)
  |
  v
Task 2: HTML pages + footer updates + sitemap  [gate: none]
  |
  v
[Phase 3.5: Architecture review]
  |
  v
[Phase 4: Execution]
```

Batch 1: Task 1 (no dependencies)
Batch 2: Task 2 (blocked by Task 1)

No mid-execution approval gates. The plan approval gate is sufficient -- legal content is fully specified in the task prompts and reviewable in the security-minion scratch file.

## Verification Steps

After all tasks complete:
1. Each page loads at its clean URL: `/privacy`, `/terms`, `/refund-policy`, `/content-policy`
2. Footer is identical across all 6 pages (index, 404, privacy, terms, refund-policy, content-policy)
3. Header on sub-pages uses `/#` prefixed anchor links
4. All internal links work (footer links, cross-references between legal pages)
5. `sitemap.xml` contains all 5 URLs
6. `robots.txt` still references the correct sitemap URL
7. No JavaScript on any page (CSP compatible)
8. Pages are crawlable (`robots: index, follow` meta tag)
