// tva
// Tests for all six email templates.
// Verifies: { html, text, subject } shape, required elements, XSS escaping,
// plain text content, weekly digest capping at 20 schedules.

import { describe, it, expect } from 'vitest';
import { captureFailureEmail } from '../src/email/templates/capture-failure.js';
import { approachingLimitEmail } from '../src/email/templates/approaching-limit.js';
import { limitReachedEmail } from '../src/email/templates/limit-reached.js';
import { invoiceGeneratedEmail } from '../src/email/templates/invoice-generated.js';
import { paymentFailureEmail } from '../src/email/templates/payment-failure.js';
import { weeklyDigestEmail } from '../src/email/templates/weekly-digest.js';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const UNSUB_URL = 'https://api.webresourceledger.com/v1/notifications/unsubscribe?token=testtoken';

const CAPTURE_FAILURE_DATA = {
  url: 'https://example.com/page',
  errorCategory: 'render_timeout',
  failedAt: '2026-03-24T10:00:00.000Z',
  captureDetailUrl: 'https://api.webresourceledger.com/v1/captures/cap_abc/certificate',
  unsubscribeUrl: UNSUB_URL,
};

const APPROACHING_LIMIT_DATA = {
  used: 180,
  limit: 200,
  period: 'March 2026',
  addPaymentUrl: 'https://api.webresourceledger.com/v1/billing/checkout',
  unsubscribeUrl: UNSUB_URL,
};

const LIMIT_REACHED_DATA = {
  used: 200,
  limit: 200,
  period: 'March 2026',
  addPaymentUrl: 'https://api.webresourceledger.com/v1/billing/checkout',
  unsubscribeUrl: UNSUB_URL,
};

const INVOICE_GENERATED_DATA = {
  amountFormatted: '€4.75',
  currency: 'EUR',
  period: 'March 2026',
  portalUrl: 'https://billing.stripe.com/session/test',
  unsubscribeUrl: UNSUB_URL,
};

const PAYMENT_FAILURE_DATA = {
  gracePeriodEnd: '2026-03-31T00:00:00.000Z',
  portalUrl: 'https://billing.stripe.com/session/test',
  unsubscribeUrl: UNSUB_URL,
};

const WEEKLY_DIGEST_DATA = {
  periodStart: 'Mar 17',
  periodEnd: 'Mar 23',
  schedules: [
    { url: 'https://example.com', total: 7, succeeded: 6, failed: 1 },
    { url: 'https://other.com', total: 7, succeeded: 7, failed: 0 },
  ],
  dashboardUrl: 'https://webresourceledger.com/ui',
  unsubscribeUrl: UNSUB_URL,
};

// ---------------------------------------------------------------------------
// Helper: build 25 schedules to test the cap
// ---------------------------------------------------------------------------

function buildSchedules(count) {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://example.com/page-${i + 1}`,
    total: 5,
    succeeded: 5,
    failed: 0,
  }));
}

// ---------------------------------------------------------------------------
// capture-failure
// ---------------------------------------------------------------------------

