/*
 * approaching-limit.js -- Email template for approaching-quota-limit warnings.
 *
 * Sent when a tenant has used enough of their free captures that a warning
 * threshold is crossed. Sent at most once per billing period (deduped by
 * notification_sent table).
 *
 * Data: { used, limit, period, addPaymentUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the approaching-limit email.
 *
 * @param {object} data
 * @param {number} data.used            Captures used so far this period
 * @param {number} data.limit           Free capture limit for this period
 * @param {string} data.period          Billing period string, e.g. "March 2026"
 * @param {string} data.addPaymentUrl   URL to add a payment method
 * @param {string} data.unsubscribeUrl  Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function approachingLimitEmail({ used, limit, period, addPaymentUrl, unsubscribeUrl }) {
  const safeUsed = escapeHtml(String(used ?? ''));
  const safeLimit = escapeHtml(String(limit ?? ''));
  const safePeriod = escapeHtml(period || '');
  const safeAddPaymentUrl = escapeHtml(addPaymentUrl || '');

  const subject = `Approaching free capture limit (${used}/${limit})`;
  const preheaderText = `You have used ${used} of ${limit} free captures for ${period}. Add a payment method to continue uninterrupted.`;

  const bodyHtml = `
    <!-- Alert banner: warning style -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.warningBg};border-left:4px solid ${colors.warning};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.warningText};line-height:1.2;">Approaching free capture limit</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 20px 0;">You are approaching your free capture limit for <strong>${safePeriod}</strong>.</p>

          <!-- Usage indicator -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.surfaceMuted};border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0;font-family:${fontSans};font-size:32px;font-weight:700;color:${colors.warningText};">${safeUsed} / ${safeLimit}</p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:13px;color:${colors.textMuted};">captures used this period</p>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px 0;">Add a payment method to continue capturing beyond the free limit. Billing is usage-based &mdash; you only pay for what you use.</p>

          <!-- CTA button -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.primary};">
                <a href="${safeAddPaymentUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:4px;">Add Payment Method</a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  const text = [
    'APPROACHING FREE CAPTURE LIMIT',
    '==============================',
    '',
    `Period: ${period || '(unknown)'}`,
    `Captures used: ${used} of ${limit}`,
    '',
    'Add a payment method to continue capturing beyond the free limit.',
    '',
    `Add payment method: ${addPaymentUrl || ''}`,
    '',
    '---',
    `Unsubscribe from approaching-limit warnings: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
