/*
 * email-layout.js -- Shared HTML email shell for all WRL notification emails.
 *
 * Wraps body HTML in a complete, inbox-compatible email document:
 *   - Outlook XML namespaces and MSO conditional comments
 *   - Apple Mail reformatting suppression
 *   - Light-mode-only color scheme declaration
 *   - Table-based outer/inner layout (600px container)
 *   - Header (wordmark), content card, footer
 *   - Hidden preheader div for inbox preview text
 *
 * Rules:
 *   - All styles inline -- no <style> blocks (stripped by most email clients)
 *   - No CSS custom properties, no calc(), no rem units -- px throughout
 *   - All layout via table role="presentation"
 *   - No images -- text and color only
 *   - Total HTML target: under 80KB (Gmail clips at 102KB)
 *
 * Tests: test/email-templates.test.js
 */

import { escapeHtml } from '../verify-page.js';
import { tokens } from './email-tokens.js';

const { colors, fontSans, maxWidth } = tokens;

/**
 * Wrap body HTML in a complete email document.
 *
 * @param {object} opts
 * @param {string} opts.bodyHtml         Inner HTML rendered by a template
 * @param {string} opts.unsubscribeUrl   Full unsubscribe URL (will be escaped)
 * @param {string} opts.preheaderText    Short preview text shown in inbox (plain text)
 * @returns {string}  Complete HTML email document
 */
export function emailLayout({ bodyHtml, unsubscribeUrl, preheaderText }) {
  const safeUnsub = escapeHtml(unsubscribeUrl || '');
  const safePreheader = escapeHtml(preheaderText || '');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Web Resource Ledger</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<style>
td, th { font-family: ${fontSans}; }
</style>
<![endif]-->
</head>
<body style="margin:0;padding:0;background-color:${colors.bg};font-family:${fontSans};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">

<!-- Preheader: hidden text shown in inbox preview -->
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${safePreheader}</div>

<!-- Outer wrapper table -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${colors.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Inner container (600px) -->
      <table role="presentation" width="${maxWidth}" cellspacing="0" cellpadding="0" border="0" style="max-width:${maxWidth}px;width:100%;">

        <!-- Header row: wordmark -->
        <tr>
          <td style="padding:0 0 24px 0;">
            <span style="font-family:${fontSans};font-size:16px;font-weight:600;color:${colors.primary};letter-spacing:0.01em;">Web Resource Ledger</span>
          </td>
        </tr>

        <!-- Content card -->
        <tr>
          <td style="background-color:${colors.surface};border:1px solid ${colors.border};border-radius:6px;overflow:hidden;">
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:24px 0 0 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="font-family:${fontSans};font-size:12px;color:${colors.textMuted};line-height:1.5;">
                  <p style="margin:0 0 8px 0;">Web Resource Ledger &mdash; Gerhard Benjamin Peter &mdash; Marburg, Germany</p>
                  <p style="margin:0;">
                    <a href="${safeUnsub}" style="color:${colors.textMuted};text-decoration:underline;">Unsubscribe</a>
                    &nbsp;&middot;&nbsp;
                    <a href="https://webresourceledger.com" style="color:${colors.textMuted};text-decoration:underline;">webresourceledger.com</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

      </table>
      <!-- /Inner container -->

    </td>
  </tr>
</table>
<!-- /Outer wrapper table -->

</body>
</html>`;
}
