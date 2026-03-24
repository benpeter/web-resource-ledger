/*
 * capture-failure.js -- Email template for capture failure notifications.
 *
 * Sent when a capture reaches the 'failed' terminal state and the tenant
 * has capture_failure notifications enabled.
 *
 * Data: { url, errorCategory, failedAt, captureDetailUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the capture-failure email.
 *
 * @param {object} data
 * @param {string} data.url               The URL that failed to capture
 * @param {string} data.errorCategory     Short error category string
 * @param {string} data.failedAt          ISO timestamp of failure
 * @param {string} data.captureDetailUrl  Full URL to the capture detail page
 * @param {string} data.unsubscribeUrl    Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function captureFailureEmail({ url, errorCategory, failedAt, captureDetailUrl, unsubscribeUrl }) {
  const safeUrl = escapeHtml(url || '');
  const safeErrorCategory = escapeHtml(errorCategory || 'unknown');
  const safeFailedAt = escapeHtml(failedAt || '');
  const safeCaptureDetailUrl = escapeHtml(captureDetailUrl || '');

  const subject = `Capture failed: ${url || '(unknown)'}`;
  const preheaderText = `Your capture of ${url || 'a URL'} failed. View details and retry.`;

  const bodyHtml = `
    <!-- Alert banner: error style -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.errorBg};border-left:4px solid ${colors.error};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.errorText};line-height:1.2;">Capture failed</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 20px 0;">Your scheduled capture could not be completed.</p>

          <!-- Details grid -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};width:120px;">URL</td>
              <td style="padding:6px 0;font-size:14px;color:${colors.text};word-break:break-all;">${safeUrl}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};">Error</td>
              <td style="padding:6px 0;font-size:14px;color:${colors.errorText};">${safeErrorCategory}</td>
            </tr>
            <tr>
              <td style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};">Failed at</td>
              <td style="padding:6px 0;font-size:14px;color:${colors.text};">${safeFailedAt}</td>
            </tr>
          </table>

          <!-- CTA button: table-based for Outlook -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.primary};">
                <a href="${safeCaptureDetailUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:4px;">View Capture Details</a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  const text = [
    'CAPTURE FAILED',
    '==============',
    '',
    `URL: ${url || '(unknown)'}`,
    `Error: ${errorCategory || 'unknown'}`,
    `Failed at: ${failedAt || '(unknown)'}`,
    '',
    `View capture details: ${captureDetailUrl || ''}`,
    '',
    '---',
    `Unsubscribe from capture failure alerts: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
