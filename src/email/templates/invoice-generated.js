/*
 * invoice-generated.js -- Email template for invoice-generated notifications.
 *
 * Sent when Stripe generates an invoice for a tenant's usage. Informational
 * tone; the payment is typically collected automatically.
 *
 * Data: { amountFormatted, currency, period, portalUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the invoice-generated email.
 *
 * @param {object} data
 * @param {string} data.amountFormatted  Human-readable amount, e.g. "€4.75"
 * @param {string} data.currency         Currency code, e.g. "EUR"
 * @param {string} data.period           Billing period string, e.g. "March 2026"
 * @param {string} data.portalUrl        URL to the Stripe billing portal
 * @param {string} data.unsubscribeUrl   Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function invoiceGeneratedEmail({ amountFormatted, currency, period, portalUrl, unsubscribeUrl }) {
  const safeAmount = escapeHtml(amountFormatted || '');
  const safeCurrency = escapeHtml(currency || '');
  const safePeriod = escapeHtml(period || '');
  const safePortalUrl = escapeHtml(portalUrl || '');

  const subject = `Invoice generated: ${amountFormatted || ''} ${currency || ''}`;
  const preheaderText = `Your invoice for ${period} has been generated: ${amountFormatted} ${currency}.`;

  const bodyHtml = `
    <!-- Alert banner: info style -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.infoBg};border-left:4px solid ${colors.info};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.infoText};line-height:1.2;">Invoice generated</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 20px 0;">An invoice has been generated for your usage in <strong>${safePeriod}</strong>.</p>

          <!-- Invoice summary -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.surfaceMuted};border-radius:4px;">
            <tr>
              <td style="padding:20px 24px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};width:120px;">Period</td>
                    <td style="padding:6px 0;font-size:14px;color:${colors.text};">${safePeriod}</td>
                  </tr>
                  <tr>
                    <td style="padding:6px 0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};">Amount</td>
                    <td style="padding:6px 0;font-size:20px;font-weight:700;color:${colors.text};">${safeAmount} <span style="font-size:14px;font-weight:400;color:${colors.textMuted};">${safeCurrency}</span></td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px 0;">If you have a payment method on file, this invoice will be collected automatically. View or download your invoice from the billing portal.</p>

          <!-- CTA button -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.primary};">
                <a href="${safePortalUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:4px;">View Invoice</a>
              </td>
            </tr>
          </table>

        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  const text = [
    'INVOICE GENERATED',
    '=================',
    '',
    `Period: ${period || '(unknown)'}`,
    `Amount: ${amountFormatted || ''} ${currency || ''}`,
    '',
    'If you have a payment method on file, this invoice will be collected automatically.',
    'View or download your invoice from the billing portal.',
    '',
    `Billing portal: ${portalUrl || ''}`,
    '',
    '---',
    `Unsubscribe from invoice notifications: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
