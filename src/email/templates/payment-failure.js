/*
 * payment-failure.js -- Email template for payment failure notifications.
 *
 * Sent when a Stripe invoice payment attempt fails. High urgency -- the tenant
 * must update their payment method before the grace period expires or their
 * account will be suspended.
 *
 * Data: { gracePeriodEnd, portalUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the payment-failure email.
 *
 * @param {object} data
 * @param {string} data.gracePeriodEnd  ISO timestamp when the grace period expires
 * @param {string} data.portalUrl       URL to the Stripe billing portal
 * @param {string} data.unsubscribeUrl  Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function paymentFailureEmail({ gracePeriodEnd, portalUrl, unsubscribeUrl }) {
  const safeGracePeriodEnd = escapeHtml(gracePeriodEnd || '');
  const safePortalUrl = escapeHtml(portalUrl || '');

  const subject = 'Payment failed -- action required';
  const preheaderText = `Your payment failed. Update your payment method before ${gracePeriodEnd} to avoid service interruption.`;

  const bodyHtml = `
    <!-- Alert banner: error style, urgent -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.errorBg};border-left:4px solid ${colors.error};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.errorText};line-height:1.2;">Payment failed &mdash; action required</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 16px 0;">We were unable to collect payment for your latest invoice. Your account remains active during the grace period.</p>

          <!-- Grace period notice -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.errorBg};border-radius:4px;border:1px solid ${colors.error};">
            <tr>
              <td style="padding:16px 20px;">
                <p style="margin:0;font-family:${fontSans};font-size:13px;font-weight:600;color:${colors.errorText};">Grace period ends: <span style="font-weight:700;">${safeGracePeriodEnd}</span></p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:13px;color:${colors.errorText};">Captures will be paused if payment is not resolved by this date.</p>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px 0;">Please update your payment method in the billing portal to avoid any interruption to your service.</p>

          <!-- CTA button -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.error};">
                <a href="${safePortalUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:4px;">Update Payment Method</a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  const text = [
    'PAYMENT FAILED -- ACTION REQUIRED',
    '==================================',
    '',
    'We were unable to collect payment for your latest invoice.',
    'Your account remains active during the grace period.',
    '',
    `Grace period ends: ${gracePeriodEnd || '(unknown)'}`,
    'Captures will be paused if payment is not resolved by this date.',
    '',
    'Please update your payment method to avoid service interruption.',
    '',
    `Billing portal: ${portalUrl || ''}`,
    '',
    '---',
    `Unsubscribe from payment failure alerts: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
