/*
 * limit-reached.js -- Email template for quota-limit-reached notifications.
 *
 * Sent when a tenant exhausts their free captures or free storage for the
 * billing period. More urgent in tone than approaching-limit. Sent at most once
 * per period.
 *
 * Data: { resource, used, limit, requested, period, addPaymentUrl, resetsAt, unsubscribeUrl }
 * With requested (backlog #35) it tells a free tenant that a batch asked for
 * more captures than are left; smaller batches still go through.
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/**
 * Render the limit-reached email.
 *
 * @param {object} data
 * @param {string} [data.resource]      'captures' (default) or 'storage'
 * @param {number|string} data.used     Captures used, or formatted storage used
 * @param {number|string} data.limit    Free capture limit, or formatted storage limit
 * @param {string} data.period          Billing period string, e.g. "March 2026"
 * @param {string} data.addPaymentUrl   URL to add a payment method
 * @param {number} [data.requested]     Size of a refused batch, when captures are still left
 * @param {string} [data.resetsAt]      ISO timestamp when the free allowance resets
 * @param {string} data.unsubscribeUrl  Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function limitReachedEmail({ resource = 'captures', used, limit, requested, period, addPaymentUrl, resetsAt, unsubscribeUrl }) {
  const isStorage = resource === 'storage';
  const isBatch = !isStorage && requested !== undefined;
  const left = isBatch ? limit - used : 0;
  const safeUsed = escapeHtml(String(used ?? ''));
  const safeLimit = escapeHtml(String(limit ?? ''));
  const safePeriod = escapeHtml(period || '');
  const safeAddPaymentUrl = escapeHtml(addPaymentUrl || '');
  const resetDate = resetsAt
    ? new Date(resetsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    : '';
  const resetSentence = resetDate ? ` Your free allowance resets on ${resetDate}.` : '';

  let subject;
  let preheaderText;
  let intro;
  let nextStep;
  if (isBatch) {
    subject = `Batch refused: ${requested} captures requested, ${left} free ${left === 1 ? 'capture' : 'captures'} left`;
    preheaderText = `Your batch of ${requested} captures was refused because ${left} free ${left === 1 ? 'capture is' : 'captures are'} left for ${period}. Send a smaller batch, or add a payment method.`;
    nextStep = `Send a batch of up to ${left} URLs, or add a payment method to pay for captures beyond the free ones.`;
    intro = `Your batch of ${escapeHtml(String(requested))} captures was refused, because ${escapeHtml(String(left))} of your free captures for <strong>${safePeriod}</strong> ${left === 1 ? 'is' : 'are'} left. WRL refuses the whole batch rather than capturing part of it. ${escapeHtml(nextStep)}${escapeHtml(resetSentence)}`;
  } else {
    subject = isStorage ? 'Free storage limit reached' : 'Free capture limit reached';
    preheaderText = isStorage
      ? `Your captures for ${period} have used all ${limit} of free storage. Add a payment method to resume capturing.`
      : `You have used all ${limit} free captures for ${period}. Add a payment method to resume capturing.`;
    nextStep = 'New captures are paused until you add a payment method.';
    intro = isStorage
      ? `Your captures for <strong>${safePeriod}</strong> have used all of the storage in the free tier. ${nextStep}${escapeHtml(resetSentence)}`
      : `You have used all of your free captures for <strong>${safePeriod}</strong>. ${nextStep}${escapeHtml(resetSentence)}`;
  }

  const bodyHtml = `
    <!-- Alert banner: error style (more urgent than approaching-limit) -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.errorBg};border-left:4px solid ${colors.error};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.errorText};line-height:1.2;">${subject}</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <p style="margin:0 0 20px 0;">${intro}</p>

          <!-- Usage indicator -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.errorBg};border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;">
                <p style="margin:0;font-family:${fontSans};font-size:32px;font-weight:700;color:${colors.errorText};">${safeUsed} / ${safeLimit}</p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:13px;color:${colors.errorText};">${isBatch ? 'captures used this period' : 'limit reached'}</p>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 24px 0;">${isBatch ? 'Add a payment method to pay for captures beyond the free ones.' : 'Add a payment method to immediately resume capturing.'} Billing is usage-based &mdash; you only pay for what you use above the free tier.</p>

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
    subject.toUpperCase(),
    '='.repeat(subject.length),
    '',
    `Period: ${period || '(unknown)'}`,
    isStorage ? `Storage used: ${used} of ${limit}` : `Captures used: ${used} of ${limit}`,
    '',
    ...(isBatch ? [`Captures requested: ${requested}`, `Free captures left: ${left}`, ''] : []),
    `${nextStep}${resetSentence}`,
    'Billing is usage-based -- you only pay for what you use above the free tier.',
    '',
    `Add payment method: ${addPaymentUrl || ''}`,
    '',
    '---',
    `Unsubscribe from limit-reached alerts: ${unsubscribeUrl || ''}`,
  ].join('\n');

  return { html, text, subject };
}