describe('captureFailureEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject includes the URL', () => {
    const { subject } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(subject).toContain('https://example.com/page');
  });

  it('HTML contains the heading', () => {
    const { html } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(html).toContain('Capture failed');
  });

  it('HTML contains the CTA link to captureDetailUrl', () => {
    const { html } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(html).toContain(CAPTURE_FAILURE_DATA.captureDetailUrl);
    expect(html).toContain('View Capture Details');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('HTML escapes a script tag injected into url', () => {
    const { html } = captureFailureEmail({
      ...CAPTURE_FAILURE_DATA,
      url: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('HTML escapes a script tag injected into errorCategory', () => {
    const { html } = captureFailureEmail({
      ...CAPTURE_FAILURE_DATA,
      errorCategory: '<img src=x onerror=alert(1)>',
    });
    expect(html).not.toContain('<img src=x');
  });

  it('plain text includes URL, error, failedAt', () => {
    const { text } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(text).toContain('https://example.com/page');
    expect(text).toContain('render_timeout');
    expect(text).toContain('2026-03-24T10:00:00.000Z');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(text).toContain(UNSUB_URL);
  });

  it('plain text does not contain HTML tags', () => {
    const { text } = captureFailureEmail(CAPTURE_FAILURE_DATA);
    expect(text).not.toMatch(/<[a-z]/i);
  });
});

// ---------------------------------------------------------------------------
// approaching-limit
// ---------------------------------------------------------------------------

describe('approachingLimitEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject includes used and limit', () => {
    const { subject } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(subject).toContain('180');
    expect(subject).toContain('200');
  });

  it('HTML contains the heading', () => {
    const { html } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(html).toContain('Approaching free capture limit');
  });

  it('HTML contains the CTA link to addPaymentUrl', () => {
    const { html } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(html).toContain(APPROACHING_LIMIT_DATA.addPaymentUrl);
    expect(html).toContain('Add Payment Method');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('plain text includes used, limit, period', () => {
    const { text } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(text).toContain('180');
    expect(text).toContain('200');
    expect(text).toContain('March 2026');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = approachingLimitEmail(APPROACHING_LIMIT_DATA);
    expect(text).toContain(UNSUB_URL);
  });
});

// ---------------------------------------------------------------------------
// limit-reached
// ---------------------------------------------------------------------------

describe('limitReachedEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject is "Free capture limit reached"', () => {
    const { subject } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(subject).toBe('Free capture limit reached');
  });

  it('HTML contains the heading', () => {
    const { html } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(html).toContain('Free capture limit reached');
  });

  it('HTML contains the CTA link to addPaymentUrl', () => {
    const { html } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(html).toContain(LIMIT_REACHED_DATA.addPaymentUrl);
    expect(html).toContain('Add Payment Method');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('plain text includes used, limit, period', () => {
    const { text } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(text).toContain('200');
    expect(text).toContain('March 2026');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = limitReachedEmail(LIMIT_REACHED_DATA);
    expect(text).toContain(UNSUB_URL);
  });
});

// ---------------------------------------------------------------------------
// invoice-generated
// ---------------------------------------------------------------------------

describe('invoiceGeneratedEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject includes amount and currency', () => {
    const { subject } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(subject).toContain('€4.75');
    expect(subject).toContain('EUR');
  });

  it('HTML contains the heading', () => {
    const { html } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(html).toContain('Invoice generated');
  });

  it('HTML contains the CTA link to portalUrl', () => {
    const { html } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(html).toContain(INVOICE_GENERATED_DATA.portalUrl);
    expect(html).toContain('View Invoice');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('plain text includes amount, currency, period', () => {
    const { text } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(text).toContain('€4.75');
    expect(text).toContain('EUR');
    expect(text).toContain('March 2026');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = invoiceGeneratedEmail(INVOICE_GENERATED_DATA);
    expect(text).toContain(UNSUB_URL);
  });
});

// ---------------------------------------------------------------------------
// payment-failure
// ---------------------------------------------------------------------------

describe('paymentFailureEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject is "Payment failed -- action required"', () => {
    const { subject } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(subject).toBe('Payment failed -- action required');
  });

  it('HTML contains the heading', () => {
    const { html } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(html).toContain('Payment failed');
  });

  it('HTML contains the CTA link to portalUrl', () => {
    const { html } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(html).toContain(PAYMENT_FAILURE_DATA.portalUrl);
    expect(html).toContain('Update Payment Method');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('plain text includes gracePeriodEnd', () => {
    const { text } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(text).toContain('2026-03-31T00:00:00.000Z');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = paymentFailureEmail(PAYMENT_FAILURE_DATA);
    expect(text).toContain(UNSUB_URL);
  });
});

// ---------------------------------------------------------------------------
// weekly-digest
// ---------------------------------------------------------------------------

describe('weeklyDigestEmail', () => {
  it('returns { html, text, subject }', () => {
    const result = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(typeof result.html).toBe('string');
    expect(typeof result.text).toBe('string');
    expect(typeof result.subject).toBe('string');
  });

  it('subject includes periodStart and periodEnd', () => {
    const { subject } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(subject).toContain('Mar 17');
    expect(subject).toContain('Mar 23');
  });

  it('HTML contains the heading', () => {
    const { html } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(html).toContain('Weekly capture digest');
  });

  it('HTML contains the CTA link to dashboardUrl', () => {
    const { html } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(html).toContain(WEEKLY_DIGEST_DATA.dashboardUrl);
    expect(html).toContain('Open Dashboard');
  });

  it('HTML contains the unsubscribe link', () => {
    const { html } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(html).toContain(UNSUB_URL);
  });

  it('HTML contains schedule URLs', () => {
    const { html } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(html).toContain('https://example.com');
    expect(html).toContain('https://other.com');
  });

  it('plain text includes schedule URLs', () => {
    const { text } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(text).toContain('https://example.com');
    expect(text).toContain('https://other.com');
  });

  it('plain text includes succeeded and failed counts', () => {
    const { text } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(text).toContain('OK: 6');
    expect(text).toContain('Failed: 1');
  });

  it('plain text includes unsubscribe URL', () => {
    const { text } = weeklyDigestEmail(WEEKLY_DIGEST_DATA);
    expect(text).toContain(UNSUB_URL);
  });

  it('caps schedule table at 20 rows', () => {
    const { html, text } = weeklyDigestEmail({
      ...WEEKLY_DIGEST_DATA,
      schedules: buildSchedules(25),
    });
    // Should include pages 1-20
    expect(html).toContain('https://example.com/page-20');
    // Should NOT include page 21
    expect(html).not.toContain('https://example.com/page-21');
    // Plain text same cap
    expect(text).toContain('https://example.com/page-20');
    expect(text).not.toContain('https://example.com/page-21');
  });

  it('includes "View all in dashboard" when schedules exceed cap', () => {
    const { html, text } = weeklyDigestEmail({
      ...WEEKLY_DIGEST_DATA,
      schedules: buildSchedules(25),
    });
    expect(html).toContain('View all in dashboard');
    expect(text).toContain('5 more schedule(s)');
  });

  it('handles empty schedules array', () => {
    const result = weeklyDigestEmail({ ...WEEKLY_DIGEST_DATA, schedules: [] });
    expect(result.html).toContain('No scheduled captures ran');
    expect(result.text).toContain('No scheduled captures ran');
  });

  it('HTML escapes a script tag injected into a schedule URL', () => {
    const { html } = weeklyDigestEmail({
      ...WEEKLY_DIGEST_DATA,
      schedules: [{ url: '<script>alert(1)</script>', total: 1, succeeded: 1, failed: 0 }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// Cross-template: HTML structure invariants
// ---------------------------------------------------------------------------

describe('all templates -- shared layout invariants', () => {
  const templates = [
    ['captureFailureEmail', captureFailureEmail(CAPTURE_FAILURE_DATA)],
    ['approachingLimitEmail', approachingLimitEmail(APPROACHING_LIMIT_DATA)],
    ['limitReachedEmail', limitReachedEmail(LIMIT_REACHED_DATA)],
    ['invoiceGeneratedEmail', invoiceGeneratedEmail(INVOICE_GENERATED_DATA)],
    ['paymentFailureEmail', paymentFailureEmail(PAYMENT_FAILURE_DATA)],
    ['weeklyDigestEmail', weeklyDigestEmail(WEEKLY_DIGEST_DATA)],
  ];

  for (const [name, result] of templates) {
    it(`${name} HTML starts with DOCTYPE`, () => {
      expect(result.html.trimStart()).toMatch(/^<!DOCTYPE html>/i);
    });

    it(`${name} HTML contains Web Resource Ledger wordmark`, () => {
      expect(result.html).toContain('Web Resource Ledger');
    });

    it(`${name} HTML contains footer with Marburg, Germany`, () => {
      expect(result.html).toContain('Marburg, Germany');
    });

    it(`${name} HTML is under 80KB`, () => {
      expect(new TextEncoder().encode(result.html).length).toBeLessThan(80 * 1024);
    });

    it(`${name} plain text is independent from HTML (no HTML tags)`, () => {
      // Plain text must be built independently -- not stripped from HTML
      expect(result.text).not.toMatch(/<[a-z]/i);
    });
  }
});
