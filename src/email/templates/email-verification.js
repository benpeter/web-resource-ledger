/*
 * email-verification.js -- Transactional email template for email address verification.
 *
 * Sent when a tenant sets a new pending email via PUT /v1/account/notifications
 * or requests a resend via POST /v1/account/notifications/resend-verification.
 *
 * This is a TRANSACTIONAL email -- it MUST NOT include an unsubscribe link.
 * Adding one would allow users to disable capture failure alerts as a side effect
 * of dismissing a verification email, which is a destructive and unexpected action.
 *
 * Data: { verificationUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the email verification transactional email.
 *
 * @param {object} data
 * @param {string} data.verificationUrl  Full verification URL (expires 24h)
 * @returns {{ html: string, text: string, subject: string }}
 */
export function emailVerificationEmail({ verificationUrl }) {
  const safeVerificationUrl = escapeHtml(verificationUrl || '');

  const subject = 'Verify your email address';
  const preheaderText = 'Confirm your new notification email address for Web Resource Ledger.';

  const bodyHtml = `
    <!-- Header banner -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.infoBg};border-left:4px solid ${colors.info};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.infoText};line-height:1.2;">Verify your email address</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 16px 0;">You recently added a new notification email address to your Web Resource Ledger account.</p>

          <p style="margin:0 0 24px 0;">Click the button below to confirm ownership of this address. Until verified, notifications will continue to be sent to your previous address (if any).</p>

          <!-- CTA button: table-based for Outlook -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
            <tr>
              <td style="border-radius:4px;background-color:${colors.primary};">
                <a href="${safeVerificationUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:4px;">Verify Email Address</a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px 0;font-size:12px;color:${colors.textMuted};">This link expires in 24 hours.</p>

          <p style="margin:0;font-size:12px;color:${colors.textMuted};">If you did not request this change, you can safely ignore this email. Your account has not been modified.</p>

        </td>
      </tr>
    </table>`;

  // Transactional footer: no unsubscribe link
  const html = `<!DOCTYPE html>
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
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheaderText)}</div>

<!-- Outer wrapper table -->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${colors.bg};">
  <tr>
    <td align="center" style="padding:32px 16px;">

      <!-- Inner container (600px) -->
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">

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

        <!-- Footer: transactional, no unsubscribe link -->
        <tr>
          <td style="padding:24px 0 0 0;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="font-family:${fontSans};font-size:12px;color:${colors.textMuted};line-height:1.5;">
                  <p style="margin:0 0 8px 0;">Web Resource Ledger &mdash; Gerhard Benjamin Peter &mdash; Marburg, Germany</p>
                  <p style="margin:0;">
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

  const text = [
    'VERIFY YOUR EMAIL ADDRESS',
    '=========================',
    '',
    'You recently added a new notification email address to your Web Resource Ledger account.',
    '',
    'Click the link below to confirm ownership of this address. Until verified, notifications',
    'will continue to be sent to your previous address (if any).',
    '',
    `Verify: ${verificationUrl || ''}`,
    '',
    'This link expires in 24 hours.',
    '',
    'If you did not request this change, you can safely ignore this email.',
    '',
    '---',
    'Web Resource Ledger -- webresourceledger.com',
  ].join('\n');

  return { html, text, subject };
}
