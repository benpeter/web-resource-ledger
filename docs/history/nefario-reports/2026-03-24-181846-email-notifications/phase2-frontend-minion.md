# Domain Plan Contribution: frontend-minion

## Recommendations

### 1. Template Architecture: JS Module Template Literals (No Template Engine)

The project already has a well-established pattern for generating HTML from Workers: `verify-page.js` builds a complete verification page as a template literal, composing the design system CSS inline via `${DESIGN_SYSTEM_CSS}`. The UI shell (`ui-shell.js`) follows the same pattern -- template literals with string interpolation, no filesystem, no template engine.

**Recommendation: Follow the same pattern.** Create a `src/email/` directory with one module per template type and a shared module for the email layout scaffold. Template literals are the right choice here because:

- Zero dependencies: no handlebars, no mjml, no juice. This aligns with the project's "lean and mean" philosophy and the CLAUDE.md preference for vanilla solutions.
- Workers-native: template strings work identically in the Workers runtime with no build step.
- The project already proves this pattern works at scale (`ui-css.js` is 300+ lines of CSS as a template literal; `verify-page.js` is 400+ lines of HTML).

A template engine would add a dependency for marginal benefit. The six notification types are structurally simple (header, body content, CTA button, footer) -- not complex enough to justify Handlebars/EJS overhead.

### 2. Shared Email Layout with Inline Styles

Email clients strip `<style>` blocks and `<link>` elements. CSS custom properties (`var(--color-primary)`) do not work in any email client. Every style must be inlined on the element.

**Do NOT reuse `design-system.css` directly.** Instead, create a standalone email design token object in JS that maps the same brand values to inline-style-ready constants:

```js
// src/email/email-tokens.js
export const EMAIL = {
  // Brand colors -- same hex values as design-system.css, resolved for inline use
  colorText: '#1e2a36',
  colorTextMuted: '#6e6a66',
  colorBg: '#f7f6f5',
  colorSurface: '#ffffff',
  colorBorder: '#dddbd8',
  colorPrimary: '#2a3444',
  colorPrimaryText: '#f8f8fa',
  colorAccent: '#3d7c9a',
  colorAccentText: '#f8f8fa',
  colorSuccess: '#2e7d32',
  colorSuccessBg: '#e8f5e9',
  colorError: '#c62828',
  colorErrorBg: '#ffebee',
  colorWarning: '#e6a817',
  colorWarningBg: '#fff8e1',

  // Typography -- use web-safe stack, no custom fonts in email
  fontSans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  fontMono: "Menlo, Consolas, 'Courier New', monospace",

  // Spacing (px values, not rem -- email clients handle px more consistently)
  space2: '8px',
  space3: '12px',
  space4: '16px',
  space6: '24px',
  space8: '32px',

  // Layout
  maxWidth: '600px',
  borderRadius: '4px',
};
```

This gives us brand consistency without depending on CSS custom properties. When design tokens change in `design-system.css`, the email tokens need a manual sync -- but that is an acceptable tradeoff given how rarely tokens change and how different the email rendering context is.

### 3. Proposed File Structure

```
src/email/
  email-tokens.js      -- Brand color/typography/spacing constants for inline styles
  email-layout.js      -- Shared wrapper: DOCTYPE, head, body table, header, footer, unsubscribe link
  email-escape.js      -- HTML escaping (reuse escapeHtml from verify-page.js, or co-locate)
  email-text.js        -- Plain text generation helpers (strip HTML, word wrap)
  templates/
    capture-failure.js       -- { html, text } for capture failure notification
    approaching-limit.js     -- { html, text } for 80% free limit warning
    limit-reached.js         -- { html, text } for 100% free limit hit
    invoice-generated.js     -- { html, text } for invoice finalized
    payment-failure.js       -- { html, text } for payment failure
    schedule-digest.js       -- { html, text } for weekly schedule digest
```

Each template module exports a single function:

