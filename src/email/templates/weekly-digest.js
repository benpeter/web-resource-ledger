/*
 * weekly-digest.js -- Email template for weekly capture digest notifications.
 *
 * Sent weekly to summarize capture activity across all schedules. Includes a
 * table of schedule results, capped at 20 rows to keep the email under Gmail's
 * 102KB clip limit.
 *
 * Data: { periodStart, periodEnd, schedules, dashboardUrl, unsubscribeUrl }
 */

import { escapeHtml } from '../../verify-page.js';
import { emailLayout } from '../email-layout.js';
import { tokens } from '../email-tokens.js';

const { colors, fontSans } = tokens;

/** Maximum number of schedule rows to include in the digest table. */
const MAX_SCHEDULES = 20;

/**
 * Render one table row for a schedule in the digest.
 *
 * @param {{ url: string, total: number, succeeded: number, failed: number }} schedule
 * @param {boolean} isEven  Alternate row shading
 * @returns {string}
 */
function renderScheduleRow(schedule, isEven) {
  const safeUrl = escapeHtml(schedule.url || '');
  const total = Number(schedule.total) || 0;
  const succeeded = Number(schedule.succeeded) || 0;
  const failed = Number(schedule.failed) || 0;
  const rowBg = isEven ? colors.surfaceMuted : colors.surface;
  const failedColor = failed > 0 ? colors.errorText : colors.text;

  return `
            <tr>
              <td style="padding:8px 12px;font-family:${fontSans};font-size:13px;color:${colors.text};border-bottom:1px solid ${colors.borderSubtle};background-color:${rowBg};word-break:break-all;">${safeUrl}</td>
              <td style="padding:8px 12px;font-family:${fontSans};font-size:13px;color:${colors.text};border-bottom:1px solid ${colors.borderSubtle};background-color:${rowBg};text-align:center;">${total}</td>
              <td style="padding:8px 12px;font-family:${fontSans};font-size:13px;color:${colors.successText};border-bottom:1px solid ${colors.borderSubtle};background-color:${rowBg};text-align:center;">${succeeded}</td>
              <td style="padding:8px 12px;font-family:${fontSans};font-size:13px;color:${failedColor};border-bottom:1px solid ${colors.borderSubtle};background-color:${rowBg};text-align:center;font-weight:${failed > 0 ? '600' : '400'};">${failed}</td>
            </tr>`;
}

/**
 * Render the weekly-digest email.
 *
 * @param {object} data
 * @param {string} data.periodStart    Start of the digest period, e.g. "Mar 17"
 * @param {string} data.periodEnd      End of the digest period, e.g. "Mar 23"
 * @param {Array}  data.schedules      Array of { url, total, succeeded, failed }
 * @param {string} data.dashboardUrl   URL to the WRL dashboard
 * @param {string} data.unsubscribeUrl Unsubscribe URL for this notification type
 * @returns {{ html: string, text: string, subject: string }}
 */
