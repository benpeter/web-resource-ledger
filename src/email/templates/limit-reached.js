/*
 * limit-reached.js -- Email template for quota-limit-reached notifications.
 *
 * Sent when a tenant exhausts their free captures for the billing period.
 * More urgent in tone than approaching-limit. Sent at most once per period.
 *
 * Data: { used, limit, period, addPaymentUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the limit-reached email.
 *
 * @param {object} data
 * @param {number} data.used            Captures used this period
 * @param {number} data.limit           Free capture limit for this period
 * @param {string} data.period          Billing period string, e.g. "March 2026"
 * @param {string} data.addPaymentUrl   URL to add a payment method
 * @param {string} data.unsubscribeUrl  Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function limitReachedEmail({ used, limit, period, addPaymentUrl, unsubscribeUrl }) {
  const safeUsed = escapeHtml(String(used ?? ''));
  const safeLimit = escapeHtml(String(limit ?? ''));
  const safePeriod = escapeHtml(period || '');
  const safeAddPaymentUrl = escapeHtml(addPaymentUrl || '');

  const subject = 'Free capture limit reached';
  const preheaderText = `You have used all ${limit} free captures for ${period}. Add a payment method to resume capturing.`;

  const bodyHtml = `
    <!-- Alert banner: error style (more urgent than approaching-limit) -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.errorBg};border-left:4px solid ${colors.error};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.errorText};line-height:1.2;">Free capture limit reached</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 20px 0;">You have used all of your free captures for <strong>${safePeriod}</strong>. New captures are paused until you add a payment method.</p>

          <!-- Usage indicator -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.errorBg};border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0;font-family:${fontSans};font-size:32px;font-weight:700;color:${colors.errorText};">${safeUsed} / ${safeLimit}</p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:13px;color:${colors.errorText};">limit reached</p>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px 0;">Add a payment method to immediately resume capturing. Billing is usage-based &mdash; you only pay for what you use above the free tier.</p>

          <!-- CTA button -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.error};">
                <a href="${safeAddPaymentUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:4px;">Add Payment Method</a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  const text = [
    'FREE CAPTURE LIMIT REACHED',
    '==========================',
    '',
    `Period: ${period || '(unknown)'}`,
    `Captures used: ${used} of ${limit}`,
    '',
    'New captures are paused until you add a payment method.',
    'Billing is usage-based -- you only pay for what you use above the free tier.',
    '',
    `Add payment method: ${addPaymentUrl || ''}`,
    '',
    '---',
    `Unsubscribe from limit-reached alerts: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