```js
// src/email/templates/capture-failure.js
import { emailLayout } from '../email-layout.js';
import { escapeHtml } from '../email-escape.js';
import { EMAIL } from '../email-tokens.js';

/**
 * @param {object} data
 * @param {string} data.captureId
 * @param {string} data.url
 * @param {string} data.errorCategory
 * @param {string} data.failedAt
 * @param {string} data.captureDetailUrl
 * @param {string} data.unsubscribeUrl
 * @returns {{ html: string, text: string, subject: string }}
 */
export function captureFailureEmail(data) {
  const subject = `Capture failed: ${data.url}`;

  const bodyHtml = `
    <tr><td style="padding: ${EMAIL.space6} ${EMAIL.space8};">
      <h1 style="font-family: ${EMAIL.fontSans}; font-size: 20px; color: ${EMAIL.colorText}; margin: 0 0 ${EMAIL.space4};">
        Capture Failed
      </h1>
      <p style="font-family: ${EMAIL.fontSans}; font-size: 14px; color: ${EMAIL.colorText}; line-height: 1.5; margin: 0 0 ${EMAIL.space4};">
        A capture of <strong>${escapeHtml(data.url)}</strong> failed on ${escapeHtml(data.failedAt)}.
      </p>
      <!-- ... error detail, CTA button ... -->
    </td></tr>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl: data.unsubscribeUrl });

  const text = [
    'Capture Failed',
    '',
    `URL: ${data.url}`,
    `Error: ${data.errorCategory}`,
    `Time: ${data.failedAt}`,
    '',
    `View details: ${data.captureDetailUrl}`,
    '',
    `Unsubscribe: ${data.unsubscribeUrl}`,
  ].join('\n');

  return { html, text, subject };
}
```

### 4. The Email Layout Scaffold (email-layout.js)

The layout function wraps body content in the full HTML email boilerplate. This is where every email client quirk is handled once:

```js
export function emailLayout({ bodyHtml, unsubscribeUrl, preheaderText = '' }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>
  td, th, div, p, a, h1, h2, h3, h4, h5, h6 { font-family: 'Segoe UI', sans-serif; }
</style>
<![endif]-->
<title>Web Resource Ledger</title>
</head>
<body style="margin: 0; padding: 0; background-color: ${EMAIL.colorBg}; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">
${preheaderText ? `<div style="display: none; max-height: 0; overflow: hidden;">${escapeHtml(preheaderText)}</div>` : ''}
<!-- Outer wrapper table -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${EMAIL.colorBg};">
<tr><td align="center" style="padding: ${EMAIL.space8} ${EMAIL.space4};">

<!-- Inner container -->
<table role="presentation" cellpadding="0" cellspacing="0" width="${EMAIL.maxWidth}" style="max-width: ${EMAIL.maxWidth}; width: 100%;">

  <!-- Header -->
  <tr><td style="padding: ${EMAIL.space4} ${EMAIL.space8};">
    <span style="font-family: ${EMAIL.fontSans}; font-size: 16px; font-weight: 600; color: ${EMAIL.colorPrimary}; letter-spacing: 0.01em;">
      Web Resource Ledger
    </span>
  </td></tr>

  <!-- Content card -->
  <tr><td>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: ${EMAIL.colorSurface}; border: 1px solid ${EMAIL.colorBorder}; border-radius: ${EMAIL.borderRadius};">
      ${bodyHtml}
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding: ${EMAIL.space6} ${EMAIL.space8}; text-align: center;">
    <p style="font-family: ${EMAIL.fontSans}; font-size: 12px; color: ${EMAIL.colorTextMuted}; margin: 0 0 ${EMAIL.space2};">
      Web Resource Ledger &middot; Gerhard Benjamin Peter &middot; Marburg, Germany
    </p>
    <p style="font-family: ${EMAIL.fontSans}; font-size: 12px; color: ${EMAIL.colorTextMuted}; margin: 0;">
      <a href="${escapeHtml(unsubscribeUrl)}" style="color: ${EMAIL.colorTextMuted}; text-decoration: underline;">Unsubscribe</a>
      &middot;
      <a href="https://webresourceledger.com" style="color: ${EMAIL.colorTextMuted}; text-decoration: underline;">Website</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}