export function weeklyDigestEmail({ periodStart, periodEnd, schedules, dashboardUrl, unsubscribeUrl }) {
  const safePeriodStart = escapeHtml(periodStart || '');
  const safePeriodEnd = escapeHtml(periodEnd || '');
  const safeDashboardUrl = escapeHtml(dashboardUrl || '');
  const allSchedules = Array.isArray(schedules) ? schedules : [];
  const displayedSchedules = allSchedules.slice(0, MAX_SCHEDULES);
  const hasMore = allSchedules.length > MAX_SCHEDULES;

  const totalCaptures = allSchedules.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const totalFailed = allSchedules.reduce((sum, s) => sum + (Number(s.failed) || 0), 0);

  const subject = `Weekly capture digest: ${periodStart} - ${periodEnd}`;
  const preheaderText = `${totalCaptures} captures across ${allSchedules.length} schedule${allSchedules.length === 1 ? '' : 's'} from ${periodStart} to ${periodEnd}.`;

  const scheduleRows = displayedSchedules.map((s, i) => renderScheduleRow(s, i % 2 === 1)).join('');

  const hasMoreRow = hasMore ? `
            <tr>
              <td colspan="4" style="padding:10px 12px;font-family:${fontSans};font-size:13px;color:${colors.textMuted};background-color:${colors.surfaceMuted};text-align:center;">
                ${allSchedules.length - MAX_SCHEDULES} more schedule${(allSchedules.length - MAX_SCHEDULES) === 1 ? '' : 's'} &mdash;
                <a href="${safeDashboardUrl}" style="color:${colors.info};text-decoration:underline;">View all in dashboard</a>
              </td>
            </tr>` : '';

  const noSchedulesRow = displayedSchedules.length === 0 ? `
            <tr>
              <td colspan="4" style="padding:16px 12px;font-family:${fontSans};font-size:13px;color:${colors.textMuted};text-align:center;">No scheduled captures ran during this period.</td>
            </tr>` : '';

  const bodyHtml = `
    <!-- Header banner: info style -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="background-color:${colors.infoBg};border-left:4px solid ${colors.info};padding:20px 32px;">
          <p style="margin:0;font-family:${fontSans};font-size:18px;font-weight:700;color:${colors.infoText};line-height:1.2;">Weekly capture digest</p>
          <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:14px;color:${colors.infoText};">${safePeriodStart} &ndash; ${safePeriodEnd}</p>
        </td>
      </tr>
    </table>

    <!-- Body content -->
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td style="padding:24px 32px 16px 32px;font-family:${fontSans};font-size:14px;color:${colors.text};line-height:1.5;">

          <!-- Summary stats -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;background-color:${colors.surfaceMuted};border-radius:4px;">
            <tr>
              <td style="padding:16px 20px;text-align:center;width:50%;border-right:1px solid ${colors.border};">
                <p style="margin:0;font-family:${fontSans};font-size:28px;font-weight:700;color:${colors.text};">${totalCaptures}</p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};">Total captures</p>
              </td>
              <td style="padding:16px 20px;text-align:center;width:50%;">
                <p style="margin:0;font-family:${fontSans};font-size:28px;font-weight:700;color:${totalFailed > 0 ? colors.errorText : colors.text};">${totalFailed}</p>
                <p style="margin:4px 0 0 0;font-family:${fontSans};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};">Failed</p>
              </td>
            </tr>
          </table>

          <!-- Schedule results table -->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid ${colors.border};border-radius:4px;overflow:hidden;">
            <!-- Table header -->
            <tr>
              <th style="padding:8px 12px;font-family:${fontSans};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};background-color:${colors.surfaceMuted};text-align:left;border-bottom:1px solid ${colors.border};">Schedule URL</th>
              <th style="padding:8px 12px;font-family:${fontSans};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};background-color:${colors.surfaceMuted};text-align:center;border-bottom:1px solid ${colors.border};width:60px;">Total</th>
              <th style="padding:8px 12px;font-family:${fontSans};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};background-color:${colors.surfaceMuted};text-align:center;border-bottom:1px solid ${colors.border};width:60px;">OK</th>
              <th style="padding:8px 12px;font-family:${fontSans};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:${colors.textMuted};background-color:${colors.surfaceMuted};text-align:center;border-bottom:1px solid ${colors.border};width:60px;">Failed</th>
            </tr>
            ${scheduleRows}${noSchedulesRow}${hasMoreRow}
          </table>

        </td>
      </tr>

      <tr>
        <td style="padding:0 32px 24px 32px;">
          <!-- CTA button -->
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td style="border-radius:4px;background-color:${colors.primary};">
                <a href="${safeDashboardUrl}" style="display:inline-block;padding:12px 24px;font-family:${fontSans};font-size:14px;font-weight:600;color:${colors.primaryText};text-decoration:none;border-radius:4px;">Open Dashboard</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>`;

  const html = emailLayout({ bodyHtml, unsubscribeUrl, preheaderText });

  // Plain text: build independently (not derived from HTML)
  const textLines = [
    'WEEKLY CAPTURE DIGEST',
    '=====================',
    '',
    `Period: ${periodStart || ''} - ${periodEnd || ''}`,
    `Total captures: ${totalCaptures}`,
    `Failed: ${totalFailed}`,
    '',
    'SCHEDULE RESULTS',
    '----------------',
  ];

  for (const s of displayedSchedules) {
    textLines.push(`URL: ${s.url || '(unknown)'}`);
    textLines.push(`  Total: ${s.total || 0}  OK: ${s.succeeded || 0}  Failed: ${s.failed || 0}`);
  }

  if (hasMore) {
    textLines.push(`... and ${allSchedules.length - MAX_SCHEDULES} more schedule(s)`);
  }

  if (displayedSchedules.length === 0) {
    textLines.push('No scheduled captures ran during this period.');
  }

  textLines.push('');
  textLines.push(`Dashboard: ${dashboardUrl || ''}`);
  textLines.push('');
  textLines.push('---');
  textLines.push(`Unsubscribe from weekly digest: ${unsubscribeUrl || ''}`);

  const text = textLines.join('\n');

  return { html, text, subject };
}