```

### 5. HTML and Plain Text from the Same Data Model

Each template function receives a single data object and returns `{ html, text, subject }`. The plain text version is NOT derived by stripping HTML tags from the HTML version -- that produces poor results (lost structure, leftover entities, broken links). Instead, each template explicitly constructs both versions from the same input data.

The plain text version follows these conventions:
- Subject line as first line, followed by a blank line
- Key-value pairs for structured data (`URL: https://...`)
- Blank lines between sections
- URLs written out in full (not hidden behind anchor text)
- Hard-wrapped at ~72 characters for readability in text-only clients
- Unsubscribe link at the bottom

A shared `wrapText(str, width)` helper in `email-text.js` handles word wrapping for the text version.

### 6. Email Client Compatibility Constraints

These constraints must be followed in every template:

**Layout**:
- Use `<table role="presentation">` for all layout. No `<div>` layout, no flexbox, no grid. Tables are the only reliable layout mechanism across email clients.
- `cellpadding="0" cellspacing="0"` on every table.
- `role="presentation"` on every layout table so screen readers do not announce them as data tables.
- Maximum width 600px (standard email container width).
- Use `width` attributes on `<table>` and `<td>` elements, not just CSS `width`.

**CSS**:
- ALL styles must be inline (`style="..."` on each element). No `<style>` blocks in `<body>` (Gmail strips them on non-Google accounts; many webmail clients strip them entirely).
- No CSS custom properties (`var()`). No `calc()`. No `clamp()`.
- No shorthand properties in Outlook (`font`, `background`, `border`). Use longhand: `font-family`, `font-size`, `background-color`, `border-width`, `border-style`, `border-color`.
- No `max-width` without a `width` fallback (Outlook ignores `max-width`).
- No `rem` or `em` units -- use `px` throughout.

**Outlook (Word rendering engine) specifics**:
- Include the `xmlns:o="urn:schemas-microsoft-com:office:office"` namespace on `<html>`.
- Include `<!--[if mso]>` conditional comments for Outlook-specific table widths and font stacks.
- `border-radius` does not work in Outlook desktop (Windows). Accept square corners there -- it degrades gracefully.
- Background colors on `<td>` work; background colors on `<div>` inside tables may not.
- `<img>` elements need explicit `width` and `height` attributes (Outlook does not respect CSS-only sizing).

**Gmail specifics**:
- Gmail strips `<style>` blocks in non-Gmail contexts (when viewed via IMAP in other clients). Inline styles are mandatory.
- Gmail clips emails at ~102KB. Keep total HTML under 80KB to be safe. This should not be an issue given the template simplicity.
- Gmail removes `class` and `id` attributes. Do not rely on them.

**Apple Mail specifics**:
- Include `<meta name="x-apple-disable-message-reformatting">` to prevent auto-formatting of dates, addresses, and phone numbers.
- Apple Mail renders CSS well compared to Outlook, but inline styles should still be used for consistency.

**Dark Mode**:
- Include `<meta name="color-scheme" content="light">` and `<meta name="supported-color-schemes" content="light">` to signal the email is designed for light mode only. Attempting to support email dark mode across all clients is extremely fragile and not worth the investment for a transactional notification.
- The brand's light background (`#f7f6f5`) and dark text (`#1e2a36`) provide sufficient contrast that dark-mode inversion produces readable results even without explicit dark-mode styles.

**Accessibility**:
- `lang="en"` on `<html>`.
- `role="presentation"` on all layout tables.
- Semantic use of `<h1>`, `<p>`, `<a>` within table cells.
- Sufficient color contrast (the existing design system tokens already meet WCAG AA -- `#1e2a36` on `#ffffff` is 14.5:1).
- `alt` text on any images (though the plan is to use zero images -- text and background colors only).
- Meaningful link text (not "click here").

### 7. CTA (Call-to-Action) Button Pattern

Buttons in email must be built as tables, not styled `<a>` tags, to work in Outlook:

```html
<table role="presentation" cellpadding="0" cellspacing="0" style="margin: 0 auto;">
  <tr>
    <td style="background-color: #2a3444; border-radius: 4px; padding: 12px 24px;">
      <a href="https://..." style="font-family: -apple-system, ...; font-size: 14px; font-weight: 600; color: #f8f8fa; text-decoration: none; display: inline-block;">
        View Capture Details
      </a>
    </td>
  </tr>
</table>
```

This produces a clickable button area in all clients. Outlook ignores `border-radius` but the background color still works.

### 8. Preheader Text

Every email should include a hidden preheader -- the snippet text shown in inbox previews next to the subject line. This is accomplished with a hidden `<div>` at the top of the `<body>`:

```html
<div style="display: none; max-height: 0; overflow: hidden;">
  Your capture of example.com failed. View details...
</div>
```

Each template should define a preheader appropriate to its notification type. The `emailLayout` function accepts it as a parameter.

### 9. escapeHtml Reuse

The existing `escapeHtml` function in `verify-page.js` is exactly what is needed. However, it is currently only exported from that module. The cleanest approach is either:

- **Option A**: Move `escapeHtml` to a shared utility module (`src/escape.js` or `src/util.js`) and import it from both `verify-page.js` and the email templates.
- **Option B**: Create `src/email/email-escape.js` that re-exports or duplicates the function.

Option A is cleaner but touches an existing module. Given the project's structure, Option A is recommended -- `escapeHtml` is a general-purpose utility, not page-specific.

### 10. RFC 8058 List-Unsubscribe Headers

The email sending layer (not the template) must set these HTTP headers on the email:

```
List-Unsubscribe: <https://api.webresourceledger.com/v1/notifications/unsubscribe?token=SIGNED_TOKEN>
List-Unsubscribe-Post: List-Unsubscribe=One-Click
```

This enables one-click unsubscribe in Gmail and Apple Mail. The `List-Unsubscribe` URL should also appear as a clickable link in the email footer (handled by the layout template). The token should be an HMAC-signed blob containing the tenant ID and notification type, verifiable without database lookup -- this is a security-minion concern but affects the template because the URL must be passed as data.

---

## Proposed Tasks

### Task 1: Create email token constants module
- **File**: `src/email/email-tokens.js`
- **Deliverable**: JS module exporting brand color, typography, and spacing constants as plain strings (hex colors, px values) suitable for inline CSS in email templates.
- **Dependencies**: None. References `src/design-system.css` for the source values but has no code dependency.
- **Effort**: XS

### Task 2: Create shared email layout function
- **File**: `src/email/email-layout.js`
- **Deliverable**: Function that wraps body HTML in a complete email document with DOCTYPE, MSO conditionals, header (wordmark), footer (operator info + unsubscribe link + website link), and outer table structure. Accepts `{ bodyHtml, unsubscribeUrl, preheaderText }`.
- **Dependencies**: Task 1 (email-tokens.js), shared escapeHtml utility.
- **Effort**: S

### Task 3: Extract escapeHtml to shared utility
- **File**: `src/escape.js` (new), update `src/verify-page.js` to import from it.
- **Deliverable**: `escapeHtml` function moved to a shared module, imported by both verify-page.js and email templates.
- **Dependencies**: None. Must not break existing verify-page tests.
- **Effort**: XS

### Task 4: Create plain text generation helpers
- **File**: `src/email/email-text.js`
- **Deliverable**: `wrapText(str, width)` function for word wrapping plain text at ~72 chars. Possibly a `formatKeyValue(key, value)` helper.
- **Dependencies**: None.
- **Effort**: XS

### Task 5: Implement 6 email templates
- **Files**: `src/email/templates/capture-failure.js`, `approaching-limit.js`, `limit-reached.js`, `invoice-generated.js`, `payment-failure.js`, `schedule-digest.js`
- **Deliverable**: Each module exports a function taking a typed data object and returning `{ html, text, subject }`. Each uses the shared layout. Each has an appropriate preheader.
- **Dependencies**: Tasks 1-4.
- **Effort**: M (six templates, each straightforward but needs careful inline CSS work)
- **Sub-tasks by template**:
  - **Capture failure**: Alert-style (error color accent), shows URL, error category, timestamp, CTA to capture detail page.
  - **Approaching free limit**: Warning-style (warning color accent), shows usage count (e.g., "160 of 200"), CTA to add payment method.
  - **Free limit reached**: Error-style, shows 200/200, CTA to add payment method. More urgent tone than approaching.
  - **Invoice generated**: Info-style, shows amount in EUR, CTA to Stripe Customer Portal.
  - **Payment failure**: Error-style, shows grace period deadline, CTA to update payment method.
  - **Weekly schedule digest**: Info-style, table layout showing URLs captured, success/failure counts per schedule, next scheduled runs. This is the most complex template due to the tabular data.

### Task 6: Template rendering tests
- **Files**: `test/email-templates.test.js`
- **Deliverable**: Unit tests for each template: (a) returns valid HTML structure, (b) escapes user-provided data, (c) includes unsubscribe link in both HTML and text, (d) plain text version includes all key data points, (e) subject line is reasonable. Snapshot tests for HTML output to catch unintended layout changes.
- **Dependencies**: Task 5.
- **Effort**: S

---

## Risks and Concerns

### 1. Outlook rendering is a minefield
Outlook desktop (Windows) uses the Microsoft Word rendering engine, not a browser engine. This means many CSS properties silently fail. The table-based layout approach mitigates this, but every template must be manually tested in Outlook. There is no automated way to guarantee Outlook rendering correctness.

**Mitigation**: Keep templates structurally simple -- one-column layout, no images, no complex nesting. The notification types do not require complex layouts. The weekly digest table is the highest risk for Outlook rendering issues.

### 2. Inline CSS maintenance burden
Every style is repeated on every element. A color change requires finding and updating every occurrence across six template files.

**Mitigation**: The `EMAIL` token object in `email-tokens.js` centralizes values as JS constants used in template literals. A token change only requires editing one file, and template strings automatically pick up the new value. This is as DRY as inline-style email allows.

### 3. Template string size and readability
HTML email boilerplate is verbose (MSO conditionals, nested tables, repeated inline styles). Template literal files for email will be longer than the equivalent web UI templates.

**Mitigation**: The shared layout handles the boilerplate. Individual templates only contain their body content (the content inside the "card" table). Keep each template focused on its body content -- the layout handles the rest.

### 4. No real email client testing in CI
Automated tests can verify the template produces valid HTML and includes required content, but cannot verify rendering across email clients.

**Mitigation**: Manual testing with Litmus or Email on Acid before the PR merges. Alternatively, send test emails to personal accounts in Gmail, Apple Mail, and Outlook.com. Document the test results in the PR description.

### 5. Email HTML size limit (Gmail 102KB clip)
If templates grow large (unlikely for transactional email, but the weekly digest with many schedules could theoretically get large), Gmail will clip the email.

**Mitigation**: The weekly digest should cap the number of displayed schedules (e.g., top 20) and include a "View all in dashboard" link. Monitor template HTML size in tests.

### 6. escapeHtml extraction could break tests
Moving `escapeHtml` from `verify-page.js` to a shared module changes the import path. Existing tests that import from `verify-page.js` may break.

**Mitigation**: After the move, `verify-page.js` re-exports `escapeHtml` from the shared module for backward compatibility. Or update test imports. Either way, this is a low-risk mechanical change.

---

## Additional Agents Needed

**ux-design-minion**: The email templates are user-facing. While I have proposed the structural approach and email client compatibility constraints, the visual design details (exact heading sizes, spacing ratios, color application for alert vs info vs warning notifications, CTA button styling) should be reviewed by ux-design-minion for brand consistency with the landing page and docs site.

**test-minion**: The template tests need a strategy for verifying HTML structure without brittle snapshot assertions. test-minion should advise on whether to use DOM parsing (e.g., cheerio or a lightweight HTML parser compatible with Workers tests) or string-matching assertions for template output verification.
